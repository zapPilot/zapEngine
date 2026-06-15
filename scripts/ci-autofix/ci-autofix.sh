#!/usr/bin/env bash
set -euo pipefail

# scripts/ci-autofix/ci-autofix.sh
#
# Portable CI auto-fixer.  Single entry point for autonomous repair:
#   pnpm ci-autofix -- --model provider/model
#
# 1. Runs all CI jobs in parallel (via detect.sh).
# 2. Picks the highest-priority failure from result.json.
# 3. Hands a fresh opencode session the failure; the agent reruns it to self-verify.
# 4. Reruns only that job until it passes.
# 5. Re-detects all jobs; repeats for remaining failures.
# 6. Finishes with the canonical gate (gate.sh).
#
# Repo-specific config lives in registry.sh -- the only file you customize per repo.

# ── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  pnpm ci-autofix -- --model PROVIDER/MODEL [options]

Required:
  --model ID          OpenCode model ID used for every fresh agent session

Options:
  --max-iters N       Stop after N repair attempts; 0 = unlimited (default: 0)
  --timeout SECONDS   Per-job timeout; 0 disables it (default: 900)
  --agent NAME        OpenCode agent name (default: ci-fixer)
  -h, --help          Show this help
EOF
}

# ── Defaults ─────────────────────────────────────────────────────────────────

MODEL=""
MAX_ITERS=0
ITER_TIMEOUT=900
AGENT="ci-fixer"
NO_PROGRESS_LIMIT=3
COMPACT_LOG_MAX=49152   # 48 KiB

# ── Parse args ───────────────────────────────────────────────────────────────

while [ "$#" -gt 0 ]; do
  case "$1" in
    --model)
      [ "$#" -ge 2 ] || { echo "Error: --model requires a value" >&2; exit 64; }
      MODEL="$2"; shift 2 ;;
    --max-iters)
      [ "$#" -ge 2 ] || { echo "Error: --max-iters requires a value" >&2; exit 64; }
      MAX_ITERS="$2"; shift 2 ;;
    --timeout)
      [ "$#" -ge 2 ] || { echo "Error: --timeout requires a value" >&2; exit 64; }
      ITER_TIMEOUT="$2"; shift 2 ;;
    --agent)
      [ "$#" -ge 2 ] || { echo "Error: --agent requires a value" >&2; exit 64; }
      AGENT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift ;;
    *) echo "Error: unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [ -z "$MODEL" ]; then
  echo "Error: --model is required" >&2
  usage >&2
  exit 64
fi

for vn in MAX_ITERS ITER_TIMEOUT; do
  if ! [[ "${!vn}" =~ ^[0-9]+$ ]]; then
    echo "Error: --${vn,,} must be a non-negative integer" >&2
    exit 64
  fi
done

# ── Bootstrap ────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This script lives at <repo>/scripts/ci-autofix/; repo root is two levels up.
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

source "$SCRIPT_DIR/registry.sh"

if ! command -v opencode >/dev/null 2>&1; then
  echo "Error: opencode CLI not found in PATH" >&2
  exit 69
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: must run inside a Git working tree" >&2
  exit 69
fi

TIMEOUT_BIN=""
if [ "$ITER_TIMEOUT" -gt 0 ]; then
  if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_BIN="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_BIN="gtimeout"
  else
    echo "Warning: no timeout/gtimeout in PATH; running without a per-job timeout." >&2
    echo "         (install coreutils for timeout support, or pass --timeout 0 to silence.)" >&2
    ITER_TIMEOUT=0
  fi
fi

# ── Directories ──────────────────────────────────────────────────────────────

LOG_DIR="$ROOT_DIR/.agent-loop"
AI_DIR="$ROOT_DIR/.ai-verify"
AI_LOG_DIR="$AI_DIR/logs"
RESULT_JSON="$AI_DIR/result.json"

mkdir -p "$LOG_DIR" "$AI_LOG_DIR"
rm -f "$LOG_DIR"/iteration-*.log "$LOG_DIR"/failure-*.log \
  "$LOG_DIR"/agent-*.log "$LOG_DIR/blocker-report.txt"
STATE_DIR="$LOG_DIR/state-$$"
mkdir -p "$STATE_DIR"
trap 'rm -rf "$STATE_DIR"' EXIT

# ── Utility functions ────────────────────────────────────────────────────────

hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

# Snapshot the full working tree state (tracked + untracked) as a hash.
working_tree_signature() {
  {
    git diff --binary HEAD 2>/dev/null || true
    git diff --binary --cached 2>/dev/null || true
    while IFS= read -r path; do
      printf '\nUNTRACKED:%s\n' "$path"
      if [ -f "$path" ]; then
        hash_stream < "$path"
      fi
    done < <(git ls-files --others --exclude-standard | LC_ALL=C sort)
  } | hash_stream
}

# Create a Git tree object containing tracked and untracked working-tree files.
create_worktree_tree() {
  local tmp_index
  local tree
  tmp_index="$(mktemp "$STATE_DIR/worktree-index-XXXXXX")"

  GIT_INDEX_FILE="$tmp_index" git read-tree HEAD
  GIT_INDEX_FILE="$tmp_index" git add -A
  tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"
  rm -f "$tmp_index"
  printf '%s\n' "$tree"
}

# Capture both the complete working-tree contents and the exact Git index.
# The returned snapshot directory can restore staged, unstaged, and untracked state.
create_snapshot() {
  local label="$1"
  local snapshot_dir="$STATE_DIR/$label"
  local index_path

  mkdir -p "$snapshot_dir"
  create_worktree_tree > "$snapshot_dir/tree"
  index_path="$(git rev-parse --git-path index)"
  cp "$index_path" "$snapshot_dir/index"
  printf '%s\n' "$snapshot_dir"
}

# Restore all state captured by create_snapshot(). Files introduced after the
# snapshot are removed before the saved tree and exact index are restored.
restore_snapshot() {
  local snapshot_dir="$1"
  local target_tree
  local current_tree
  local index_path
  local tmp_index
  target_tree="$(cat "$snapshot_dir/tree")"
  current_tree="$(create_worktree_tree)"

  while IFS= read -r -d '' path; do
    rm -rf -- "$path"
  done < <(
    git diff-tree -r -z --name-only --no-commit-id --diff-filter=A \
      "$target_tree" "$current_tree"
  )

  tmp_index="$(mktemp "$STATE_DIR/restore-index-XXXXXX")"
  GIT_INDEX_FILE="$tmp_index" git read-tree "$target_tree"
  GIT_INDEX_FILE="$tmp_index" git checkout-index -a -f
  rm -f "$tmp_index"

  index_path="$(git rev-parse --git-path index)"
  cp "$snapshot_dir/index" "$index_path"
}

is_protected_path() {
  local path="$1"
  # Generic base (portable across repos): the tool's own files, VCS/CI config,
  # lockfiles, coverage, and agent policy docs. package.json and snapshots are
  # intentionally editable -- the agent fixes deps via the package manager and
  # may refresh genuinely-stale snapshots; faking green is blocked by prompt.
  case "$path" in
    pnpm-lock.yaml|package-lock.json|*/package-lock.json|yarn.lock|bun.lock|bun.lockb|\
    .github/workflows/*|\
    scripts/ci-autofix/*|\
    .opencode/agents/*|\
    *coverage*|\
    AGENTS.md|*/AGENTS.md|CLAUDE.md|*/CLAUDE.md|GEMINI.md|*/GEMINI.md)
      return 0 ;;
  esac
  # Repo-specific extras declared in registry.sh ($CI_PROTECTED_PATHS,
  # whitespace-separated globs). Empty/unset in repos that need no extras.
  local glob
  for glob in ${CI_PROTECTED_PATHS:-}; do
    # shellcheck disable=SC2254
    case "$path" in
      $glob) return 0 ;;
    esac
  done
  return 1
}

# List paths whose contents differ from a snapshot.
changed_paths_since_snapshot() {
  local snapshot_dir="$1"
  local base_tree
  local current_tree
  base_tree="$(cat "$snapshot_dir/tree")"
  current_tree="$(create_worktree_tree)"
  git diff-tree -r --name-only --no-commit-id "$base_tree" "$current_tree" 2>/dev/null || true
}

# Check if agent touched any protected path since a tree snapshot.
# Returns 0 if violation found, 1 if clean.
check_protected_violation() {
  local snapshot_dir="$1"
  local found=0
  local path
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if is_protected_path "$path"; then
      found=1
      echo "Protected path modified by agent: $path" >&2
    fi
  done < <(changed_paths_since_snapshot "$snapshot_dir" | LC_ALL=C sort -u)
  return $((1 - found))
}

normalize_failure() {
  sed -E \
    -e 's#/Users/[^/ ]+#<HOME>#g' \
    -e 's#/private/var/folders/[^ ]+#<TMP>#g' \
    -e 's#[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.Z+-]+#<TIMESTAMP>#g' \
    -e 's#([.](ts|tsx|js|jsx|py)):[0-9]+:[0-9]+#\1:<line>#g' \
    -e 's#iteration [0-9]+#iteration <n>#Ig'
}

# Build a compact failure context from a log file.
# Order (most diagnostic first): last 120 lines, merged error context, first
# 20 lines.  Capped at COMPACT_LOG_MAX bytes; when over budget it keeps the
# FRONT, so the log tail (where CI tools usually print the failure) survives.
compact_log() {
  local log_file="$1"
  local max_bytes="${2:-$COMPACT_LOG_MAX}"

  if [ ! -f "$log_file" ]; then
    echo "(log file not found: $log_file)"
    return
  fi

  local result
  result="$(
    {
      echo "=== Log end (last 120 lines) ==="
      tail -n 120 "$log_file" 2>/dev/null || true

      echo ""
      echo "=== Error context (merged, most recent matches) ==="
      # grep -C merges overlapping context natively (-- separators); keep the
      # most recent matches so a flood of early warnings cannot crowd out the
      # real failure at the tail.
      grep -n -i -C 3 -E \
        'error[: ]|fail(ed|ure)|FAIL |✗|✘|ERR!|TS[0-9]{4}:|AssertionError|TypeError|SyntaxError|ModuleNotFoundError|ENOENT|stack trace|Traceback|pytest|FAILED' \
        "$log_file" 2>/dev/null | tail -n 200 || true

      echo ""
      echo "=== Log start (first 20 lines) ==="
      head -n 20 "$log_file" 2>/dev/null || true
    }
  )"

  local byte_count
  byte_count="$(printf '%s' "$result" | wc -c | tr -d ' ')"

  if [ "$byte_count" -gt "$max_bytes" ]; then
    # Keep the front (log tail + error context = most diagnostic). A here-string
    # has no upstream producer process for head to SIGPIPE, so no "Broken pipe"
    # noise under `set -o pipefail`.
    head -c "$max_bytes" <<<"$result"
    printf '\n--- LOG TRUNCATED (kept most-recent %s bytes of context) ---\n' "$max_bytes"
  else
    printf '%s\n' "$result"
  fi
}

write_blocker_report() {
  local reason="$1"
  local job_id="$2"
  local job_cmd="$3"
  local iteration="$4"
  local log_file="$5"

  {
    echo "Agent fix stopped: $reason"
    echo "Model:      $MODEL"
    echo "Job:        $job_id"
    echo "Command:    $job_cmd"
    echo "Iteration:  $iteration"
    echo ""
    echo "Working tree:"
    git status --short --untracked-files=all
    echo ""
    echo "Compact failure excerpt:"
    compact_log "$log_file" 4096
    echo ""
    echo "Full log: $log_file"
    echo ""
    echo "Files changed since baseline:"
    if [ -n "${BASELINE_TREE:-}" ]; then
      changed_paths_since_snapshot "$BASELINE_SNAPSHOT" | head -n 100
    else
      echo "(baseline not available)"
    fi
  } | tee "$LOG_DIR/blocker-report.txt" >&2
}

# ── Run parallel detection ───────────────────────────────────────────────────

DETECT_STATUS=0

run_detection() {
  echo ""
  echo "=== Running parallel detection ==="
  rm -f "$RESULT_JSON"

  local timeout_arg=""
  if [ "$ITER_TIMEOUT" -gt 0 ]; then
    timeout_arg="--timeout $ITER_TIMEOUT"
  fi

  set +e
  # shellcheck disable=SC2086
  bash "$SCRIPT_DIR/detect.sh" $timeout_arg
  DETECT_STATUS=$?
  set -e

  if [ ! -f "$RESULT_JSON" ]; then
    echo "Error: detection did not produce result.json" >&2
    DETECT_STATUS=1
  fi
}

# Read first failed job ID from result.json (by registry priority order).
first_failed_job() {
  if [ ! -f "$RESULT_JSON" ]; then
    return 1
  fi

  local id status

  # Prefer jq: exact id match, robust against future ids that share a prefix.
  if command -v jq >/dev/null 2>&1; then
    for id in $CORE_CI_JOB_IDS; do
      status="$(jq -r --arg id "$id" \
        '.jobs[]? | select(.id == $id) | .status' "$RESULT_JSON" 2>/dev/null \
        | head -1)" || true
      if [ "$status" = "failed" ] || [ "$status" = "timed_out" ]; then
        echo "$id"
        return 0
      fi
    done
    return 1
  fi

  # Fallback without jq. result.json writes one job per line, so the id and its
  # status live on the same line; the closing quote anchors the id match so a
  # short id cannot match a longer one as a substring.
  for id in $CORE_CI_JOB_IDS; do
    status="$(
      grep -E "\"id\": \"${id}\"" "$RESULT_JSON" 2>/dev/null \
      | head -1 \
      | sed 's/.*"status": *"\([^"]*\)".*/\1/'
    )" || true
    if [ "$status" = "failed" ] || [ "$status" = "timed_out" ]; then
      echo "$id"
      return 0
    fi
  done

  return 1
}

# ── Package-level localization ─────────────────────────────────────────────────
#
# detect.sh runs turbo jobs with --summarize, so .turbo/runs/*.json records the
# exit code of every (package, task). When a turbo job fails we read those
# summaries to find exactly which package(s) failed, then narrow both the rerun
# and the agent's excerpt to those packages. Non-turbo jobs (format/repo/
# contracts) and missing summaries fall back to whole-job behavior, so this is
# never worse than before. The final gate.sh always runs the full canonical
# command, so narrowing the inner loop can never fake a green.

TURBO_RUNS_DIR="$ROOT_DIR/.turbo/runs"

# Echo the turbo task tokens in a job command (space-separated), or nothing when
# it is not a `turbo run`. Tokens are everything between `turbo run` and the
# first flag, so multi-task jobs (e.g. analytics) are covered too.
turbo_tasks_from_cmd() {
  local cmd="$1"
  case "$cmd" in
    *"turbo run "*) ;;
    *) return 0 ;;
  esac
  local after="${cmd#*turbo run }"
  local tok out=""
  for tok in $after; do
    case "$tok" in
      --*) break ;;
      *) out="$out $tok" ;;
    esac
  done
  printf '%s\n' "${out# }"
}

# Echo the package names that failed for a turbo job (space-separated), or
# nothing. Primary source: turbo run summaries. Fallback: the streamed log's
# "<pkg>:<task>:" prefixes on error lines.
failing_packages() {
  local job_id="$1"
  local cmd tasks
  cmd="$(core_ci_job_command "$job_id")"
  tasks="$(turbo_tasks_from_cmd "$cmd")"
  [ -n "$tasks" ] || return 0   # not a turbo job -> no package localization

  local pkgs="" t found

  # Primary: machine-readable run summaries written by detect.sh's --summarize.
  if [ -d "$TURBO_RUNS_DIR" ] && command -v jq >/dev/null 2>&1; then
    for t in $tasks; do
      found="$(
        jq -r --arg t "$t" \
          '.tasks[]? | select(.task == $t and ((.execution.exitCode // 0) != 0)) | .package' \
          "$TURBO_RUNS_DIR"/*.json 2>/dev/null || true
      )"
      pkgs="$pkgs $found"
    done
  fi

  # Fallback: parse the streamed log's "<pkg>:<task>:" prefixes on error lines.
  if [ -z "${pkgs// /}" ]; then
    local log_file="$AI_LOG_DIR/$(core_ci_job_log "$job_id")"
    if [ -f "$log_file" ]; then
      for t in $tasks; do
        found="$(
          grep -E "^[^[:space:]:]+:${t}: " "$log_file" 2>/dev/null \
          | grep -i -E 'error|fail|✗|✘|TS[0-9]{4}' \
          | sed -E "s/^([^[:space:]:]+):${t}:.*/\1/" \
          | LC_ALL=C sort -u || true
        )"
        pkgs="$pkgs $found"
      done
    fi
  fi

  # `|| true`: grep -v exits 1 on all-empty input, which would abort under
  # `set -o pipefail` when this runs in a command substitution.
  printf '%s' "$pkgs" | tr ' ' '\n' | grep -v '^$' | LC_ALL=C sort -u \
    | tr '\n' ' ' | sed 's/ *$//' || true
}

# Rebuild a turbo command scoped to the given package(s): drop existing
# --filter=... args and add one --filter=<pkg> per failing package. No packages,
# or a non-turbo command, returns the command unchanged. Portable: no repo
# package names are hard-coded here.
scope_command() {
  local base_cmd="$1" pkgs="$2"
  [ -n "${pkgs// /}" ] || { printf '%s\n' "$base_cmd"; return 0; }
  case "$base_cmd" in
    *"turbo run "*) ;;
    *) printf '%s\n' "$base_cmd"; return 0 ;;
  esac

  local out="" tok
  for tok in $base_cmd; do
    case "$tok" in
      --filter=*) ;;            # drop the broad filter(s)
      *) out="$out $tok" ;;
    esac
  done
  local pkg
  for pkg in $pkgs; do
    out="$out --filter=$pkg"
  done
  printf '%s\n' "${out# }"
}

# Emit a package-scoped view of a turbo log: only lines prefixed with one of the
# given packages, plus turbo's overall footer. Whole file when no packages.
scoped_log_view() {
  local log_file="$1" pkgs="$2"
  if [ ! -f "$log_file" ] || [ -z "${pkgs// /}" ]; then
    cat "$log_file" 2>/dev/null || true
    return
  fi
  local pat="" pkg esc
  for pkg in $pkgs; do
    esc="$(printf '%s' "$pkg" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g')"
    pat="${pat:+$pat|}^${esc}:"
  done
  grep -E "$pat" "$log_file" 2>/dev/null || true
  # Keep turbo's overall failure footer for context.
  grep -E '^(  Tasks:|Failed:|  Time:|ERROR| ERROR )' "$log_file" 2>/dev/null || true
}

# Run a given command (already scoped to the failing package(s)), capturing
# output to log_file.
TARGETED_STATUS=0

run_targeted_job() {
  local cmd="$1"
  local log_file="$2"

  echo "=== Targeted rerun: $cmd ==="

  set +e
  if [ "$ITER_TIMEOUT" -gt 0 ]; then
    eval "$TIMEOUT_BIN $ITER_TIMEOUT $cmd" > "$log_file" 2>&1
  else
    eval "$cmd" > "$log_file" 2>&1
  fi
  TARGETED_STATUS=$?
  set -e
}

# ── Banner ───────────────────────────────────────────────────────────────────

echo "ci-autofix"
echo "  model:      $MODEL"
echo "  agent:      $AGENT"
echo "  max iters:  $MAX_ITERS (0 = unlimited)"
echo "  timeout:    ${ITER_TIMEOUT}s"

# ── Create baseline snapshot ─────────────────────────────────────────────────

BASELINE_SNAPSHOT="$(create_snapshot baseline)"
BASELINE_TREE="$(cat "$BASELINE_SNAPSHOT/tree")"
echo "  baseline:   $BASELINE_TREE"

# ── Main loop ────────────────────────────────────────────────────────────────

iteration=0
no_progress_count=0
opencode_failure_count=0
last_no_progress_key=""
final_gate_retries=0
FINAL_GATE_LIMIT=3

while true; do
  # ── Step 1: Full parallel detection ──────────────────────────────────────
  run_detection

  if [ "$DETECT_STATUS" -eq 0 ]; then
    # All jobs passed -- run final canonical gate
    echo ""
    echo "=== All detection jobs passed — running canonical verify:ci ==="

    set +e
    bash "$SCRIPT_DIR/gate.sh"
    final_status=$?
    set -e

    if [ "$final_status" -eq 0 ]; then
      echo ""
      echo "PASSED — core CI is green after $iteration repair attempt(s)"
      exit 0
    fi

    # Final gate failed -- re-enter detection loop
    final_gate_retries=$((final_gate_retries + 1))
    if [ "$final_gate_retries" -ge "$FINAL_GATE_LIMIT" ]; then
      echo "Canonical verify:ci failed $FINAL_GATE_LIMIT times; stopping" >&2
      exit 1
    fi
    echo "Canonical verify:ci failed -- re-entering repair loop (attempt $final_gate_retries/$FINAL_GATE_LIMIT)"
    continue
  fi

  if [ ! -f "$RESULT_JSON" ]; then
    echo "Error: result.json missing after detection; cannot proceed" >&2
    exit 1
  fi

  # ── Step 2: Pick first failed job ────────────────────────────────────────
  failed_job="$(first_failed_job)" || {
    echo "Error: detection failed but no failed job found in result.json" >&2
    exit 1
  }

  job_cmd="$(core_ci_job_command "$failed_job")"
  job_log_name="$(core_ci_job_log "$failed_job")"
  job_log_file="$AI_LOG_DIR/$job_log_name"

  # Localize to the failing package(s) once, from this detection round's turbo
  # summaries. Empty for non-turbo jobs or when summaries are unavailable, in
  # which case scoped_cmd == job_cmd (whole-job behavior). We do NOT re-read
  # summaries inside the repair loop: the targeted rerun checks all pinned
  # packages, and a full re-detect runs once this job goes green.
  failing_pkgs="$(failing_packages "$failed_job")"
  scoped_cmd="$(scope_command "$job_cmd" "$failing_pkgs")"

  echo ""
  if [ -n "$failing_pkgs" ]; then
    echo "=== Targeting job: $failed_job (packages: $failing_pkgs) ==="
  else
    echo "=== Targeting job: $failed_job ==="
  fi

  # ── Step 3: Repair loop for this job ─────────────────────────────────────
  while true; do
    iteration=$((iteration + 1))

    if [ "$MAX_ITERS" -gt 0 ] && [ "$iteration" -gt "$MAX_ITERS" ]; then
      echo "Stopped at maximum iteration count ($MAX_ITERS)" >&2
      exit 1
    fi

    echo ""
    echo "=== repair attempt $iteration (job: $failed_job) ==="

    # Build compact failure context, scoped to the failing package(s) when known.
    scoped_log="$job_log_file"
    if [ -n "$failing_pkgs" ]; then
      scoped_log="$STATE_DIR/scoped-${iteration}.log"
      scoped_log_view "$job_log_file" "$failing_pkgs" > "$scoped_log"
    fi
    failure_context="$(compact_log "$scoped_log")"
    failure_signature="$(printf '%s\n%s' "$failed_job" "$failure_context" | normalize_failure | hash_stream)"

    # No-progress key = job ID + failure signature
    no_progress_key="${failed_job}:${failure_signature}"

    # Snapshot before agent runs
    attempt_snapshot="$(create_snapshot "attempt-$iteration")"
    before_sig="$(working_tree_signature)"

    # Build prompt
    if [ -n "$failing_pkgs" ]; then
      pkg_hint="The failure is isolated to these package(s): ${failing_pkgs}. The command below is already scoped to them -- keep your fix and verification within these package(s)."
    else
      pkg_hint="If the output is noisy (many packages), narrow it to the single failing package or test."
    fi

    prompt="$(cat <<PROMPT
Make CI job "$failed_job" pass. Fix the real root cause -- never fake a green.

This is the exact command the supervisor uses to validate your work:
\`\`\`bash
$scoped_cmd
\`\`\`

Run it yourself to see the precise, current failure, then fix and re-run until it passes. ${pkg_hint} A captured excerpt to start from:
\`\`\`
$failure_context
\`\`\`

Rules:
- Fix the real cause. Large changes are fine when the fix needs them (e.g. rewrite a test or fixture that drifted from the current types/schema).
- Never fake a green: do not delete, skip, or weaken tests or assertions; do not lower coverage; do not edit CI, workflow, or verification config to bypass the check. A genuinely obsolete test may be removed only with a clearly stated reason.
- Use the package manager for dependency problems (pnpm install / pnpm add); do not hand-edit lockfiles.
- Do not commit, push, stash, switch branches, or create worktrees. Leave changes in the working tree.
- If the failure is caused by a missing secret, toolchain, network, or external service, report it instead of masking it in product code.
PROMPT
)"

    agent_log="$LOG_DIR/agent-${iteration}.log"
    echo "Asking $MODEL to repair $failed_job (attempt $iteration)"

    set +e
    opencode run \
      --model "$MODEL" \
      --agent "$AGENT" \
      --dir "$ROOT_DIR" \
      "$prompt" > >(tee "$agent_log") 2>&1
    agent_status=$?
    set -e

    after_sig="$(working_tree_signature)"

    # ── Check protected paths ────────────────────────────────────────────
    if check_protected_violation "$attempt_snapshot"; then
      echo "Rolling back attempt $iteration due to protected-path violation"
      restore_snapshot "$attempt_snapshot"
      write_blocker_report \
        "agent modified a protected path; attempt rolled back" \
        "$failed_job" "$scoped_cmd" "$iteration" "$job_log_file"
      exit 2
    fi

    # ── Check if agent made changes ──────────────────────────────────────
    if [ "$before_sig" != "$after_sig" ]; then
      no_progress_count=0
      opencode_failure_count=0
      last_no_progress_key=""
      echo "Agent changed the working tree; rerunning targeted validation"

      # Rerun only the failing package(s) for this job
      run_targeted_job "$scoped_cmd" "$job_log_file"

      if [ "$TARGETED_STATUS" -eq 0 ]; then
        echo "[$failed_job] passed -- re-detecting all jobs"
        break  # Break inner loop, re-detect all jobs
      else
        echo "[$failed_job] still failing -- next repair attempt"
        continue
      fi
    else
      # No changes
      if [ "$no_progress_key" = "$last_no_progress_key" ]; then
        no_progress_count=$((no_progress_count + 1))
      else
        no_progress_count=1
        last_no_progress_key="$no_progress_key"
      fi

      if [ "$agent_status" -ne 0 ]; then
        opencode_failure_count=$((opencode_failure_count + 1))
      else
        opencode_failure_count=0
      fi

      if [ "$opencode_failure_count" -ge "$NO_PROGRESS_LIMIT" ]; then
        write_blocker_report \
          "OpenCode failed $NO_PROGRESS_LIMIT consecutive times without changes" \
          "$failed_job" "$scoped_cmd" "$iteration" "$job_log_file"
        exit 2
      fi

      if [ "$no_progress_count" -ge "$NO_PROGRESS_LIMIT" ]; then
        write_blocker_report \
          "no progress after $NO_PROGRESS_LIMIT attempts for the same failure" \
          "$failed_job" "$scoped_cmd" "$iteration" "$job_log_file"
        exit 2
      fi

      echo "No working-tree change (same-failure count: $no_progress_count/$NO_PROGRESS_LIMIT)"
    fi
  done
done

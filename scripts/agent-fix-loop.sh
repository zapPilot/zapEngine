#!/usr/bin/env bash
set -euo pipefail

# scripts/agent-fix-loop.sh
#
# Core CI auto-fixer.  Single entry point for autonomous repair:
#   pnpm agent:fix -- --model provider/model
#
# 1. Runs all core CI jobs in parallel (via verify-full-parallel.sh).
# 2. Picks the highest-priority failure from result.json.
# 3. Sends a compact failure log to a fresh opencode session.
# 4. Reruns only that job until it passes.
# 5. Re-detects all jobs; repeats for remaining failures.
# 6. Finishes with canonical `pnpm verify:ci`.

# ── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  pnpm agent:fix -- --model PROVIDER/MODEL [options]

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
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source "$SCRIPT_DIR/core-ci-registry.sh"

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
    echo "Error: --timeout requires timeout or gtimeout in PATH" >&2
    exit 69
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
  case "$path" in
    package.json|*/package.json|\
    pnpm-lock.yaml|package-lock.json|*/package-lock.json|yarn.lock|bun.lock|bun.lockb|\
    .github/workflows/*|\
    scripts/verify-*.sh|scripts/agent-fix-loop.sh|scripts/core-ci-registry.sh|scripts/lint/*|\
    .opencode/agents/*|\
    *.snap|*snapshot*|*coverage*|\
    AGENTS.md|*/AGENTS.md|CLAUDE.md|*/CLAUDE.md|GEMINI.md|*/GEMINI.md)
      return 0 ;;
    *)
      return 1 ;;
  esac
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
# Includes: first 20 lines, error/failure lines with context, last 40 lines.
# Total capped at COMPACT_LOG_MAX bytes.
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
      echo "=== Log start (first 20 lines) ==="
      head -n 20 "$log_file" 2>/dev/null || true

      echo ""
      echo "=== Error context ==="
      # Extract lines around errors/failures/diagnostics
      grep -n -i -E \
        'error[: ]|fail(ed|ure)|FAIL |✗|✘|ERR!|TS[0-9]{4}:|AssertionError|TypeError|SyntaxError|ModuleNotFoundError|ENOENT|stack trace|Traceback|pytest|FAILED' \
        "$log_file" 2>/dev/null | while IFS=: read -r lineno rest; do
        # Print 3 lines before and after each match
        local start=$((lineno - 3))
        [ "$start" -lt 1 ] && start=1
        local end=$((lineno + 3))
        sed -n "${start},${end}p" "$log_file" 2>/dev/null
        echo "---"
      done || true

      echo ""
      echo "=== Log end (last 40 lines) ==="
      tail -n 40 "$log_file" 2>/dev/null || true
    }
  )"

  local byte_count
  byte_count="$(printf '%s' "$result" | wc -c | tr -d ' ')"

  if [ "$byte_count" -gt "$max_bytes" ]; then
    printf '%s' "$result" | head -c "$max_bytes"
    echo ""
    echo "--- LOG TRUNCATED (exceeded ${max_bytes} bytes) ---"
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
  bash "$SCRIPT_DIR/verify-full-parallel.sh" $timeout_arg
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

  for id in $CORE_CI_JOB_IDS; do
    # Use lightweight grep/sed to extract status for this job
    local status
    status="$(
      grep -A3 "\"id\": \"$id\"" "$RESULT_JSON" 2>/dev/null \
      | grep '"status"' \
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

# Run a single job's command, capturing output.
TARGETED_STATUS=0

run_targeted_job() {
  local job_id="$1"
  local log_file="$2"
  local cmd
  cmd="$(core_ci_job_command "$job_id")"

  echo "=== Targeted rerun: $job_id ==="

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

echo "agent:fix"
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
    pnpm verify:ci
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

  echo ""
  echo "=== Targeting job: $failed_job ==="

  # ── Step 3: Repair loop for this job ─────────────────────────────────────
  while true; do
    iteration=$((iteration + 1))

    if [ "$MAX_ITERS" -gt 0 ] && [ "$iteration" -gt "$MAX_ITERS" ]; then
      echo "Stopped at maximum iteration count ($MAX_ITERS)" >&2
      exit 1
    fi

    echo ""
    echo "=== repair attempt $iteration (job: $failed_job) ==="

    # Build compact failure context
    failure_context="$(compact_log "$job_log_file")"
    failure_signature="$(printf '%s\n%s' "$failed_job" "$failure_context" | normalize_failure | hash_stream)"

    # No-progress key = job ID + failure signature
    no_progress_key="${failed_job}:${failure_signature}"

    # Snapshot before agent runs
    attempt_snapshot="$(create_snapshot "attempt-$iteration")"
    before_sig="$(working_tree_signature)"

    # Build prompt
    prompt="$(cat <<PROMPT
Fix the CI failure in job "$failed_job" with the smallest targeted code change.

Job: $failed_job
Validation command:
\`\`\`bash
$job_cmd
\`\`\`

Failure output:
\`\`\`
$failure_context
\`\`\`

Rules:
- Read the failure output carefully and fix one root cause.
- Edit only files required for that root cause.
- Do not modify protected repository policy, CI, lockfile, snapshot, coverage, or agent files.
- Do not run commands. The outer supervisor performs validation.
- Do not commit, push, stash, switch branches, or create worktrees.
- If the failure is caused by a missing secret, toolchain, network, or external service, do NOT modify product code to mask the problem.
- Stop after making the smallest useful edit.
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
        "$failed_job" "$job_cmd" "$iteration" "$job_log_file"
      exit 2
    fi

    # ── Check if agent made changes ──────────────────────────────────────
    if [ "$before_sig" != "$after_sig" ]; then
      no_progress_count=0
      opencode_failure_count=0
      last_no_progress_key=""
      echo "Agent changed the working tree; rerunning targeted validation"

      # Rerun only this job
      run_targeted_job "$failed_job" "$job_log_file"

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
          "$failed_job" "$job_cmd" "$iteration" "$job_log_file"
        exit 2
      fi

      if [ "$no_progress_count" -ge "$NO_PROGRESS_LIMIT" ]; then
        write_blocker_report \
          "no progress after $NO_PROGRESS_LIMIT attempts for the same failure" \
          "$failed_job" "$job_cmd" "$iteration" "$job_log_file"
        exit 2
      fi

      echo "No working-tree change (same-failure count: $no_progress_count/$NO_PROGRESS_LIMIT)"
    fi
  done
done

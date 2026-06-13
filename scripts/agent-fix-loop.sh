#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/agent-fix-loop.sh --model PROVIDER/MODEL [options]

Required:
  --model ID          OpenCode model ID used for every fresh agent session

Options:
  --command CMD       Validation command (default: pnpm verify:changed)
  --max-iters N       Stop after N repair attempts; 0 means unlimited (default: 0)
  --timeout SECONDS   Timeout for each validation run; 0 disables it (default: 900)
  --agent NAME        OpenCode agent name (default: ci-fixer)
  -h, --help          Show this help
EOF
}

MODEL=""
COMMAND="pnpm verify:changed"
MAX_ITERS=0
ITER_TIMEOUT=900
AGENT="ci-fixer"
NO_PROGRESS_LIMIT=3
LOG_TAIL=600

while [ "$#" -gt 0 ]; do
  case "$1" in
    --model)
      [ "$#" -ge 2 ] || { echo "Error: --model requires a value" >&2; exit 64; }
      MODEL="$2"
      shift 2
      ;;
    --command)
      [ "$#" -ge 2 ] || { echo "Error: --command requires a value" >&2; exit 64; }
      COMMAND="$2"
      shift 2
      ;;
    --max-iters)
      [ "$#" -ge 2 ] || { echo "Error: --max-iters requires a value" >&2; exit 64; }
      MAX_ITERS="$2"
      shift 2
      ;;
    --timeout)
      [ "$#" -ge 2 ] || { echo "Error: --timeout requires a value" >&2; exit 64; }
      ITER_TIMEOUT="$2"
      shift 2
      ;;
    --agent)
      [ "$#" -ge 2 ] || { echo "Error: --agent requires a value" >&2; exit 64; }
      AGENT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [ -z "$MODEL" ]; then
  echo "Error: --model is required" >&2
  usage >&2
  exit 64
fi

for value_name in MAX_ITERS ITER_TIMEOUT; do
  if ! [[ "${!value_name}" =~ ^[0-9]+$ ]]; then
    echo "Error: $value_name must be a non-negative integer" >&2
    exit 64
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v opencode >/dev/null 2>&1; then
  echo "Error: opencode CLI not found in PATH" >&2
  exit 69
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: agent loop must run inside a Git working tree" >&2
  exit 69
fi

initial_status="$(git status --porcelain=v1 --untracked-files=all)"
if [ -n "$initial_status" ]; then
  echo "Error: working tree must be clean before starting the agent loop" >&2
  printf '%s\n' "$initial_status" >&2
  exit 65
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

hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

LOG_DIR="$ROOT_DIR/.agent-loop"
AI_LOG_DIR="$ROOT_DIR/.ai-verify/logs"
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/iteration-*.log "$LOG_DIR"/failure-*.log \
  "$LOG_DIR"/agent-*.log "$LOG_DIR/blocker-report.txt"

working_tree_signature() {
  {
    git diff --binary HEAD
    while IFS= read -r path; do
      printf '\nUNTRACKED:%s\n' "$path"
      if [ -f "$path" ]; then
        hash_stream < "$path"
      fi
    done < <(git ls-files --others --exclude-standard | LC_ALL=C sort)
  } | hash_stream
}

is_protected_path() {
  local path="$1"
  case "$path" in
    package.json|*/package.json|pnpm-lock.yaml|package-lock.json|*/package-lock.json|yarn.lock|bun.lock|bun.lockb|\
    .github/workflows/*|scripts/verify-*.sh|scripts/agent-fix-loop.sh|scripts/lint/*|\
    .opencode/agents/*|*.snap|*snapshot*|*coverage*|\
    AGENTS.md|*/AGENTS.md|CLAUDE.md|*/CLAUDE.md|GEMINI.md|*/GEMINI.md)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

changed_paths() {
  {
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | LC_ALL=C sort -u
}

restore_protected_paths() {
  local found=0
  local path
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if is_protected_path "$path"; then
      found=1
      echo "Protected path modified by agent: $path" >&2
      if git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
        git restore --source=HEAD --staged --worktree -- "$path"
      else
        rm -f -- "$path"
      fi
    fi
  done < <(changed_paths)
  return "$found"
}

normalize_failure() {
  sed -E \
    -e 's#/Users/[^/ ]+#<HOME>#g' \
    -e 's#/private/var/folders/[^ ]+#<TMP>#g' \
    -e 's#[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.Z+-]+#<TIMESTAMP>#g' \
    -e 's#([.](ts|tsx|js|jsx|py)):[0-9]+:[0-9]+#\1:<line>#g' \
    -e 's#iteration [0-9]+#iteration <n>#Ig'
}

collect_failure() {
  local wrapper_log="$1"
  local marker="$2"
  local output="$3"

  {
    echo "=== Validation wrapper output ==="
    tail -n "$LOG_TAIL" "$wrapper_log" 2>/dev/null || true
    if [ -d "$AI_LOG_DIR" ]; then
      while IFS= read -r log_file; do
        echo
        echo "=== ${log_file#"$ROOT_DIR/"} ==="
        tail -n "$LOG_TAIL" "$log_file" 2>/dev/null || true
      done < <(find "$AI_LOG_DIR" -type f -name '*.log' -newer "$marker" -print | LC_ALL=C sort)
    fi
  } > "$output"
}

write_blocker_report() {
  local reason="$1"
  local failure_file="$2"
  {
    echo "Agent fix loop stopped: $reason"
    echo "Model: $MODEL"
    echo "Command: $COMMAND"
    echo "Working tree:"
    git status --short --untracked-files=all
    echo
    echo "Last failure:"
    tail -n 120 "$failure_file" 2>/dev/null || true
  } | tee "$LOG_DIR/blocker-report.txt" >&2
}

echo "agent-fix-loop"
echo "  model:      $MODEL"
echo "  agent:      $AGENT"
echo "  command:    $COMMAND"
echo "  max iters:  $MAX_ITERS (0 = unlimited)"
echo "  timeout:    ${ITER_TIMEOUT}s"

iteration=0
no_progress_count=0
opencode_failure_count=0
last_no_progress_signature=""

while true; do
  iteration=$((iteration + 1))
  wrapper_log="$LOG_DIR/iteration-${iteration}.log"
  failure_file="$LOG_DIR/failure-${iteration}.log"
  marker="$LOG_DIR/iteration-${iteration}.marker"
  : > "$marker"

  echo
  echo "=== validation iteration $iteration ==="
  set +e
  if [ "$ITER_TIMEOUT" -gt 0 ]; then
    "$TIMEOUT_BIN" "$ITER_TIMEOUT" bash -lc "$COMMAND" > "$wrapper_log" 2>&1
  else
    bash -lc "$COMMAND" > "$wrapper_log" 2>&1
  fi
  validation_status=$?
  set -e

  if [ "$validation_status" -eq 0 ]; then
    echo "PASSED after $iteration validation run(s)"
    exit 0
  fi

  if [ "$validation_status" -eq 124 ]; then
    echo "Validation timed out after ${ITER_TIMEOUT}s" >> "$wrapper_log"
  fi

  collect_failure "$wrapper_log" "$marker" "$failure_file"
  failure_signature="$(tail -n "$LOG_TAIL" "$failure_file" | normalize_failure | hash_stream)"
  before_signature="$(working_tree_signature)"

  prompt="$(cat <<EOF
Fix the current zapEngine validation failure with the smallest targeted code change.

Validation command:
\`\`\`bash
$COMMAND
\`\`\`

Failure output:
\`\`\`
$(cat "$failure_file")
\`\`\`

Rules:
- Read the supplied failure output carefully and fix one root cause.
- Edit only files required for that root cause.
- Do not modify protected repository policy, CI, lockfile, snapshot, coverage, or agent files.
- Do not run commands. The outer supervisor performs validation.
- Do not commit, push, stash, switch branches, or create worktrees.
- Stop after making the smallest useful edit.
EOF
)"

  agent_log="$LOG_DIR/agent-${iteration}.log"
  echo "Asking $MODEL to repair the failure in a fresh session"
  set +e
  opencode run \
    --model "$MODEL" \
    --agent "$AGENT" \
    --dir "$ROOT_DIR" \
    "$prompt" > >(tee "$agent_log") 2>&1
  agent_status=$?
  set -e

  after_signature="$(working_tree_signature)"

  set +e
  restore_protected_paths
  protected_result=$?
  set -e
  if [ "$protected_result" -ne 0 ]; then
    write_blocker_report "agent modified a protected path; changes were restored" "$failure_file"
    exit 2
  fi

  if [ "$before_signature" != "$after_signature" ]; then
    no_progress_count=0
    opencode_failure_count=0
    last_no_progress_signature=""
    echo "Agent changed the working tree; rerunning validation"
  else
    if [ "$failure_signature" = "$last_no_progress_signature" ]; then
      no_progress_count=$((no_progress_count + 1))
    else
      no_progress_count=1
      last_no_progress_signature="$failure_signature"
    fi

    if [ "$agent_status" -ne 0 ]; then
      opencode_failure_count=$((opencode_failure_count + 1))
    else
      opencode_failure_count=0
    fi

    if [ "$opencode_failure_count" -ge "$NO_PROGRESS_LIMIT" ]; then
      write_blocker_report "OpenCode failed 3 consecutive times without changes" "$failure_file"
      exit 2
    fi

    if [ "$no_progress_count" -ge "$NO_PROGRESS_LIMIT" ]; then
      write_blocker_report "no progress after 3 attempts for the same failure" "$failure_file"
      exit 2
    fi

    echo "No working-tree change (same-failure count: $no_progress_count/$NO_PROGRESS_LIMIT)"
  fi

  if [ "$MAX_ITERS" -gt 0 ] && [ "$iteration" -ge "$MAX_ITERS" ]; then
    echo "Stopped at maximum iteration count ($MAX_ITERS)" >&2
    exit 1
  fi
done

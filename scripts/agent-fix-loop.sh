#!/usr/bin/env bash
# scripts/agent-fix-loop.sh
#
# Outer bash loop that runs a verify command, hands failure logs to an
# OpenCode agent (default: ci-fixer), and reruns until one of:
#   - the command passes (exit 0)
#   - the same failure signature appears STUCK_LIMIT times (exit 2)
#   - MAX_ITERS is reached (exit 1)
#   - the command is killed by ITER_TIMEOUT (counts as a failure)
#
# Usage:
#   scripts/agent-fix-loop.sh
#   scripts/agent-fix-loop.sh "pnpm turbo run type-check --filter=@zapengine/frontend"
#   CMD="..." MAX_ITERS=3 scripts/agent-fix-loop.sh
#
# Env vars:
#   CMD                       default: pnpm verify:changed
#   MAX_ITERS                 default: 8
#   ITER_TIMEOUT              default: 900 (seconds; 0 = no timeout)
#   STUCK_LIMIT               default: 3
#   LOG_TAIL                  default: 600 (FULL_LOG=1 to send the full log)
#   FULL_LOG                  default: 0
#   AGENT                     default: ci-fixer
#   SKIP_PERMS                default: 0 (1 = --dangerously-skip-permissions)
#   AGENT_LOOP_DEFAULT_MAX_ITERS  optional package-script override
#                                  (e.g. agent:loop:ci uses 3); MAX_ITERS on the
#                                  user command line still wins.
set -euo pipefail

CMD="${1:-${CMD:-pnpm verify:changed}}"
MAX_ITERS="${MAX_ITERS:-${AGENT_LOOP_DEFAULT_MAX_ITERS:-8}}"
ITER_TIMEOUT="${ITER_TIMEOUT:-900}"
STUCK_LIMIT="${STUCK_LIMIT:-3}"
LOG_TAIL="${LOG_TAIL:-600}"
FULL_LOG="${FULL_LOG:-0}"
AGENT="${AGENT:-ci-fixer}"
SKIP_PERMS="${SKIP_PERMS:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/.agent-loop"
HASHES_FILE="$LOG_DIR/signatures.txt"

mkdir -p "$LOG_DIR"

if ! command -v opencode >/dev/null 2>&1; then
  echo "❌ opencode CLI not found in PATH. See https://opencode.ai/docs/cli/"
  exit 1
fi

for v in MAX_ITERS ITER_TIMEOUT STUCK_LIMIT LOG_TAIL; do
  if ! [[ "${!v}" =~ ^[0-9]+$ ]]; then
    echo "❌ $v must be a non-negative integer (got: ${!v})"
    exit 1
  fi
done

cd "$ROOT_DIR"

echo "▶ agent-fix-loop"
echo "  CMD:          $CMD"
echo "  MAX_ITERS:    $MAX_ITERS"
echo "  ITER_TIMEOUT: ${ITER_TIMEOUT}s"
echo "  STUCK_LIMIT:  $STUCK_LIMIT"
echo "  AGENT:        $AGENT"
echo "  SKIP_PERMS:   $SKIP_PERMS"
echo "  LOG_DIR:      $LOG_DIR"
echo ""

compute_signature() {
  local log_file="$1"
  {
    head -n 40 "$log_file" 2>/dev/null \
      | sed -E 's|/Users/[^/ ]+|<HOME>/|g' \
      | sed -E 's|/[^ ]+\.ts([:" ])|<REPO>/\1|g' \
      | sed -E 's|/[^ ]+\.tsx([:" ])|<REPO>/\1|g' \
      | sed -E 's|/[^ ]+\.py([:" ])|<REPO>/\1|g' \
      | sed -E 's|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.Z+-]+|<TS>|g' \
      | sed -E 's|\.ts:[0-9]+:[0-9]+|.ts:<line>|g' \
      | sed -E 's|\.tsx:[0-9]+:[0-9]+|.tsx:<line>|g' \
      | sed -E 's|\.py:[0-9]+:[0-9]+|.py:<line>|g' \
      | sha256sum
  } | awk '{print $1}'
}

run_iteration() {
  local i="$1"
  local log_file="$LOG_DIR/iter-${i}.log"
  echo ""
  echo "══════════ iteration $i / $MAX_ITERS ══════════"
  echo "▶ $CMD"

  local timeout_cmd=()
  if [ "$ITER_TIMEOUT" -gt 0 ]; then
    timeout_cmd=(timeout "$ITER_TIMEOUT")
  fi

  set +e
  "${timeout_cmd[@]}" bash -lc "$CMD" >"$log_file" 2>&1
  local status=$?
  set -e

  cp "$log_file" "$LOG_DIR/latest-failure.log"

  if [ $status -eq 0 ]; then
    echo "✅ PASSED at iteration $i"
    return 0
  fi

  if [ "$ITER_TIMEOUT" -gt 0 ] && [ $status -eq 124 ]; then
    {
      echo "[Killed by ITER_TIMEOUT=${ITER_TIMEOUT}s]"
      cat "$log_file"
    } >"$log_file.tmp" && mv "$log_file.tmp" "$log_file"
    cp "$log_file" "$LOG_DIR/latest-failure.log"
    echo "⏱  Iteration $i killed by timeout (${ITER_TIMEOUT}s)"
  else
    echo "❌ Iteration $i failed (exit $status)"
  fi

  local sig
  sig="$(compute_signature "$log_file")"
  local count
  count="$(grep -cFx "$sig" "$HASHES_FILE" 2>/dev/null || true)"
  count="${count:-0}"
  echo "  signature: $sig (seen $count time(s) before)"

  if [ "$count" -ge "$STUCK_LIMIT" ]; then
    echo ""
    echo "🛑 Stuck: same failure signature $((count + 1)) times (limit $STUCK_LIMIT)."
    echo "   Last 60 lines of $log_file:"
    echo ""
    tail -n 60 "$log_file" || true
    return 2
  fi

  echo "$sig" >>"$HASHES_FILE"

  local log_excerpt
  if [ "$FULL_LOG" = "1" ]; then
    log_excerpt="$(cat "$log_file")"
  else
    log_excerpt="$(tail -n "$LOG_TAIL" "$log_file")"
  fi

  local diff_hint
  diff_hint="$(git diff HEAD --stat 2>/dev/null || true)"
  if [ -n "$diff_hint" ]; then
    diff_hint="$diff_hint

$(git diff HEAD 2>/dev/null | tail -n 100 || true)"
  else
    diff_hint="(no working-tree changes detected; previous fixes already committed)"
  fi

  local perms_flag=()
  if [ "$SKIP_PERMS" = "1" ]; then
    perms_flag=(--dangerously-skip-permissions)
  fi

  echo "▶ Asking $AGENT to fix (fresh session, no --continue)…"

  set +e
  opencode run "${perms_flag[@]}" \
    --agent "$AGENT" \
    --dir "$ROOT_DIR" \
    "$(cat <<PROMPT
You are fixing a zapEngine CI failure.

Validation command that failed:
\`\`\`bash
$CMD
\`\`\`

Iteration: $i / $MAX_ITERS
Exit code: $status

Working-tree diff (what you changed last iteration, if any):
\`\`\`
$diff_hint
\`\`\`

Failure log:
\`\`\`
$log_excerpt
\`\`\`

Rules:
- Read the failure log carefully. Do not skim.
- Identify the smallest root cause. Fix one root cause at a time.
- Edit only the files required for that root cause.
- Do not refactor unrelated code, rename things, or reformat unrelated files.
- Do not modify snapshots, coverage thresholds, CI config, lockfiles,
  dependency versions, lint rules, or verification scripts.
- If a correct fix requires touching a protected file, stop and explain why.
- Do not commit, push, or create branches.
- Do not run full CI. Run only the narrowest affected command if verification is needed.
- After editing, stop. The outer bash loop will rerun validation.
PROMPT
)"
  local agent_status=$?
  set -e

  if [ $agent_status -ne 0 ]; then
    echo "⚠️  opencode run exited with $agent_status (treating as iteration failure)"
  fi

  return 1
}

for i in $(seq 1 "$MAX_ITERS"); do
  run_iteration "$i"
  rc=$?
  if [ $rc -eq 0 ]; then
    exit 0
  fi
  if [ $rc -eq 2 ]; then
    exit 2
  fi
done

echo ""
echo "❌ Still failing after $MAX_ITERS iterations."
echo "   Last failure log: $LOG_DIR/latest-failure.log"
exit 1

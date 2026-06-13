#!/usr/bin/env bash
set -euo pipefail

if git rev-parse --is-shallow-repository 2>/dev/null | grep -q true; then
  echo "❌ Shallow clone detected. Run: git fetch --unshallow origin"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/.ai-verify/logs"
RESULT_FILE="$LOG_DIR/result.json"

mkdir -p "$LOG_DIR"

echo "[verify:branch] Checking committed changes: origin/main...HEAD"

# Disable set -e around the turbo run so we can capture its exit code
# and surface a useful tail of the log instead of a silent non-zero exit.
set +e
TURBO_SCM_BASE="origin/main" \
TURBO_SCM_HEAD="HEAD" \
pnpm turbo run lint type-check \
  --affected \
  --filter='!@zapengine/mobile' \
  > "$LOG_DIR/verify-branch.log" 2>&1
turbo_status=$?
set -e

if [ $turbo_status -eq 0 ]; then
  echo "[verify:branch] ✅ PASSED"
  exit 0
else
  echo "[verify:branch] ❌ FAILED (turbo exit $turbo_status)"
  echo "Last 120 lines of $LOG_DIR/verify-branch.log:"
  echo "------------------------------------------------------------"
  tail -n 120 "$LOG_DIR/verify-branch.log"
  exit 1
fi
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

TURBO_SCM_BASE="origin/main" \
TURBO_SCM_HEAD="HEAD" \
pnpm turbo run lint type-check test:ci deadcode dup:check \
  --affected \
  --filter='!@zapengine/mobile' \
  > "$LOG_DIR/verify-branch.log" 2>&1
turbo_status=$?

if [ $turbo_status -eq 0 ]; then
  echo "[verify:branch] ✅ PASSED"
  exit 0
else
  echo "[verify:branch] ❌ FAILED"
  echo "See logs: $LOG_DIR/verify-branch.log"
  exit 1
fi
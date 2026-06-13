#!/usr/bin/env bash
set -euo pipefail

if git rev-parse --is-shallow-repository 2>/dev/null | grep -q true; then
  echo "❌ Shallow clone detected. Run: git fetch --unshallow origin"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/.ai-verify/logs"

mkdir -p "$LOG_DIR"

echo "[verify:staged] Checking staged files only"

staged_files=$(git diff --cached --name-only)
if [ -z "$staged_files" ]; then
  echo "[verify:staged] No staged files, nothing to check"
  exit 0
fi

changed_packages=$(echo "$staged_files" | xargs -I{} dirname {} | sort -u | grep -v '^.$' || true)

if [ -z "$changed_packages" ]; then
  echo "[verify:staged] No relevant package changes detected"
  exit 0
fi

filters=""
for pkg in $changed_packages; do
  filters="$filters --filter=$pkg"
done

pnpm turbo run lint type-check test:ci \
  $filters \
  --filter='!@zapengine/mobile' \
  > "$LOG_DIR/verify-staged.log" 2>&1
status=$?

if [ $status -eq 0 ]; then
  echo "[verify:staged] ✅ PASSED"
  exit 0
else
  echo "[verify:staged] ❌ FAILED"
  echo "See logs: $LOG_DIR/verify-staged.log"
  exit 1
fi
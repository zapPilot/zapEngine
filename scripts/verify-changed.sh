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

echo "[verify:changed] Checking committed + staged + working tree changes"

head_ref=$(git rev-parse HEAD)
base_ref="origin/main"

tmp_index="$(mktemp)"
cp .git/index "$tmp_index"

GIT_INDEX_FILE="$tmp_index" git add -A

tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree 2>/dev/null)"
wip_commit="$(printf "verify:changed synthetic WIP\n" | GIT_INDEX_FILE="$tmp_index" git commit-tree "$tree" -p "$head_ref" 2>/dev/null)"

rm -f "$tmp_index"

echo "[verify:changed] Synthetic WIP commit: $wip_commit"

TURBO_SCM_BASE="$base_ref" \
TURBO_SCM_HEAD="$wip_commit" \
pnpm turbo run lint type-check test:ci deadcode dup:check \
  --affected \
  --filter='!@zapengine/mobile' \
  > "$LOG_DIR/verify-changed.log" 2>&1
turbo_status=$?

if [ $turbo_status -eq 0 ]; then
  echo "[verify:changed] ✅ PASSED"
  exit 0
else
  echo "[verify:changed] ❌ FAILED"
  echo "See logs: $LOG_DIR/verify-changed.log"
  exit 1
fi
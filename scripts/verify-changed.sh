#!/usr/bin/env bash
# scripts/verify-changed.sh
#
# Fast inner-loop gate: lint/type-check/test/e2e/deadcode/dup on packages affected by
# committed + staged + working-tree changes (a synthetic WIP commit feeds turbo
# --affected). Writes the shared .ai-verify/result.json + verify-changed.log (see
# ci-run-lib.sh); turbo --summarize drops .turbo/runs/*.json so a reader can
# localize the failing package#task. Wired to `pnpm verify changed`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

cirun_die_if_shallow
cirun_init

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

log_file="$CIRUN_LOG_DIR/verify-changed.log"

status=0
cirun_run_logged "changed" "verify-changed.log" \
  env TURBO_SCM_BASE="$base_ref" TURBO_SCM_HEAD="$wip_commit" \
  pnpm turbo run lint type-check test test:e2e deadcode dup:check \
    --affected \
    --summarize || status=$?
cirun_write_result

if [ "$status" -eq 0 ]; then
  echo "[verify:changed] ✅ PASSED"
else
  echo "[verify:changed] ❌ FAILED"
  echo "See log:    $log_file"
  echo "See result: $CIRUN_RESULT_JSON"
fi

exit "$status"

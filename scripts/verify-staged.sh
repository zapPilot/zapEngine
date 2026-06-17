#!/usr/bin/env bash
# scripts/verify-staged.sh
#
# Staged-files gate: lint/type-check/test on packages with staged changes.
# Writes the shared .ai-verify/result.json + verify-staged.log (see
# ci-run-lib.sh); turbo --summarize drops .turbo/runs/*.json so a reader can
# localize the failing package#task. Wired to `pnpm verify staged`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

cirun_die_if_shallow
cirun_init

echo "[verify:staged] Checking staged files only"

staged_files=$(git diff --cached --name-only)
if [ -z "$staged_files" ]; then
  echo "[verify:staged] No staged files, nothing to check"
  cirun_write_result
  exit 0
fi

changed_packages=$(echo "$staged_files" | xargs -I{} dirname {} | sort -u | grep -v '^.$' || true)

if [ -z "$changed_packages" ]; then
  echo "[verify:staged] No relevant package changes detected"
  cirun_write_result
  exit 0
fi

filters=""
for pkg in $changed_packages; do
  filters="$filters --filter=$pkg"
done

log_file="$CIRUN_LOG_DIR/verify-staged.log"

status=0
cirun_run_logged "staged" "verify-staged.log" \
  pnpm turbo run lint type-check test:ci \
    $filters \
    --filter='!@zapengine/mobile' \
    --summarize || status=$?
cirun_write_result

if [ "$status" -eq 0 ]; then
  echo "[verify:staged] ✅ PASSED"
else
  echo "[verify:staged] ❌ FAILED"
  echo "See log:    $log_file"
  echo "See result: $CIRUN_RESULT_JSON"
fi

exit "$status"

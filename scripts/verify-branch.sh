#!/usr/bin/env bash
# scripts/verify-branch.sh
#
# Pre-push gate: lint/type-check on packages affected by origin/main...HEAD.
# Writes the shared .ai-verify/result.json + verify-branch.log (see
# ci-run-lib.sh); turbo --summarize drops .turbo/runs/*.json so a reader can
# localize the failing package#task. Wired to `pnpm verify branch`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

cirun_die_if_shallow
cirun_init

echo "[verify:branch] Checking committed changes: origin/main...HEAD"

log_file="$CIRUN_LOG_DIR/verify-branch.log"

status=0
cirun_run_logged "branch" "verify-branch.log" \
  env TURBO_SCM_BASE="origin/main" TURBO_SCM_HEAD="HEAD" \
  pnpm turbo run lint type-check \
    --affected \
    --filter='!@zapengine/mobile' \
    --summarize || status=$?
cirun_write_result

if [ "$status" -eq 0 ]; then
  echo "[verify:branch] ✅ PASSED"
else
  echo "[verify:branch] ❌ FAILED (turbo exit $status)"
  echo "Last 120 lines of $log_file:"
  echo "------------------------------------------------------------"
  tail -n 120 "$log_file"
  echo "See result: $CIRUN_RESULT_JSON"
fi

exit "$status"

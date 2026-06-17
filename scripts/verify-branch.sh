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

# Disable set -e around turbo so we capture its exit code and surface a useful
# tail of the log instead of a silent non-zero exit.
set +e
TURBO_SCM_BASE="origin/main" \
TURBO_SCM_HEAD="HEAD" \
pnpm turbo run lint type-check \
  --affected \
  --filter='!@zapengine/mobile' \
  --summarize \
  > "$log_file" 2>&1
turbo_status=$?
set -e

cirun_record "branch" "$(cirun_status_from_exit "$turbo_status")" "$turbo_status" ".ai-verify/logs/verify-branch.log"
cirun_write_result

if [ "$turbo_status" -eq 0 ]; then
  echo "[verify:branch] ✅ PASSED"
else
  echo "[verify:branch] ❌ FAILED (turbo exit $turbo_status)"
  echo "Last 120 lines of $log_file:"
  echo "------------------------------------------------------------"
  tail -n 120 "$log_file"
  echo "See result: $CIRUN_RESULT_JSON"
fi

exit "$turbo_status"

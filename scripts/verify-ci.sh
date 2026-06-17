#!/usr/bin/env bash
# scripts/verify-ci.sh
#
# Canonical sequential CI gate. Runs every core job (ci-jobs.sh) in priority
# order, tee-ing each to its own log and recording it into the shared
# .ai-verify/result.json (see ci-run-lib.sh). Stops at the first failure
# (fail-fast, matching CI). Wired to `pnpm verify ci` and run by GitHub CI
# (.github/workflows/ci.yml).
#
# To see ALL failures in one pass instead of stopping at the first, use
# `pnpm verify parallel` — same logs, same result.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

cirun_init

overall_ec=0
for id in $CORE_CI_JOB_IDS; do
  echo "=== [$id] $(core_ci_job_name "$id") ==="
  if ! cirun_run_core_job "$id"; then
    overall_ec=1
    break
  fi
done

cirun_write_result

if [ "$overall_ec" -ne 0 ]; then
  echo "[verify:ci] FAILED -- see .ai-verify/result.json and .ai-verify/logs/"
fi

exit "$overall_ec"

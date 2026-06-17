#!/usr/bin/env bash
# scripts/verify-package.sh
#
# Verify a single workspace (or any --filter expression) against the same task
# set CI runs per package: lint, type-check, deadcode, dup:check, test:ci.
# Writes the shared .ai-verify/result.json + verify-package.log (see
# ci-run-lib.sh). Wired to `pnpm verify package`.
#
# Both invocation forms work — pnpm forwards a literal `--` separator that we
# tolerate, so the filter always reaches turbo (not the underlying tasks):
#   pnpm verify package -- --filter=@zapengine/frontend
#   pnpm verify package --filter=@zapengine/frontend

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

# `pnpm <script> -- <args>` passes a literal `--` as the first arg; drop it so
# the remaining flags land before turbo's task-arg boundary.
if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -eq 0 ]; then
  echo "usage: pnpm verify package -- --filter=@zapengine/<workspace>" >&2
  exit 2
fi

cirun_init

log_file="$CIRUN_LOG_DIR/verify-package.log"

# tee: keep live console output (this is an interactive single-package check)
# while also capturing the log; PIPESTATUS[0] is turbo's real exit code.
set +e
pnpm turbo run lint type-check deadcode dup:check test:ci "$@" --summarize 2>&1 | tee "$log_file"
status="${PIPESTATUS[0]}"
set -e

cirun_record "package" "$(cirun_status_from_exit "$status")" "$status" ".ai-verify/logs/verify-package.log"
cirun_write_result

if [ "$status" -ne 0 ]; then
  echo "[verify:package] ❌ FAILED -- see $CIRUN_RESULT_JSON"
fi

exit "$status"

#!/usr/bin/env bash
# scripts/verify-ci.sh
#
# Canonical sequential CI gate. Runs every job (from ci-jobs.sh) in priority
# order; stops on the first failure (set -e). Wired to `pnpm verify ci` and run
# by GitHub CI (.github/workflows/ci.yml).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-jobs.sh"

for id in $CORE_CI_JOB_IDS; do
  cmd="$(core_ci_job_command "$id")"
  name="$(core_ci_job_name "$id")"
  echo "=== [$id] $name ==="
  eval "$cmd"
done

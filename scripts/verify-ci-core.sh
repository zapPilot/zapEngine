#!/usr/bin/env bash
# scripts/verify-ci-core.sh
#
# Canonical sequential CI gate.  Runs every core job in registry order;
# stops on first failure (set -e).  This is what `pnpm verify:ci` invokes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/core-ci-registry.sh"

for id in $CORE_CI_JOB_IDS; do
  cmd="$(core_ci_job_command "$id")"
  name="$(core_ci_job_name "$id")"
  echo "=== [$id] $name ==="
  eval "$cmd"
done

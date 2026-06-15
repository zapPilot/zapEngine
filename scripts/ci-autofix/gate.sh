#!/usr/bin/env bash
# scripts/ci-autofix/gate.sh
#
# Canonical sequential CI gate.  Runs every job (from registry.sh) in priority
# order; stops on first failure (set -e).  Also wired to `pnpm verify:ci`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/registry.sh"

for id in $CORE_CI_JOB_IDS; do
  cmd="$(core_ci_job_command "$id")"
  name="$(core_ci_job_name "$id")"
  echo "=== [$id] $name ==="
  eval "$cmd"
done

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

[ "$#" -gt 0 ] || {
  echo "usage: scripts/verify-jobs.sh <job-id>..." >&2
  exit 64
}

for id in "$@"; do
  case " $CORE_CI_JOB_IDS " in
    *" $id "*) ;;
    *)
      echo "unknown core CI job: $id" >&2
      exit 64
      ;;
  esac
done

cirun_init
overall=0
for id in "$@"; do
  echo "=== [$id] $(core_ci_job_name "$id") ==="
  cirun_run_core_job "$id" || overall=1
done
cirun_write_result

exit "$overall"

#!/usr/bin/env bash
# scripts/verify-jobs.sh
#
# Sequential runner for the core CI jobs (scripts/ci-jobs.sh). Each job is
# tee-ed to its own log and recorded into the shared .ai-verify/result.json
# (see ci-run-lib.sh).
#
# Usage:
#   scripts/verify-jobs.sh <job-id>...              run just those jobs
#   scripts/verify-jobs.sh --fail-fast [<job-id>...]  stop at the first failure
#                                                   (no ids = every core job in
#                                                   priority order)
#
# GitHub CI runs grouped subsets so independent failures are visible in one
# workflow run; `pnpm verify ci` runs the whole set with --fail-fast. To see ALL
# failures in one pass instead, use `pnpm verify parallel` — same logs, same
# result.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ci-run-lib.sh"

fail_fast=0
if [ "${1:-}" = "--fail-fast" ]; then
  fail_fast=1
  shift
fi

if [ "$#" -eq 0 ]; then
  [ "$fail_fast" -eq 1 ] || {
    echo "usage: scripts/verify-jobs.sh [--fail-fast] <job-id>..." >&2
    exit 64
  }
  # shellcheck disable=SC2086 # CORE_CI_JOB_IDS is a space-separated id list
  set -- $CORE_CI_JOB_IDS
fi

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
  if ! cirun_run_core_job "$id"; then
    overall=1
    [ "$fail_fast" -eq 0 ] || break
  fi
done
cirun_write_result

if [ "$overall" -ne 0 ] && [ "$fail_fast" -eq 1 ]; then
  echo "[verify:ci] FAILED -- see .ai-verify/result.json and .ai-verify/logs/"
fi

exit "$overall"

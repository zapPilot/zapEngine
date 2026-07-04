#!/usr/bin/env bash
# scripts/ci-jobs.sh
#
# Canonical list of core CI jobs, sourced by scripts/verify-ci.sh (sequential
# gate, = `pnpm verify ci`) and scripts/verify-ci-parallel.sh (parallel runner,
# = `pnpm verify parallel`). Each job has a stable ID, a display name, the
# exact command, and a log filename (placed under .ai-verify/logs/ by callers).
# Priority is implicit: first in CORE_CI_JOB_IDS = run/fix first.
#
# Safe to source standalone — sets strict mode defensively (callers already do).
set -euo pipefail

# Ordered list of job IDs. Priority is implicit: first = highest.
CORE_CI_JOB_IDS="format repo contracts type-check lint test e2e deadcode dup analytics"

# Optional warmup run once by verify-ci-parallel.sh before the parallel fan-out,
# so the turbo jobs hit cache for their `^build` dependency instead of rebuilding
# internal packages concurrently. Leave empty to skip.
CI_WARMUP_COMMAND="pnpm turbo run build --filter=./packages/*"

# Lookup functions ─────────────────────────────────────────────────────────────

core_ci_job_name() {
  case "$1" in
    format)    echo "Format check" ;;
    repo)      echo "Repository drift checks" ;;
    contracts) echo "Contracts parity" ;;
    type-check) echo "Type check" ;;
    lint)      echo "Lint" ;;
    test)      echo "Tests" ;;
    e2e)       echo "Web E2E" ;;
    deadcode)  echo "Dead code" ;;
    dup)       echo "Duplication" ;;
    analytics) echo "Analytics checks" ;;
    *) echo "unknown ($1)" ;;
  esac
}

core_ci_job_command() {
  case "$1" in
    format)    echo "pnpm format check" ;;
    repo)      echo "pnpm lint repo" ;;
    contracts) echo "pnpm contracts check" ;;
    type-check) echo "pnpm turbo run type-check" ;;
    lint)      echo "pnpm turbo run lint" ;;
    test)      echo "pnpm turbo run test --force" ;;
    e2e)       echo "pnpm turbo run test:e2e --filter=@zapengine/mobile-v2" ;;
    deadcode)  echo "pnpm turbo run deadcode" ;;
    dup)       echo "pnpm turbo run dup:check" ;;
    analytics) echo "pnpm turbo run sql:audit service-reachability pylint:duplicate-check --filter=@zapengine/analytics-engine" ;;
    *) return 1 ;;
  esac
}

core_ci_job_log() {
  case "$1" in
    format)    echo "format.log" ;;
    repo)      echo "repo.log" ;;
    contracts) echo "contracts.log" ;;
    type-check) echo "type-check.log" ;;
    lint)      echo "lint.log" ;;
    test)      echo "test.log" ;;
    e2e)       echo "e2e.log" ;;
    deadcode)  echo "deadcode.log" ;;
    dup)       echo "dup.log" ;;
    analytics) echo "analytics.log" ;;
    *) return 1 ;;
  esac
}

#!/usr/bin/env bash
# scripts/core-ci-registry.sh
#
# Single source of truth for the five core CI jobs.
# Sourced by verify-ci-core.sh, verify-full-parallel.sh, and agent-fix-loop.sh.
#
# Each job has:
#   - A stable ID (used as key everywhere)
#   - A human-readable display name
#   - The exact command to run
#   - A log filename (placed under .ai-verify/logs/ by callers)
#   - Deterministic priority (lower = fix first)

# Ordered list of job IDs.  Priority is implicit: first = highest.
CORE_CI_JOB_IDS="format repo contracts turbo analytics"

# Lookup functions ─────────────────────────────────────────────────────────────

core_ci_job_name() {
  case "$1" in
    format)    echo "Format check" ;;
    repo)      echo "Repository drift checks" ;;
    contracts) echo "Contracts parity" ;;
    turbo)     echo "Turbo workspace checks" ;;
    analytics) echo "Analytics checks" ;;
    *) echo "unknown ($1)" ;;
  esac
}

core_ci_job_command() {
  case "$1" in
    format)    echo "pnpm format:check:core" ;;
    repo)      echo "pnpm lint:repo" ;;
    contracts) echo "pnpm contracts:check" ;;
    turbo)     echo "pnpm turbo run lint type-check deadcode dup:check test:ci --filter=!@zapengine/mobile" ;;
    analytics) echo "pnpm turbo run sql:audit service-reachability pylint:duplicate-check --filter=@zapengine/analytics-engine" ;;
    *) return 1 ;;
  esac
}

core_ci_job_log() {
  case "$1" in
    format)    echo "format.log" ;;
    repo)      echo "repo.log" ;;
    contracts) echo "contracts.log" ;;
    turbo)     echo "turbo.log" ;;
    analytics) echo "analytics.log" ;;
    *) return 1 ;;
  esac
}

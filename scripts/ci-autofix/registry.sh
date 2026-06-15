#!/usr/bin/env bash
# scripts/ci-autofix/registry.sh
#
# Per-repo ci-autofix config -- the ONLY file you customize when copying the
# scripts/ci-autofix/ folder into another repo.  Sourced by ci-autofix.sh,
# detect.sh, and gate.sh.
#
# Declare your CI jobs explicitly.  Each job has:
#   - A stable ID (used as key everywhere)
#   - A human-readable display name
#   - The exact command to run
#   - A log filename (placed under .ai-verify/logs/ by callers)
#   - Deterministic priority via order in CORE_CI_JOB_IDS (first = fix first)
#
# CI_PROTECTED_PATHS lists repo-specific globs the fixer must never edit, on top
# of the portable base baked into ci-autofix.sh's is_protected_path().

# Ordered list of job IDs.  Priority is implicit: first = highest.
CORE_CI_JOB_IDS="format repo contracts type-check lint test deadcode dup analytics"

# Repo-specific protected globs (whitespace-separated), enforced on top of the
# portable base in ci-autofix.sh.  These are zapEngine extras the base omits.
CI_PROTECTED_PATHS="scripts/lint/* scripts/verify-*.sh"

# Optional warmup run once by detect.sh before the parallel fan-out, so the
# turbo jobs hit cache for their `^build` dependency instead of rebuilding
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
    deadcode)  echo "Dead code" ;;
    dup)       echo "Duplication" ;;
    analytics) echo "Analytics checks" ;;
    *) echo "unknown ($1)" ;;
  esac
}

core_ci_job_command() {
  case "$1" in
    format)    echo "pnpm format:check:core" ;;
    repo)      echo "pnpm lint:repo" ;;
    contracts) echo "pnpm contracts:check" ;;
    type-check) echo "pnpm turbo run type-check --filter=!@zapengine/mobile" ;;
    lint)      echo "pnpm turbo run lint --filter=!@zapengine/mobile" ;;
    test)      echo "pnpm turbo run test:ci --filter=!@zapengine/mobile" ;;
    deadcode)  echo "pnpm turbo run deadcode --filter=!@zapengine/mobile" ;;
    dup)       echo "pnpm turbo run dup:check --filter=!@zapengine/mobile" ;;
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
    deadcode)  echo "deadcode.log" ;;
    dup)       echo "dup.log" ;;
    analytics) echo "analytics.log" ;;
    *) return 1 ;;
  esac
}

#!/usr/bin/env bash
# Dispatcher for `pnpm lint [repo|config|scripts|snapshot-sync|dead-env] [--fix]`.
# Bare (and any turbo flags) pass through to `turbo run lint`.
# Sub-checks delegate to the single-responsibility scripts in scripts/lint/.
set -euo pipefail

case "${1:-}" in
  repo)
    # Repository drift checks (config + scripts + snapshot-sync), in order.
    tsx scripts/lint/config-drift.ts
    tsx scripts/lint/scripts-drift.ts
    tsx scripts/lint/snapshot-sync.ts
    ;;
  config)        shift; exec tsx scripts/lint/config-drift.ts "$@" ;;
  scripts)       shift; exec tsx scripts/lint/scripts-drift.ts "$@" ;;
  snapshot-sync) shift; exec tsx scripts/lint/snapshot-sync.ts "$@" ;;
  dead-env)      shift; exec bash scripts/check-dead-env.sh "$@" ;;
  *)             exec turbo run lint "$@" ;;
esac

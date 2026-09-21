#!/usr/bin/env bash
# Dispatcher for `pnpm lint [repo|config|scripts|snapshot-sync|headline-policy|dead-env|schedules|dispatch] [--fix]`.
# Bare (and any turbo flags) pass through to `turbo run lint`.
# Sub-checks delegate to the single-responsibility scripts in scripts/lint/.
set -euo pipefail

case "${1:-}" in
  repo)
    # Repository drift checks (config + scripts + snapshot-sync + headline-policy
    # + EAS toolchain), in order.
    tsx scripts/lint/config-drift.ts
    tsx scripts/lint/scripts-drift.ts
    tsx scripts/lint/snapshot-sync.ts
    tsx scripts/lint/headline-policy-drift.ts
    node apps/app/scripts/check-eas-toolchain.mjs
    ;;
  config)        shift; exec tsx scripts/lint/config-drift.ts "$@" ;;
  scripts)       shift; exec tsx scripts/lint/scripts-drift.ts "$@" ;;
  snapshot-sync) shift; exec tsx scripts/lint/snapshot-sync.ts "$@" ;;
  headline-policy) shift; exec tsx scripts/lint/headline-policy-drift.ts "$@" ;;
  dead-env)      shift; exec bash scripts/check-dead-env.sh "$@" ;;
  schedules)     shift; exec bash scripts/check-schedules-registry.sh "$@" ;;
  dispatch)      shift; exec bash scripts/check-dispatch-registry-drift.sh "$@" ;;
  -h|--help)     echo "usage: pnpm lint [repo|config|scripts|snapshot-sync|headline-policy|dead-env|schedules|dispatch] [--fix]  (bare = turbo run lint)"; exit 0 ;;
  *)             exec turbo run lint "$@" ;;
esac

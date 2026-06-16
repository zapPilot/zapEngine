#!/usr/bin/env bash
# Dispatcher for `pnpm contracts <export|check>`.
#   export — regenerate the zod schema snapshot (raw tsx, bypasses turbo)
#   check  — build internal packages, export zod, diff against the pydantic models
set -euo pipefail

case "${1:-}" in
  export)
    exec tsx scripts/contracts/export_zod_schemas.ts
    ;;
  check)
    # `contracts:export` is raw tsx and bypasses turbo, so build packages first.
    turbo run build --filter='./packages/*'
    tsx scripts/contracts/export_zod_schemas.ts
    (cd apps/analytics-engine && uv run python ../../scripts/contracts/check_pydantic_parity.py)
    ;;
  *) echo "usage: pnpm contracts <export|check>" >&2; exit 2 ;;
esac

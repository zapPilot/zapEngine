#!/usr/bin/env bash
# Dispatcher for `pnpm build [packages]`. Bare = all workspaces.
#   packages — internal packages/* only (rebuild stale dist; was prebuild:packages)
set -euo pipefail

case "${1:-}" in
  packages) shift; exec turbo run build --filter='./packages/*' "$@" ;;
  -h|--help) echo "usage: pnpm build [packages]  (bare = all workspaces)"; exit 0 ;;
  *)        exec turbo run build "$@" ;;
esac

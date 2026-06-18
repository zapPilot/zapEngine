#!/usr/bin/env bash
# Dispatcher for `pnpm build [core|packages]`. Bare = all workspaces.
#   core     — exclude @zapengine/mobile (the CI build)
#   packages — internal packages/* only (rebuild stale dist; was prebuild:packages)
set -euo pipefail

case "${1:-}" in
  core)     shift; exec turbo run build --filter='!@zapengine/mobile' "$@" ;;
  packages) shift; exec turbo run build --filter='./packages/*' "$@" ;;
  -h|--help) echo "usage: pnpm build [core|packages]  (bare = all workspaces)"; exit 0 ;;
  *)        exec turbo run build "$@" ;;
esac

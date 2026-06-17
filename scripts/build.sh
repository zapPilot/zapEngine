#!/usr/bin/env bash
# Dispatcher for `pnpm build [core|packages]`. Bare = all workspaces.
#   core     — exclude @zapengine/mobile (the CI build)
#   packages — internal packages/* only (rebuild stale dist; was prebuild:packages)
set -euo pipefail

case "${1:-}" in
  core)     shift; exec turbo run build --filter='!@zapengine/mobile' "$@" ;;
  packages) shift; exec turbo run build --filter='./packages/*' "$@" ;;
  *)        exec turbo run build "$@" ;;
esac

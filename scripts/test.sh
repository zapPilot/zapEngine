#!/usr/bin/env bash
# Dispatcher for `pnpm test [coverage]`.
# Bare (and any turbo flags) pass through to `turbo run test`.
set -euo pipefail

case "${1:-}" in
  coverage) shift; exec turbo run test:coverage "$@" ;;
  -h|--help) echo "usage: pnpm test [coverage]  (bare = turbo run test)"; exit 0 ;;
  *)        exec turbo run test "$@" ;;
esac

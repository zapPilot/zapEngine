#!/usr/bin/env bash
# Dispatcher for `pnpm format [check]`.
# Bare = `turbo run format` (writes); `check` = read-only.
set -euo pipefail

case "${1:-}" in -h|--help) echo "usage: pnpm format [check]  (bare = turbo run format, writes)"; exit 0 ;; esac

if [ "${1:-}" = "check" ]; then
  shift
  turbo run format "$@"
  git diff --exit-code
  exit 0
fi

exec turbo run format "$@"

#!/usr/bin/env bash
# Dispatcher for `pnpm format [check [core]]`.
# Bare = `turbo run format` (writes); `check` = read-only; `check core` excludes mobile.
set -euo pipefail

if [ "${1:-}" = "check" ]; then
  shift
  if [ "${1:-}" = "core" ]; then
    shift
    exec turbo run format:check --filter='!@zapengine/mobile' "$@"
  fi
  exec turbo run format:check "$@"
fi

exec turbo run format "$@"

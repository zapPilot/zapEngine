#!/usr/bin/env bash
# Dispatcher for `pnpm security audit [core]`.
#   audit      — pnpm audit + every workspace's security:audit task
#   audit core — same, excluding @zapengine/mobile (the CI gate)
set -euo pipefail

if [ "${1:-}" = "audit" ]; then
  shift
  pnpm audit --audit-level=moderate
  if [ "${1:-}" = "core" ]; then
    shift
    exec turbo run security:audit --filter='!@zapengine/mobile' "$@"
  fi
  exec turbo run security:audit "$@"
fi

echo "usage: pnpm security audit [core]" >&2
exit 2

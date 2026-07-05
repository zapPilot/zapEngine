#!/usr/bin/env bash
# Dispatcher for `pnpm security audit`.
#   audit — pnpm audit + every workspace's security:audit task
set -euo pipefail

if [ "${1:-}" = "audit" ]; then
  shift
  pnpm audit --audit-level=moderate
  exec turbo run security:audit
fi

echo "usage: pnpm security audit" >&2
exit 2

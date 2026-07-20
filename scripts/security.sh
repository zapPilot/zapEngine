#!/usr/bin/env bash
# Dispatcher for `pnpm security audit`.
#   audit — pnpm audit + every workspace's security:audit task
set -euo pipefail

if [ "${1:-}" = "audit" ]; then
  shift
  # pnpm 10 uses npm audit endpoints that the registry has retired.
  # Keep the workspace package manager unchanged while running audit with the
  # first pnpm major that uses npm's supported bulk advisory endpoint.
  pnpm dlx pnpm@11.4.0 --pm-on-fail=ignore audit --audit-level=moderate
  exec turbo run security:audit
fi

echo "usage: pnpm security audit" >&2
exit 2

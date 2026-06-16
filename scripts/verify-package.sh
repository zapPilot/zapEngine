#!/usr/bin/env bash
set -euo pipefail

# Verify a single workspace (or any --filter expression) against the same task
# set CI runs per package: lint, type-check, deadcode, dup:check, test:ci.
#
# Both invocation forms work — pnpm forwards a literal `--` separator that we
# tolerate, so the filter always reaches turbo (not the underlying tasks):
#   pnpm verify:package -- --filter=@zapengine/frontend
#   pnpm verify:package --filter=@zapengine/frontend

# `pnpm <script> -- <args>` passes a literal `--` as the first arg; drop it so
# the remaining flags land before turbo's task-arg boundary.
if [ "${1:-}" = "--" ]; then
  shift
fi

if [ "$#" -eq 0 ]; then
  echo "usage: pnpm verify:package -- --filter=@zapengine/<workspace>" >&2
  exit 2
fi

exec pnpm turbo run lint type-check deadcode dup:check test:ci "$@"

#!/usr/bin/env bash
set -euo pipefail

pnpm format:check
pnpm lint:repo
pnpm contracts:check

turbo run lint type-check deadcode dup:check test:ci

turbo run sql:audit service-reachability pylint:duplicate-check \
  --filter=@zapengine/analytics-engine

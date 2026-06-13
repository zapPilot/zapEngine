#!/usr/bin/env bash
set -euo pipefail

pnpm format:check:core
pnpm lint:repo
pnpm contracts:check

turbo run lint type-check deadcode dup:check test:ci --filter=!@zapengine/mobile

turbo run sql:audit service-reachability pylint:duplicate-check \
  --filter=@zapengine/analytics-engine

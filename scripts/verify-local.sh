#!/usr/bin/env bash
set -euo pipefail

pnpm format:check
pnpm lint:repo
pnpm contracts:check
turbo run lint type-check deadcode:fix test --affected
pnpm lint:dead-env

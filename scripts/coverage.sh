#!/usr/bin/env bash
# Dispatcher for `pnpm coverage <summary|test>`.
#   summary — run coverage suites + aggregate into coverage/summary.json
#   test    — unit-test the coverage scripts themselves
set -euo pipefail

case "${1:-}" in
  summary)
    turbo run test:coverage
    tsx scripts/coverage-summary.ts
    ;;
  test)
    exec tsx --test scripts/coverage-summary.test.ts
    ;;
  *) echo "usage: pnpm coverage <summary|test>" >&2; exit 2 ;;
esac

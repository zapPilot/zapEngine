#!/usr/bin/env bash
# Dispatcher for `pnpm coverage <summary|check|test>`.
#   summary — run coverage suites + aggregate into coverage/summary.json
#   check   — summary + fail if any workspace regressed vs coverage/baseline.json
#   test    — unit-test the coverage scripts themselves
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  summary)
    turbo run test:coverage --filter='!@zapengine/mobile'
    tsx scripts/coverage-summary.ts
    ;;
  check)
    bash "$DIR/coverage.sh" summary
    tsx scripts/coverage-regression.ts
    ;;
  test)
    exec tsx --test scripts/coverage-summary.test.ts scripts/coverage-regression.test.ts
    ;;
  *) echo "usage: pnpm coverage <summary|check|test>" >&2; exit 2 ;;
esac

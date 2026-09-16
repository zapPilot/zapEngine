#!/usr/bin/env bash
# Dispatcher for `pnpm coverage <summary|test>`.
#   summary — run coverage suites + aggregate into coverage/summary.json
#   test    — unit-test the coverage scripts themselves
set -euo pipefail

case "${1:-}" in
  summary)
    # Preserve the existing coverage gate exit status, but always aggregate any
    # reports already produced so CI can publish partial evidence when a
    # workspace threshold fails. This does not execute coverage a second time.
    set +e
    turbo run test:coverage
    coverage_status=$?
    tsx scripts/coverage-summary.ts
    summary_status=$?
    set -e
    if (( coverage_status != 0 )); then
      exit "$coverage_status"
    fi
    exit "$summary_status"
    ;;
  test)
    exec tsx --test scripts/coverage-summary.test.ts scripts/coverage-handoff.test.ts
    ;;
  *) echo "usage: pnpm coverage <summary|test>" >&2; exit 2 ;;
esac

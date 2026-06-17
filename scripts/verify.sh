#!/usr/bin/env bash
# Dispatcher for `pnpm verify [sub]`. Bare = the full parallel local gate
# (`parallel`) — the documented quality gate before opening a PR. Each subcommand
# delegates to a single-responsibility scripts/verify-*.sh — this file only routes.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sub="${1:-parallel}"
shift || true

case "$sub" in
  ci)       exec bash "$DIR/verify-ci.sh" "$@" ;;
  changed)  exec bash "$DIR/verify-changed.sh" "$@" ;;
  branch)   exec bash "$DIR/verify-branch.sh" "$@" ;;
  parallel) exec bash "$DIR/verify-ci-parallel.sh" "$@" ;;
  deploy)   exec bash "$DIR/verify-account-engine-package.sh" "$@" ;;
  *) echo "usage: pnpm verify [ci|changed|branch|parallel|deploy]" >&2; exit 2 ;;
esac

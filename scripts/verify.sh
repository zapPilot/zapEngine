#!/usr/bin/env bash
# Dispatcher for `pnpm verify [sub]`. Bare = the quick local gate (preserves the
# historical `pnpm verify` behavior). Each subcommand delegates to a
# single-responsibility scripts/verify-*.sh — this file only routes.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sub="${1:-local}"
shift || true

case "$sub" in
  local)    exec bash "$DIR/verify-local.sh" "$@" ;;
  ci)       exec bash "$DIR/verify-ci.sh" "$@" ;;
  changed)  exec bash "$DIR/verify-changed.sh" "$@" ;;
  staged)   exec bash "$DIR/verify-staged.sh" "$@" ;;
  branch)   exec bash "$DIR/verify-branch.sh" "$@" ;;
  parallel) exec bash "$DIR/verify-ci-parallel.sh" "$@" ;;
  package)  exec bash "$DIR/verify-package.sh" "$@" ;;
  deploy)   exec bash "$DIR/verify-account-engine-package.sh" "$@" ;;
  *) echo "usage: pnpm verify [local|ci|changed|staged|branch|parallel|package|deploy]" >&2; exit 2 ;;
esac

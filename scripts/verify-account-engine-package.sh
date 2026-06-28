#!/usr/bin/env bash
# scripts/verify-account-engine-package.sh
#
# Builds account-engine and packages it via `pnpm deploy` (experimental).
# The output is validated: /out/dist/main.js must exist and boot in
# test mode without errors.
#
# Usage (called by CI deploy-gates, not directly):
#   bash scripts/verify-account-engine-package.sh [output_dir]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="${1:-}"
cleanup_dir=0

if [ -n "$output_dir" ]; then
  if [ -e "$output_dir" ]; then
    echo "Output directory already exists: $output_dir" >&2
    exit 1
  fi
else
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/account-engine-package.XXXXXX")"
  cleanup_dir=1
fi

cleanup() {
  if [ "$cleanup_dir" -eq 1 ]; then
    rm -rf "$output_dir"
  fi
}
trap cleanup EXIT

cd "$repo_root"

pnpm turbo run build --filter=@zapengine/account-engine

# NOTE: `pnpm deploy` is experimental. Flag compatibility varies by pnpm version.
# --legacy  is valid in pnpm 9–10, optional in 11+; harmless if unsupported.
# --prod    is NOT a valid pnpm deploy flag; the production scope is the default.
# --store-dir is NOT a valid pnpm deploy flag; use --filter + deploy only.
HUSKY=0 pnpm --filter @zapengine/account-engine deploy --legacy "$output_dir"

required_file="$output_dir/dist/main.js"
if [ ! -f "$required_file" ]; then
  echo "account-engine deploy package is missing $required_file" >&2
  exit 1
fi

NODE_ENV=test node "$required_file"
echo "Verified account-engine deploy package: $required_file"

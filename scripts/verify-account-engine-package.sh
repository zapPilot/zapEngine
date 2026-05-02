#!/usr/bin/env bash
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
HUSKY=0 pnpm --filter @zapengine/account-engine deploy --legacy --prod "$output_dir"

required_file="$output_dir/dist/main.js"

if [ ! -f "$required_file" ]; then
  echo "account-engine deploy package is missing $required_file" >&2
  exit 1
fi

NODE_ENV=test node "$required_file"

echo "Verified account-engine deploy package: $required_file"

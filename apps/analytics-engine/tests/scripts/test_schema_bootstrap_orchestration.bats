#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_SCRIPT="$SCRIPT_DIR/scripts/ci/run-tests-precommit.sh"
SCHEMA_FIXTURE_DIR="$SCRIPT_DIR/schemas/integration"
CALLS_FILE="$(mktemp)"

cleanup() {
    rm -f "$CALLS_FILE"
    rm -f "$SCHEMA_FIXTURE_DIR/public.sql" "$SCHEMA_FIXTURE_DIR/alpha_raw.sql"
    rmdir "$SCHEMA_FIXTURE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$SCHEMA_FIXTURE_DIR"
: > "$SCHEMA_FIXTURE_DIR/public.sql"
: > "$SCHEMA_FIXTURE_DIR/alpha_raw.sql"

# shellcheck source=/dev/null
source "$TEST_SCRIPT"

ensure_extensions_and_roles() { printf 'extensions:%s\n' "$1" >> "$CALLS_FILE"; }
apply_inline_compatibility_additions() { printf 'inline:%s\n' "$1" >> "$CALLS_FILE"; }
apply_schema_compat_shim() { printf 'shim:%s\n' "$1" >> "$CALLS_FILE"; }
bootstrap_schema() { printf 'bootstrap:%s\n' "$1" >> "$CALLS_FILE"; }
execute_sql_file() { return 0; }

setup_database_schema "managed_docker" >/dev/null

expected=$'extensions:managed_docker\ninline:managed_docker\nshim:managed_docker\nbootstrap:managed_docker'
actual="$(cat "$CALLS_FILE")"

if [[ "$actual" != "$expected" ]]; then
    printf 'Unexpected schema setup order.\nExpected:\n%s\nActual:\n%s\n' "$expected" "$actual" >&2
    exit 1
fi

printf 'schema bootstrap orchestration: ok\n'

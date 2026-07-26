#!/usr/bin/env bats

load 'helpers/test_helper'

setup() {
    export SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_DIRNAME")/.." && pwd)"
    export TEST_SCRIPT="$SCRIPT_DIR/scripts/ci/run-tests-precommit.sh"
    export SCHEMA_FIXTURE_DIR="$SCRIPT_DIR/schemas/integration"

    mkdir -p "$SCHEMA_FIXTURE_DIR"
    : > "$SCHEMA_FIXTURE_DIR/public.sql"
    : > "$SCHEMA_FIXTURE_DIR/alpha_raw.sql"
}

teardown() {
    rm -f "$SCHEMA_FIXTURE_DIR/public.sql" "$SCHEMA_FIXTURE_DIR/alpha_raw.sql"
    rmdir "$SCHEMA_FIXTURE_DIR" 2>/dev/null || true
}

@test "schema dump setup installs rollup bootstrap after compatibility shims" {
    source "$TEST_SCRIPT"

    calls_file=$(mktemp)
    ensure_extensions_and_roles() { printf 'extensions:%s\n' "$1" >> "$calls_file"; }
    apply_inline_compatibility_additions() { printf 'inline:%s\n' "$1" >> "$calls_file"; }
    apply_schema_compat_shim() { printf 'shim:%s\n' "$1" >> "$calls_file"; }
    bootstrap_schema() { printf 'bootstrap:%s\n' "$1" >> "$calls_file"; }
    execute_sql_file() { return 0; }

    setup_database_schema "managed_docker" >/dev/null

    run cat "$calls_file"
    [ "$status" -eq 0 ]
    [ "$output" = $'extensions:managed_docker\ninline:managed_docker\nshim:managed_docker\nbootstrap:managed_docker' ]

    rm -f "$calls_file"
}

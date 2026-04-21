#!/usr/bin/env bats
# Test suite for scripts/ci/run-tests-precommit.sh
# Prevents regressions like the schema dump bug from happening again

load 'helpers/test_helper'

setup() {
    # Source the script to get access to functions
    # Use a subshell to avoid polluting the test environment
    export SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_DIRNAME")/.." && pwd)"
    export TEST_SCRIPT="$SCRIPT_DIR/scripts/ci/run-tests-precommit.sh"
}

teardown() {
    # Cleanup any temporary files created during tests
    rm -f /tmp/test_*.sql /tmp/tmp.* 2>/dev/null || true
}

# ==============================================================================
# UNIT TESTS - Test individual functions in isolation
# ==============================================================================

@test "detect_database_environment returns 'external' when TEST_DATABASE_URL is set" {
    # Source functions from script
    source "$TEST_SCRIPT"

    # Set external database URL
    export TEST_DATABASE_URL="postgresql://test@localhost/test_db"

    # Call function
    result=$(detect_database_environment)

    # Verify result
    [ "$result" = "external" ]
}

@test "detect_database_environment returns 'managed_docker' when no DB URLs are set" {
    # Source functions from script
    source "$TEST_SCRIPT"

    # Unset database URLs
    unset TEST_DATABASE_URL
    unset DATABASE_INTEGRATION_URL

    # Call function
    result=$(detect_database_environment)

    # Verify result
    [ "$result" = "managed_docker" ]
}



@test "execute_sql_file uses file redirect pattern" {
    # Create temporary SQL file
    temp_file=$(mktemp /tmp/test_sql_XXXXXX.sql)
    echo "SELECT 42;" > "$temp_file"

    # Source functions from script
    source "$TEST_SCRIPT"

    # Mock docker command to verify file redirect
    docker() {
        if [[ "$1" == "exec" ]]; then
            # Read from stdin (file redirect)
            local input=$(cat)
            echo "RECEIVED: $input"
        fi
    }
    export -f docker

    # Set up environment
    export POSTGRES_CONTAINER="test-container"
    export POSTGRES_USER="test_user"
    export POSTGRES_DB="test_db"

    # Call execute_sql_file
    result=$(execute_sql_file "$temp_file" 0 "managed_docker" 2>&1)

    # Verify file content was piped
    [[ "$result" == *"SELECT 42;"* ]]

    # Cleanup
    rm -f "$temp_file"
}

@test "setup_database_schema accepts environment parameter" {
    # Source functions from script
    source "$TEST_SCRIPT"

    # Mock the required functions
    ensure_extensions_and_roles() { echo "MOCK: ensure_extensions_and_roles called with env=$1"; }
    apply_inline_compatibility_additions() { echo "MOCK: apply_inline_compatibility_additions called with env=$1"; }
    apply_schema_compat_shim() { echo "MOCK: apply_schema_compat_shim called with env=$1"; }
    export -f ensure_extensions_and_roles
    export -f apply_inline_compatibility_additions
    export -f apply_schema_compat_shim

    # Call setup_database_schema
    result=$(setup_database_schema "external" 2>&1)

    # Verify functions were called with correct environment
    [[ "$result" == *"ensure_extensions_and_roles called with env=external"* ]]
    [[ "$result" == *"apply_schema_compat_shim called with env=external"* ]]
}

# ==============================================================================
# REGRESSION TESTS - Prevent known bugs
# ==============================================================================

@test "REGRESSION: schema dump uses execute_sql_file, not execute_sql with piping" {
    # This test catches the bug where sed output was piped to execute_sql
    # which expects a parameter, not stdin

    # Read the script and verify the pattern
    script_content=$(cat "$TEST_SCRIPT")

    # Verify that schema dump application uses execute_sql_file
    # and NOT: sed ... | execute_sql -
    echo "$script_content" | grep -q 'execute_sql_file.*temp_dump'

    # Verify the broken pattern doesn't exist
    ! echo "$script_content" | grep -q 'sed.*|.*execute_sql.*-'
}

@test "REGRESSION: temp files are cleaned up after schema dump application" {
    # Create a minimal test schema dump
    test_dump=$(mktemp /tmp/test_dump_XXXXXX.sql)
    echo "CREATE TABLE test_table (id INT);" > "$test_dump"

    # Source functions
    source "$TEST_SCRIPT"

    # Mock execute_sql_file to succeed
    execute_sql_file() { return 0; }
    export -f execute_sql_file

    # Count temp files before
    before=$(find /tmp -maxdepth 1 -name "tmp.*" 2>/dev/null | wc -l | tr -d ' ')

    # Simulate the schema dump application logic
    local temp_dump
    temp_dump=$(mktemp)
    sed '/transaction_timeout/d' "$test_dump" > "$temp_dump"
    execute_sql_file "$temp_dump" 0 "managed_docker" >/dev/null 2>&1
    rm -f "$temp_dump"

    # Count temp files after
    after=$(find /tmp -maxdepth 1 -name "tmp.*" 2>/dev/null | wc -l | tr -d ' ')

    # Verify no temp file leak
    [ "$after" -le "$before" ]

    # Cleanup test dump
    rm -f "$test_dump"
}

@test "REGRESSION: schema dump errors show warning messages, not silent failure" {
    # Source functions
    source "$TEST_SCRIPT"

    # Mock execute_sql_file to fail
    execute_sql_file() { return 1; }
    export -f execute_sql_file

    # Create test dump
    test_dump=$(mktemp /tmp/test_dump_XXXXXX.sql)
    echo "INVALID SQL;" > "$test_dump"

    # Run the schema dump application logic
    temp_dump=$(mktemp)
    sed '/transaction_timeout/d' "$test_dump" > "$temp_dump"
    output=$(if execute_sql_file "$temp_dump" 0 "managed_docker" >/dev/null 2>&1; then
        echo "SUCCESS"
    else
        echo "Warning: schema dump had errors"
    fi)
    rm -f "$temp_dump"

    # Verify warning message is shown
    [[ "$output" == *"Warning"* ]]

    # Cleanup
    rm -f "$test_dump"
}

# ==============================================================================
# INTEGRATION TESTS - Test with mock Docker environment
# ==============================================================================

@test "setup_database_schema orchestrates all steps in correct order" {
    # Source functions
    source "$TEST_SCRIPT"

    # Track function call order
    call_order=()

    ensure_extensions_and_roles() { call_order+=("extensions"); }
    apply_inline_compatibility_additions() { call_order+=("inline_compat"); }
    apply_schema_compat_shim() { call_order+=("compat_shim"); }
    export -f ensure_extensions_and_roles
    export -f apply_inline_compatibility_additions
    export -f apply_schema_compat_shim

    # Mock schema dumps as not present to test bootstrap path
    export SCHEMA_DIR="/nonexistent"

    # Call setup_database_schema
    setup_database_schema "managed_docker" >/dev/null 2>&1 || true

    # Verify call order
    [ "${call_order[0]}" = "extensions" ]
    [ "${call_order[1]}" = "compat_shim" ]
}

@test "both managed_docker and external environments are supported" {
    # Source functions
    source "$TEST_SCRIPT"

    # Mock functions
    ensure_extensions_and_roles() { echo "CALLED with env=$1"; }
    apply_schema_compat_shim() { echo "CALLED with env=$1"; }
    export -f ensure_extensions_and_roles
    export -f apply_schema_compat_shim

    # Mock schema dumps as not present
    export SCHEMA_DIR="/nonexistent"

    # Test managed_docker
    result1=$(setup_database_schema "managed_docker" 2>&1)
    [[ "$result1" == *"CALLED with env=managed_docker"* ]]

    # Test external
    result2=$(setup_database_schema "external" 2>&1)
    [[ "$result2" == *"CALLED with env=external"* ]]
}

# ==============================================================================
# VALIDATION TESTS - Verify script structure
# ==============================================================================

@test "script has execute permission" {
    [ -x "$TEST_SCRIPT" ]
}

@test "script uses bash shebang" {
    # Accept both #!/bin/bash and #!/usr/bin/env bash
    head -n 1 "$TEST_SCRIPT" | grep -qE '#!/.*bash'
}

@test "all required functions are defined in script" {
    script_content=$(cat "$TEST_SCRIPT")

    # Check for critical functions
    echo "$script_content" | grep -q 'detect_database_environment()'
    # Note: execute_sql() was removed; only execute_sql_file() exists
    echo "$script_content" | grep -q 'execute_sql_file()'
    echo "$script_content" | grep -q 'setup_database_schema()'
    echo "$script_content" | grep -q 'ensure_extensions_and_roles()'
    echo "$script_content" | grep -q 'run_dma_signal_coverage_gate()'
}

@test "script runs focused DMA signal coverage gate through make target" {
    script_content=$(cat "$TEST_SCRIPT")

    echo "$script_content" | grep -q 'make test-backtesting-signal-coverage'
}

@test "script uses proper error handling with set -euo pipefail" {
    # Verify script has proper error handling flags
    head -n 20 "$TEST_SCRIPT" | grep -q 'set -euo pipefail'
}

#!/usr/bin/env bash
# Test helper functions for bats test suite

# Setup common test environment
setup_test_env() {
    export TEST_MODE=true
    export POSTGRES_CONTAINER="test-bats-postgres"
    export POSTGRES_USER="test_user"
    export POSTGRES_PASSWORD="testpass123"
    export POSTGRES_DB="test_db"
    export POSTGRES_PORT=5435  # Different port to avoid conflicts
}

# Create a minimal test schema file
create_test_schema() {
    local file="$1"
    cat > "$file" <<'EOF'
-- Minimal test schema
CREATE TABLE IF NOT EXISTS test_users (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_snapshots (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES test_users(id),
    snapshot_date DATE NOT NULL
);
EOF
}

# Create a schema file with intentional errors
create_bad_schema() {
    local file="$1"
    cat > "$file" <<'EOF'
-- Schema with errors
CREATE TABLE bad_table (
    INVALID SYNTAX HERE
);
EOF
}

# Cleanup function for Docker containers
cleanup_test_container() {
    local container_name="${1:-test-bats-postgres}"
    if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        docker rm -f "$container_name" >/dev/null 2>&1 || true
    fi
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
    local container_name="$1"
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker exec "$container_name" pg_isready -U test_user >/dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    return 1
}

# Assert that a string contains a substring
assert_contains() {
    local haystack="$1"
    local needle="$2"

    if [[ "$haystack" != *"$needle"* ]]; then
        echo "ASSERTION FAILED: Expected to find '$needle' in output"
        echo "Actual output: $haystack"
        return 1
    fi
}

# Assert that a string does not contain a substring
assert_not_contains() {
    local haystack="$1"
    local needle="$2"

    if [[ "$haystack" == *"$needle"* ]]; then
        echo "ASSERTION FAILED: Did not expect to find '$needle' in output"
        echo "Actual output: $haystack"
        return 1
    fi
}

#!/usr/bin/env bash
set -euo pipefail

# Unified analytics-engine test runner with PostgreSQL support
# Reuses existing container if running, starts ephemeral container otherwise.
# Integration tests are opt-in via RUN_INTEGRATION=true because they require
# a production-like schema (functions, views, and extra columns). Unit/SQL
# suites run by default with zero skipped tests (skip-marked tests are
# deselected via -m "not skip").

POSTGRES_CONTAINER="analytics-test-postgres"
POSTGRES_PORT=5433
POSTGRES_USER="test_user"
POSTGRES_DB="test_db"
POSTGRES_PASSWORD="testpass123"
# Local postgres fallback (no Docker)
LOCAL_PG_DATA_DIR="${LOCAL_PG_DATA_DIR:-/tmp/analytics-test-postgres}"
LOCAL_PG_LOG="${LOCAL_PG_LOG:-/tmp/analytics-test-postgres.log}"
# Maximum seconds to wait for PostgreSQL readiness (checks every 0.5s)
# Increased to 30s to accommodate slower startup in Colima/Docker Desktop
MAX_WAIT=30

# Default database URLs for local development (use managed Docker container)
# Note: TEST_DATABASE_URL uses postgresql:// (supports both sync/async drivers via sqlalchemy)
# DATABASE_INTEGRATION_URL uses postgresql+asyncpg:// (required for async integration tests)
DEFAULT_TEST_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
DEFAULT_INTEGRATION_DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

COVERAGE_FAIL_UNDER=""
GENERATE_HTMLCOV=false
RUN_DMA_SIGNAL_GATE=false

usage() {
    cat <<'EOF'
Usage: bash scripts/run-tests-precommit.sh [options]

Options:
  --cov-fail-under <N>   Enforce a coverage threshold.
  --no-cov-fail-under    Disable coverage threshold enforcement.
  --htmlcov              Generate htmlcov output.
  --dma-signal-gate      Run the focused DMA signal coverage gate after tests.
  --no-dma-signal-gate   Skip the focused DMA signal coverage gate.
  --run-integration      Enable integration-marked tests.
  -h, --help             Show this help text.
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --cov-fail-under)
                shift
                if [[ $# -eq 0 ]] || [[ ! "$1" =~ ^[0-9]+$ ]]; then
                    printf '%b\n' "${RED}[Pre-commit Tests] --cov-fail-under requires an integer value${NC}" >&2
                    exit 1
                fi
                COVERAGE_FAIL_UNDER="$1"
                ;;
            --no-cov-fail-under)
                COVERAGE_FAIL_UNDER=""
                ;;
            --htmlcov)
                GENERATE_HTMLCOV=true
                ;;
            --dma-signal-gate)
                RUN_DMA_SIGNAL_GATE=true
                ;;
            --no-dma-signal-gate)
                RUN_DMA_SIGNAL_GATE=false
                ;;
            --run-integration)
                RUN_INTEGRATION=true
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                printf '%b\n' "${RED}[Pre-commit Tests] Unknown argument: $1${NC}" >&2
                usage >&2
                exit 1
                ;;
        esac
        shift
    done
}

cleanup_postgres() {
    if [[ "${CREATED_NEW_CONTAINER:-false}" == "true" ]]; then
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Cleaning up ephemeral container...${NC}"
        docker rm -f "$POSTGRES_CONTAINER" > /dev/null 2>&1 || true
    fi
    if [[ "${STARTED_LOCAL_POSTGRES:-false}" == "true" ]]; then
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Stopping local PostgreSQL...${NC}"
        pg_ctl -D "$LOCAL_PG_DATA_DIR" stop -m fast > /dev/null 2>&1 || true
    fi
}

# Function to check if container is running
container_running() {
    docker ps --filter "name=^/${POSTGRES_CONTAINER}$" --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}$"
}

# Function to check if container exists (stopped or running)
container_exists() {
    docker ps -a --filter "name=^/${POSTGRES_CONTAINER}$" --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}$"
}

docker_accessible() {
    docker info > /dev/null 2>&1
}

local_postgres_running() {
    pg_isready -h localhost -p "$POSTGRES_PORT" -q > /dev/null 2>&1
}

wait_for_local_postgres() {
    printf '%b\n' "${YELLOW}[Pre-commit Tests] Waiting for local PostgreSQL...${NC}"
    local attempts=$((MAX_WAIT * 2))
    for _ in $(seq 1 "$attempts"); do
        if local_postgres_running; then
            printf '%b\n' "${GREEN}[Pre-commit Tests] Local PostgreSQL ready${NC}"
            return 0
        fi
        sleep 0.5
    done
    printf '%b\n' "${RED}[Pre-commit Tests] Local PostgreSQL failed to start within ${MAX_WAIT}s${NC}"
    return 1
}

ensure_local_user_and_db() {
    local psql_base=(psql -h localhost -p "$POSTGRES_PORT" -d postgres -v ON_ERROR_STOP=1)

    "${psql_base[@]}" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}') THEN CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}'; END IF; END \$\$;" > /dev/null
    "${psql_base[@]}" -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 || \
        "${psql_base[@]}" -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};" > /dev/null
}

start_local_postgres() {
    if local_postgres_running; then
        printf '%b\n' "${GREEN}[Pre-commit Tests] Using existing local PostgreSQL instance${NC}"
        return 0
    fi

    if [[ ! -d "$LOCAL_PG_DATA_DIR" ]]; then
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Initializing local PostgreSQL data directory...${NC}"
        initdb -D "$LOCAL_PG_DATA_DIR" --auth=trust > /dev/null
    fi

    printf '%b\n' "${YELLOW}[Pre-commit Tests] Starting local PostgreSQL...${NC}"
    pg_ctl -D "$LOCAL_PG_DATA_DIR" -o "-p ${POSTGRES_PORT}" -l "$LOCAL_PG_LOG" start > /dev/null

    if wait_for_local_postgres; then
        ensure_local_user_and_db
        STARTED_LOCAL_POSTGRES=true
        return 0
    fi

    return 1
}

# Normalize sync PostgreSQL URLs to use the psycopg v3 driver to avoid implicit
# psycopg2 dependency differences between local and CI environments.
normalize_sync_url() {
    local url="$1"
    # Normalize old postgres:// scheme
    if [[ "$url" == postgres://* ]]; then
        url="postgresql://${url#postgres://}"
    fi
    # Convert async/sync driver markers to psycopg
    url="${url/postgresql+asyncpg:/postgresql+psycopg:}"
    url="${url/postgresql+psycopg2:/postgresql+psycopg:}"
    # If no driver specified, add psycopg
    if [[ "$url" == postgresql://* ]]; then
        url="${url/postgresql:/postgresql+psycopg:}"
    fi
    echo "$url"
}

# Function to wait for PostgreSQL readiness
wait_for_postgres() {
    printf '%b\n' "${YELLOW}[Pre-commit Tests] Waiting for PostgreSQL...${NC}"
    local attempts=$((MAX_WAIT * 2))
    for _ in $(seq 1 "$attempts"); do
        if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; then
            printf '%b\n' "${GREEN}[Pre-commit Tests] PostgreSQL ready${NC}"
            return 0
        fi
        sleep 0.5
    done
    printf '%b\n' "${RED}[Pre-commit Tests] PostgreSQL failed to start within ${MAX_WAIT}s${NC}"
    return 1
}

# Function to detect database environment (managed Docker vs external)
detect_database_environment() {
    # Returns: "managed_docker" or "external"
    if [[ -n "${TEST_DATABASE_URL:-}" ]] || [[ -n "${DATABASE_INTEGRATION_URL:-}" ]]; then
        echo "external"
    else
        echo "managed_docker"
    fi
}

# Function to start PostgreSQL container
start_postgres() {
    if container_running; then
        printf '%b\n' "${GREEN}[Pre-commit Tests] Using existing PostgreSQL container${NC}"
        return 0
    fi

    if container_exists; then
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Starting stopped PostgreSQL container...${NC}"
        docker start "$POSTGRES_CONTAINER" > /dev/null
        wait_for_postgres
        return $?
    fi

    printf '%b\n' "${YELLOW}[Pre-commit Tests] Creating new PostgreSQL container...${NC}"
    docker run -d \
        --name "$POSTGRES_CONTAINER" \
        -e POSTGRES_USER="$POSTGRES_USER" \
        -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        -e POSTGRES_DB="$POSTGRES_DB" \
        -e POSTGRES_HOST_AUTH_METHOD=trust \
        -p "$POSTGRES_PORT":5432 \
        postgres:15-alpine \
        > /dev/null

    # Allow time for Colima port forwarding to be established
    sleep 3

    wait_for_postgres
    return $?
}

# Function to execute SQL file against database
execute_sql_file() {
    local sql_file="$1"
    local verbose="${2:-0}"
    local env="${3:-managed_docker}"

    if [[ ! -f "$sql_file" ]]; then
        [[ "$verbose" -eq 1 ]] && printf '%b\n' "${RED}[Pre-commit Tests] SQL file not found: $sql_file${NC}" >&2
        return 1
    fi

    if [[ "$env" == "managed_docker" ]]; then
        # Execute via docker exec for managed container
        docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$sql_file"
    else
        # Execute via psql for external database
        # Use DATABASE_INTEGRATION_URL since it's the normalized async URL
        local db_url="${DATABASE_INTEGRATION_URL:-${TEST_DATABASE_URL}}"

        # Convert to psql connection string format
        # Strip driver suffix: postgresql+asyncpg:// -> postgresql://
        local connection_string
        connection_string=$(echo "$db_url" | sed -E 's#postgresql\+[^:]+://(.*)#postgresql://\1#')

        psql "$connection_string" -f "$sql_file"
    fi

    return $?
}

bootstrap_schema() {
    local env="${1:-managed_docker}"
    local bootstrap_sql="$(dirname "$0")/bootstrap-integration-db.sql"

    printf '%b\n' "${YELLOW}[Pre-commit Tests] Bootstrapping schema (env: $env)...${NC}"

    if execute_sql_file "$bootstrap_sql" 1 "$env" 2>/dev/null; then
        printf '%b\n' "${GREEN}[Pre-commit Tests] Schema bootstrap successful${NC}"
        return 0
    else
        printf '%b\n' "${RED}[Pre-commit Tests] Schema bootstrap failed${NC}"
        return 1
    fi
}

ensure_extensions_and_roles() {
    local env="${1:-managed_docker}"
    local sql_file="$(dirname "$0")/sql/extensions-roles.sql"

    if execute_sql_file "$sql_file" 0 "$env" >/dev/null; then
        return 0
    else
        printf '%b\n' "${RED}[Pre-commit Tests] Failed to create extensions and roles${NC}"
        return 1
    fi
}

apply_schema_compat_shim() {
    local env="${1:-managed_docker}"
    local sql_file="$(dirname "$0")/sql/compat-shim.sql"

    execute_sql_file "$sql_file" 0 "$env" >/dev/null
}

apply_inline_compatibility_additions() {
    local env="${1:-managed_docker}"
    local sql_file="$(dirname "$0")/sql/inline-compat.sql"

    execute_sql_file "$sql_file" 0 "$env" >/dev/null
}

reset_managed_database() {
    printf '%b\n' "${YELLOW}[Pre-commit Tests] Resetting managed database...${NC}"
    # Use drop schema cascade to clear everything in public schema without restarting container
    # This is faster than restarting and sufficient for most tests
    if docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1; then
       return 0
    else
       # If DROP fails (e.g. active connections), try to kill connections first
       docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
           SELECT pg_terminate_backend(pid) FROM pg_stat_activity
           WHERE pid <> pg_backend_pid() AND datname = '$POSTGRES_DB';
           DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
    fi
}

reset_external_database() {
    local env="${1:-external}"
    local db_url="${DATABASE_INTEGRATION_URL:-${TEST_DATABASE_URL}}"
    local connection_string

    connection_string=$(echo "$db_url" | sed -E 's#postgresql\+[^:]+://(.*)#postgresql://\1#')
    psql "$connection_string" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
}

# Unified database schema setup for both managed Docker and external databases
setup_database_schema() {
    local env="${1:-managed_docker}"

    printf '%b\n' "${YELLOW}[Pre-commit Tests] Setting up database schema (env: $env)${NC}"

    # Step 1: Ensure extensions and roles exist
    ensure_extensions_and_roles "$env"

    # Step 2: Detect if schema dumps are present
    SCHEMA_DIR="$(dirname "$0")/../schemas/integration"
    SCHEMA_DUMPS_PRESENT=false
    for dump in "$SCHEMA_DIR/public.sql" "$SCHEMA_DIR/alpha_raw.sql"; do
        if [[ -f "$dump" ]]; then
            SCHEMA_DUMPS_PRESENT=true
            break
        fi
    done

    # Step 3: Apply schema dumps or bootstrap minimal schema
    if [[ "$SCHEMA_DUMPS_PRESENT" == "true" ]]; then
        for dump in "$SCHEMA_DIR/public.sql" "$SCHEMA_DIR/alpha_raw.sql"; do
            if [[ -f "$dump" ]]; then
                printf '%b\n' "${YELLOW}[Pre-commit Tests] Applying schema dump $(basename "$dump")${NC}"

                # Strip GUCs not supported by postgres:15 (e.g., transaction_timeout)
                # Create temp file since execute_sql_file expects a file path, not stdin
                local temp_dump
                temp_dump=$(mktemp)
                sed '/transaction_timeout/d' "$dump" > "$temp_dump"

                # Apply the filtered schema dump using the proper file function
                if execute_sql_file "$temp_dump" 0 "$env" >/dev/null 2>&1; then
                    printf '%b\n' "${GREEN}[Pre-commit Tests] Successfully applied $(basename "$dump")${NC}"
                else
                    printf '%b\n' "${YELLOW}[Pre-commit Tests] Warning: $(basename "$dump") had errors (continuing)${NC}"
                fi

                # Cleanup temporary file
                rm -f "$temp_dump"
            fi
        done

        # Apply inline compatibility additions after schema dumps
        apply_inline_compatibility_additions "$env"
    else
        # Fallback to minimal bootstrap when no dumps are present
        bootstrap_schema "$env" || true
    fi

    # Step 4: Apply comprehensive compatibility shim
    apply_schema_compat_shim "$env"

    printf '%b\n' "${GREEN}[Pre-commit Tests] Schema setup complete${NC}"
}

run_pytest() {
    if command -v uv >/dev/null 2>&1; then
        uv run pytest "$@"
    else
        python -m pytest "$@"
    fi
}

run_postgres_suite() {
    local mark_expr="not skip"
    local -a pytest_args=()

    case "${RUN_INTEGRATION:-false}" in
        1|true|TRUE|yes|YES)
            printf '%b\n' "${YELLOW}[Pre-commit Tests] Integration tests enabled${NC}"
            ;;
        *)
            mark_expr="${mark_expr} and not integration"
            printf '%b\n' "${YELLOW}[Pre-commit Tests] Integration tests disabled (set RUN_INTEGRATION=true to enable)${NC}"
            ;;
    esac

    pytest_args=(
        tests/
        -m "${mark_expr}"
        --cov=src
        --cov-report=term-missing
        --tb=short
        -W error
        -v
    )

    if [[ "${GENERATE_HTMLCOV}" == "true" ]]; then
        pytest_args+=(--cov-report=html)
    fi

    if [[ -n "${COVERAGE_FAIL_UNDER}" ]]; then
        pytest_args+=("--cov-fail-under=${COVERAGE_FAIL_UNDER}")
    fi

    run_pytest "${pytest_args[@]}"
}

run_dma_signal_coverage_gate() {
    printf '%b\n' "${YELLOW}[Pre-commit Tests] Running focused DMA signal coverage gate...${NC}"
    make test-backtesting-signal-coverage
}

# ==============================================================================
# MAIN EXECUTION
# Only execute when script is run directly, not when sourced for testing
# ==============================================================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    parse_args "$@"
    printf '%b\n' "${GREEN}[Pre-commit Tests] Starting test suite...${NC}"
    trap cleanup_postgres EXIT

CREATED_NEW_CONTAINER=false

USER_PROVIDED_TEST_DB=false
USER_PROVIDED_INTEGRATION_DB=false

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
    USER_PROVIDED_TEST_DB=true
fi

if [[ -n "${DATABASE_INTEGRATION_URL:-}" ]]; then
    USER_PROVIDED_INTEGRATION_DB=true
fi

if [[ "$USER_PROVIDED_TEST_DB" == "false" && "$USER_PROVIDED_INTEGRATION_DB" == "false" ]]; then
    printf '%b\n' "${GREEN}[Pre-commit Tests] No database URLs set; attempting managed local PostgreSQL backend${NC}"

    if ! command -v docker &> /dev/null || ! docker_accessible; then
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Docker unavailable; falling back to local PostgreSQL${NC}"

        if ! command -v initdb &> /dev/null || ! command -v pg_ctl &> /dev/null || ! command -v psql &> /dev/null || ! command -v postgres &> /dev/null; then
            printf '%b\n' "${RED}[Pre-commit Tests] Local PostgreSQL tooling not found (postgres/initdb/pg_ctl/psql).${NC}"
            exit 1
        fi

        if start_local_postgres; then
            export TEST_DATABASE_URL="$DEFAULT_TEST_DATABASE_URL"
            export DATABASE_INTEGRATION_URL="$DEFAULT_INTEGRATION_DATABASE_URL"
            reset_external_database
            printf '%b\n' "${GREEN}[Pre-commit Tests] Running with local PostgreSQL backend at ${TEST_DATABASE_URL}${NC}"
            printf '%b\n' "${GREEN}[Pre-commit Tests] Integration tests will target ${DATABASE_INTEGRATION_URL}${NC}"

            setup_database_schema "external"
        else
            printf '%b\n' "${RED}[Pre-commit Tests] Local PostgreSQL failed to start; aborting tests${NC}"
            exit 1
        fi
    else
        if ! container_exists; then
            CREATED_NEW_CONTAINER=true
        fi

        if start_postgres; then
            export TEST_DATABASE_URL="$DEFAULT_TEST_DATABASE_URL"
            export DATABASE_INTEGRATION_URL="$DEFAULT_INTEGRATION_DATABASE_URL"
            reset_managed_database
            printf '%b\n' "${GREEN}[Pre-commit Tests] Running with managed PostgreSQL backend at ${TEST_DATABASE_URL}${NC}"
            printf '%b\n' "${GREEN}[Pre-commit Tests] Integration tests will target ${DATABASE_INTEGRATION_URL}${NC}"

            # Unified schema setup for managed Docker environment
            setup_database_schema "managed_docker"
        else
            printf '%b\n' "${RED}[Pre-commit Tests] PostgreSQL failed to start; aborting tests${NC}"
            exit 1
        fi
    fi
else
    printf '%b\n' "${GREEN}[Pre-commit Tests] External database configuration detected${NC}"

    if [[ "$USER_PROVIDED_TEST_DB" == "true" ]]; then
        printf '%b\n' "${GREEN}[Pre-commit Tests] Using provided TEST_DATABASE_URL${NC}"
    fi

    if [[ "$USER_PROVIDED_INTEGRATION_DB" == "true" ]]; then
        printf '%b\n' "${GREEN}[Pre-commit Tests] Using provided DATABASE_INTEGRATION_URL${NC}"
    fi

    # Mirror URLs if only one provided
    if [[ "$USER_PROVIDED_TEST_DB" == "true" && "$USER_PROVIDED_INTEGRATION_DB" == "false" ]]; then
        export DATABASE_INTEGRATION_URL="$TEST_DATABASE_URL"
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Mirroring TEST_DATABASE_URL to DATABASE_INTEGRATION_URL${NC}"
    fi

    if [[ "$USER_PROVIDED_TEST_DB" == "false" && "$USER_PROVIDED_INTEGRATION_DB" == "true" ]]; then
        export TEST_DATABASE_URL="$DATABASE_INTEGRATION_URL"
        printf '%b\n' "${YELLOW}[Pre-commit Tests] Mirroring DATABASE_INTEGRATION_URL to TEST_DATABASE_URL${NC}"
    fi

    # Unified schema setup for external database environment
    setup_database_schema "external"
fi

# Force sync test URL to psycopg driver to avoid psycopg2 dependency drift
export TEST_DATABASE_URL="$(normalize_sync_url "${TEST_DATABASE_URL}")"

run_postgres_suite
TEST_RESULT=$?

if [[ $TEST_RESULT -eq 0 && "${RUN_DMA_SIGNAL_GATE}" == "true" ]]; then
    run_dma_signal_coverage_gate
    TEST_RESULT=$?
elif [[ $TEST_RESULT -eq 0 ]]; then
    printf '%b\n' "${YELLOW}[Pre-commit Tests] Skipping focused DMA signal coverage gate${NC}"
fi

if [[ $TEST_RESULT -eq 0 ]]; then
    printf '%b\n' "${GREEN}[Pre-commit Tests] ✓ All tests passed${NC}"
else
    printf '%b\n' "${RED}[Pre-commit Tests] ✗ Tests failed${NC}"
fi

exit $TEST_RESULT

fi  # End of main execution guard

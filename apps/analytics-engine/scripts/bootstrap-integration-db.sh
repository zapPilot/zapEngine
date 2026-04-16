#!/usr/bin/env bash
set -euo pipefail

# Apply minimal schema required for integration tests.
# Uses DATABASE_INTEGRATION_URL if set, otherwise defaults to the managed
# pre-commit container URL (postgresql://test_user:testpass123@localhost:5433/test_db).

DB_URL=${DATABASE_INTEGRATION_URL:-"postgresql://test_user:testpass123@localhost:5433/test_db"}

echo "[Bootstrap] Applying integration test schema to ${DB_URL}" >&2

psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/bootstrap-integration-db.sql"

echo "[Bootstrap] Schema ready for integration tests" >&2

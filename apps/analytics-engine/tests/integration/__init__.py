"""
Integration tests requiring PostgreSQL database.

These tests validate end-to-end functionality against a real PostgreSQL database,
including JSONB operations, LATERAL joins, and other PostgreSQL-specific features
that cannot be tested with SQLite.

Tests in this module are marked with @pytest.mark.integration and require:
    - PostgreSQL database with production-like schema
    - DATABASE_INTEGRATION_URL environment variable
    - classify_token_category() database function

Run integration tests:
    export DATABASE_INTEGRATION_URL="postgresql+asyncpg://user:pass@localhost/test_db"
    pytest tests/integration/ -m integration -v

Compatibility note:
    Bare postgresql:// URLs are normalized to postgresql+asyncpg:// in fixtures.

Skip integration tests (default):
    pytest tests/  # Integration tests skipped automatically
"""

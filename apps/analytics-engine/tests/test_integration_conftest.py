"""Unit tests for integration test URL normalization."""

from tests.integration.conftest import _normalize_integration_async_url


def test_normalize_integration_async_url_converts_bare_postgres_urls() -> None:
    """Bare PostgreSQL URLs should use the asyncpg driver in integration tests."""
    assert (
        _normalize_integration_async_url("postgresql://user:pass@localhost/test_db")
        == "postgresql+asyncpg://user:pass@localhost/test_db"
    )
    assert (
        _normalize_integration_async_url("postgres://user:pass@localhost/test_db")
        == "postgresql+asyncpg://user:pass@localhost/test_db"
    )


def test_normalize_integration_async_url_preserves_explicit_driver_urls() -> None:
    """Explicit driver URLs should remain unchanged."""
    assert (
        _normalize_integration_async_url(
            "postgresql+asyncpg://user:pass@localhost/test_db"
        )
        == "postgresql+asyncpg://user:pass@localhost/test_db"
    )
    assert (
        _normalize_integration_async_url(
            "postgresql+psycopg://user:pass@localhost/test_db"
        )
        == "postgresql+psycopg://user:pass@localhost/test_db"
    )

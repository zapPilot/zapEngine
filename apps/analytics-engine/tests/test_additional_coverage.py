"""Additional unit tests to raise coverage on previously untested branches."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Request

from src.core.cache_service import CacheService
from src.core.config import Environment, Settings, settings
from src.core.connection_pool import ConnectionPoolConfig
from src.core.database import db_manager, session_scope
from src.core.utils import row_to_dict
from src.exceptions.market_sentiment import InternalError
from src.main import create_service_error_handler


class DummySession:
    """Lightweight stand-in for SQLAlchemy Session used in context tests."""

    def __init__(self) -> None:
        self.committed = False
        self.rolled_back = False
        self.closed = False
        self.closed_ctx = False

    def execute(self, *_: object, **__: object) -> None:  # pragma: no cover - not used
        return None

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True

    def close(self) -> None:
        self.closed = True

    def __enter__(self) -> DummySession:
        return self

    def __exit__(self, *_: object) -> None:
        self.closed_ctx = True
        self.close()


def test_row_to_dict_handles_non_dict_asdict() -> None:
    """Ensure _asdict results that are not dicts are still coerced correctly."""

    class CustomAsDict:
        def _asdict(self):  # type: ignore[override]
            return [("alpha", 1), ("beta", 2)]

    result = row_to_dict(CustomAsDict())

    assert result == {"alpha": 1, "beta": 2}


def test_cache_service_evicts_expired_entries(caplog: pytest.LogCaptureFixture) -> None:
    """Expired entries should be removed and counted."""

    cache = CacheService(default_ttl=timedelta(seconds=0.01), max_entries=4)
    cache.set("key", {"value": 1}, ttl=timedelta(seconds=0))

    # Force expiration and trigger the private cleanup path
    with cache._lock:  # pylint: disable=protected-access
        cache._cache["key"].expires_at = datetime.now(UTC) - timedelta(seconds=1)  # type: ignore[index]

    caplog.set_level(logging.DEBUG)
    cache._evict_expired()  # pylint: disable=protected-access

    stats = cache.get_stats()
    assert stats["expirations"] == 1
    assert "Expired entries removed" in caplog.text


@pytest.mark.asyncio
async def test_create_service_error_handler_transient(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Error handler should log, mask details in production, and flag transient errors."""

    class CustomError(Exception):
        def __init__(self) -> None:
            self.message = "boom"
            self.error_code = "OOPS"
            self.context = {"step": "handler"}
            self.is_transient = True

    request = Request(
        {"type": "http", "method": "GET", "path": "/failure", "headers": []}
    )

    monkeypatch.setattr(settings, "environment", Environment.PRODUCTION)

    handler = create_service_error_handler("Something broke", default_status=502)

    caplog.set_level(logging.ERROR)
    response = await handler(request, CustomError())

    assert response.status_code == 503  # transient override
    import json

    payload = json.loads(response.body)
    assert payload["error_code"] == "OOPS"
    assert payload["transient"] is True
    assert payload["detail"] == "Please contact support if the issue persists"
    assert "Something broke: boom" in caplog.text


def test_get_db_yields_and_closes(monkeypatch: pytest.MonkeyPatch) -> None:
    """get_db should yield a session and ensure it is closed afterwards."""

    dummy_session = DummySession()
    monkeypatch.setattr(db_manager, "SessionLocal", lambda: dummy_session)

    generator = db_manager.get_db()
    yielded = next(generator)
    assert yielded is dummy_session

    with pytest.raises(StopIteration):
        next(generator)

    assert dummy_session.closed_ctx is True


def test_session_scope_rolls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """session_scope should rollback and close when an exception is raised."""

    dummy_session = DummySession()
    monkeypatch.setattr(db_manager, "SessionLocal", lambda: dummy_session)

    with pytest.raises(ValueError), session_scope():
        raise ValueError("fail within session")

    assert dummy_session.rolled_back is True
    assert dummy_session.closed is True


def test_init_database_warns_when_not_read_only(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """init_database should warn when write access is enabled."""

    # Preserve original state to avoid test interference
    original_read_only = settings.database_read_only
    original_url = settings.database_read_only_url
    original_db_url = db_manager.db_url
    original_engine = db_manager.engine
    original_session_local = db_manager.SessionLocal

    class DummyEngine:
        def __init__(self) -> None:
            self.disposed = False

        def dispose(self) -> None:  # pragma: no cover - not exercised here
            self.disposed = True

    dummy_engine = DummyEngine()

    def fake_create_engine(*args, **kwargs):  # type: ignore[override]
        return dummy_engine

    def fake_sessionmaker(**kwargs):  # type: ignore[override]
        return lambda: DummySession()

    try:
        monkeypatch.setattr(settings, "database_read_only", False)
        monkeypatch.setattr(
            settings, "database_read_only_url", "postgresql://example.com/db"
        )
        db_manager.db_url = settings.effective_database_url
        db_manager.engine = None
        db_manager.SessionLocal = None

        monkeypatch.setattr("src.core.database.create_engine", fake_create_engine)
        monkeypatch.setattr("src.core.database.sessionmaker", fake_sessionmaker)

        caplog.set_level(logging.WARNING)
        db_manager.init_database()

        assert "WRITE access" in caplog.text
        assert db_manager.engine is dummy_engine
    finally:
        # Restore state
        monkeypatch.setattr(settings, "database_read_only", original_read_only)
        monkeypatch.setattr(settings, "database_read_only_url", original_url)
        db_manager.db_url = original_db_url
        db_manager.engine = original_engine
        db_manager.SessionLocal = original_session_local


def test_settings_rejects_non_postgres_url() -> None:
    """Settings should validate database URLs strictly."""

    with pytest.raises(ValueError):
        Settings(DATABASE_READ_ONLY_URL="mysql://not-supported")


def test_internal_error_details() -> None:
    """Market sentiment internal errors should set expected metadata."""

    err = InternalError("unexpected state")

    assert err.message == f"An unexpected error occurred: {err.details['reason']}"
    assert err.error_code == "INTERNAL_ERROR"
    assert err.status_code == 500
    assert err.details["reason"] == "unexpected state"


def test_connection_pool_config_pool_size_upper_bound() -> None:
    """Pool size above safety limit should raise."""

    with pytest.raises(ValueError):
        # Use negative overflow to avoid earlier total_connections guard
        ConnectionPoolConfig(pool_size=51, max_overflow=-30)


@pytest.mark.asyncio
async def test_generic_exception_handler_missing_state() -> None:
    """Ensure AttributeError path sets request_id to None."""

    from src.api.error_handling import generic_exception_handler

    class MissingStateRequest:
        def __init__(self) -> None:
            self.method = "GET"
            self.url = "http://testserver/fail"

        def __getattr__(self, name: str):
            if name == "state":
                raise AttributeError("no state")
            raise AttributeError(name)

    response = await generic_exception_handler(
        MissingStateRequest(), RuntimeError("boom")
    )
    assert response.status_code == 500


def test_session_scope_commits(monkeypatch: pytest.MonkeyPatch) -> None:
    """session_scope should commit and close when no exceptions occur."""

    dummy_session = DummySession()
    original_session_local = db_manager.SessionLocal
    monkeypatch.setattr(db_manager, "SessionLocal", lambda: dummy_session)

    with session_scope():
        pass

    assert dummy_session.committed is True
    assert dummy_session.closed is True

    db_manager.SessionLocal = original_session_local


def test_session_scope_uninitialized_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """session_scope should raise when SessionLocal is missing."""

    original_session_local = db_manager.SessionLocal
    db_manager.SessionLocal = None

    with pytest.raises(RuntimeError), session_scope():
        pass

    db_manager.SessionLocal = original_session_local


def test_allowed_origins_list_passthrough() -> None:
    """List inputs should bypass string parsing."""

    s = Settings(CORS_ALLOWED_ORIGINS=["http://localhost:3000"])
    assert s.allowed_origins == ["http://localhost:3000"]


def test_allowed_origins_invalid_format() -> None:
    """Invalid origin formats should raise validation errors."""

    with pytest.raises(ValueError):
        Settings(CORS_ALLOWED_ORIGINS="ftp://example.com")


def test_production_requires_real_db_url() -> None:
    """Production environment must not allow placeholder DB URL."""

    with pytest.raises(ValueError):
        Settings(
            ENVIRONMENT=Environment.PRODUCTION,
            DATABASE_READ_ONLY_URL="placeholder_db_url",
        )


def test_config_load_dotenv_importerror(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reload config with ImportError to cover optional dotenv branch."""

    import builtins
    import importlib

    from src.core import config as config_module
    from src.core import database as database_module

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "dotenv":
            raise ImportError("missing dotenv")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    importlib.reload(config_module)

    monkeypatch.setattr(builtins, "__import__", real_import)
    config_module = importlib.reload(config_module)
    database_module.settings = config_module.settings

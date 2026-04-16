"""
Unit tests for src.core.database utilities (no real DB connection).
"""

import pytest

from src.core import config as core_config
from src.core.database import (
    close_database,
    health_check,
    is_read_only_mode,
    validate_write_operation,
)


def test_validate_write_operation_respects_read_only(monkeypatch):
    """validate_write_operation should raise when read-only is enabled."""
    # Force read-only mode - mock the underlying database_read_only field
    monkeypatch.setattr(core_config.settings, "database_read_only", True, raising=True)

    with pytest.raises(RuntimeError):
        validate_write_operation()

    # Allow writes - mock the underlying database_read_only field
    monkeypatch.setattr(core_config.settings, "database_read_only", False, raising=True)
    validate_write_operation()  # should not raise


def test_is_read_only_mode_reflects_settings(monkeypatch):
    monkeypatch.setattr(core_config.settings, "database_read_only", True, raising=True)
    assert is_read_only_mode() is True

    monkeypatch.setattr(core_config.settings, "database_read_only", False, raising=True)
    assert is_read_only_mode() is False


def test_health_check_without_engine():
    """health_check returns False when engine/session not initialized."""
    ok = health_check()
    assert ok is False


def test_close_database_without_engine():
    """close_database should be safe when engine is None (no exception)."""
    # Nothing to assert; just verify it does not raise
    close_database()


def test_health_check_with_fake_session(monkeypatch):
    """Simulate an initialized session factory and engine for health_check True path."""
    # Provide a truthy engine so health_check doesn't early-return
    from src.core import database as db

    monkeypatch.setattr(db.db_manager, "engine", object(), raising=True)

    class FakeResult:
        def scalar(self):
            return 1

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, _exc_type, _exc, _tb):
            pass

        def execute(self, _):
            return FakeResult()

    class FakeSessionLocal:
        def __call__(self):
            return FakeSession()

    monkeypatch.setattr(db.db_manager, "SessionLocal", FakeSessionLocal(), raising=True)

    assert health_check() is True

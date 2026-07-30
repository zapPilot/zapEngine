"""Shared fixtures for service-level tests."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from src.services.interfaces import QueryServiceProtocol


@pytest.fixture
def mock_db() -> MagicMock:
    """Return a fresh mocked SQLAlchemy session."""
    return MagicMock(spec=Session)


@pytest.fixture
def mock_db_session() -> MagicMock:
    """Return a fresh mocked SQLAlchemy session under the legacy fixture name."""
    return MagicMock(spec=Session)


@pytest.fixture
def mock_query_service() -> MagicMock:
    """Return a fresh query-service mock with empty-query defaults."""
    service = MagicMock(spec=QueryServiceProtocol)
    service.execute_query.return_value = []
    service.execute_query_one.return_value = None
    return service


@pytest.fixture
def allow_write_operations(monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Bypass the write-operation guard so tests can exercise write paths."""
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    yield

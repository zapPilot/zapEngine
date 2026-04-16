"""Shared fixtures for service-level tests."""

from __future__ import annotations

from collections.abc import Generator

import pytest


@pytest.fixture
def allow_write_operations(monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Bypass the write-operation guard so tests can exercise write paths."""
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    yield

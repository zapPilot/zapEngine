"""Sentry coverage for v3 daily-suggestion error classification."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.api.routers import v3_strategy
from src.services.exceptions import MarketDataUnavailableError


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v3/strategy/daily-suggestion/user",
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("testclient", 123),
            "scheme": "http",
        }
    )


def _service(error: Exception) -> SimpleNamespace:
    return SimpleNamespace(get_daily_suggestion=Mock(side_effect=error))


def test_daily_suggestion_captures_market_data_503(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = Mock()
    monkeypatch.setattr(v3_strategy, "capture_server_exception", capture)
    error = MarketDataUnavailableError("market data missing", missing_assets=["BTC"])

    with pytest.raises(HTTPException) as raised:
        v3_strategy.get_daily_suggestion(
            user_id=UUID(int=1),
            service=_service(error),
            request=_request(),
            config_id=None,
        )

    assert raised.value.status_code == 503
    capture.assert_called_once()


def test_daily_suggestion_captures_internal_value_error(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = Mock()
    monkeypatch.setattr(v3_strategy, "capture_server_exception", capture)
    error = ValueError("Daily suggestion serialization missing signal state")

    with pytest.raises(HTTPException) as raised:
        v3_strategy.get_daily_suggestion(
            user_id=UUID(int=1),
            service=_service(error),
            request=_request(),
            config_id=None,
        )

    assert raised.value.status_code == 500
    capture.assert_called_once()


def test_daily_suggestion_does_not_capture_caller_400(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = Mock()
    monkeypatch.setattr(v3_strategy, "capture_server_exception", capture)

    with pytest.raises(HTTPException) as raised:
        v3_strategy.get_daily_suggestion(
            user_id=UUID(int=1),
            service=_service(ValueError("Unknown config_id 'missing'")),
            request=_request(),
            config_id="missing",
        )

    assert raised.value.status_code == 400
    capture.assert_not_called()

"""Sentry coverage for handled HTTP errors and daily-suggestion classification."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.api import error_handling
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


def _http_error_with_cause(status_code: int, cause: Exception) -> HTTPException:
    try:
        raise HTTPException(status_code=status_code, detail="failed") from cause
    except HTTPException as error:
        return error


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [500, 503])
async def test_caused_server_http_errors_are_captured(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    capture = Mock()
    monkeypatch.setattr(error_handling, "capture_server_exception", capture)
    request = _request()
    cause = RuntimeError("backend failed")

    response = await error_handling.sentry_http_exception_handler(
        request,
        _http_error_with_cause(status_code, cause),
    )

    assert response.status_code == status_code
    capture.assert_called_once_with(cause, request)


@pytest.mark.asyncio
async def test_caused_caller_http_error_is_not_captured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capture = Mock()
    monkeypatch.setattr(error_handling, "capture_server_exception", capture)

    response = await error_handling.sentry_http_exception_handler(
        _request(),
        _http_error_with_cause(400, ValueError("bad request")),
    )

    assert response.status_code == 400
    capture.assert_not_called()


@pytest.mark.asyncio
async def test_direct_server_http_error_without_cause_is_not_captured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capture = Mock()
    monkeypatch.setattr(error_handling, "capture_server_exception", capture)

    response = await error_handling.sentry_http_exception_handler(
        _request(),
        HTTPException(status_code=503, detail="health check unavailable"),
    )

    assert response.status_code == 503
    capture.assert_not_called()


def test_daily_suggestion_market_data_error_becomes_caused_503() -> None:
    error = MarketDataUnavailableError("market data missing", missing_assets=["BTC"])

    with pytest.raises(HTTPException) as raised:
        v3_strategy.get_daily_suggestion(
            user_id=UUID(int=1),
            service=_service(error),
            config_id=None,
        )

    assert raised.value.status_code == 503
    assert raised.value.__cause__ is error


def test_daily_suggestion_internal_value_error_becomes_caused_500() -> None:
    error = ValueError("Daily suggestion serialization missing signal state")

    with pytest.raises(HTTPException) as raised:
        v3_strategy.get_daily_suggestion(
            user_id=UUID(int=1),
            service=_service(error),
            config_id=None,
        )

    assert raised.value.status_code == 500
    assert raised.value.__cause__ is error


def test_daily_suggestion_caller_error_remains_400() -> None:
    error = ValueError("Unknown config_id 'missing'")

    with pytest.raises(HTTPException) as raised:
        v3_strategy.get_daily_suggestion(
            user_id=UUID(int=1),
            service=_service(error),
            config_id="missing",
        )

    assert raised.value.status_code == 400
    assert raised.value.__cause__ is error

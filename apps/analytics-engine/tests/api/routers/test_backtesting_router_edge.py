"""Tests for backtesting router edge cases."""

from __future__ import annotations

from datetime import date

from src.api.routers.backtesting import _build_backtest_http_error
from src.services.exceptions import MarketDataUnavailableError


def test_build_backtest_http_error_non_value_error() -> None:
    """Line 19: non-ValueError maps to 500."""
    error = RuntimeError("something broke")
    result = _build_backtest_http_error(error)
    assert result.status_code == 500
    assert "Backtest execution failed" in result.detail


def test_build_backtest_http_error_market_data_unavailable() -> None:
    error = MarketDataUnavailableError(
        "SPY price is stale",
        missing_assets=["SPY"],
        oldest_data_date=date(2025, 1, 3),
    )

    result = _build_backtest_http_error(error)

    assert result.status_code == 503
    assert result.detail == {
        "error_code": "MARKET_DATA_UNAVAILABLE",
        "message": "SPY price is stale",
        "missing_assets": ["SPY"],
        "oldest_data_date": "2025-01-03",
    }

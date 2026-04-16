"""Tests for backtesting router edge cases."""

from __future__ import annotations

from src.api.routers.backtesting import _build_backtest_http_error


def test_build_backtest_http_error_non_value_error() -> None:
    """Line 19: non-ValueError maps to 500."""
    error = RuntimeError("something broke")
    result = _build_backtest_http_error(error)
    assert result.status_code == 500
    assert "Backtest execution failed" in result.detail

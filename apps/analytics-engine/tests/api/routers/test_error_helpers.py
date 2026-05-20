from __future__ import annotations

from datetime import date

from src.api.routers._errors import market_data_unavailable_http_exception
from src.services.exceptions import MarketDataUnavailableError


def test_market_data_unavailable_http_exception_uses_structured_detail() -> None:
    error = MarketDataUnavailableError(
        "BTC data is stale",
        missing_assets=["BTC"],
        oldest_data_date=date(2025, 1, 3),
    )

    result = market_data_unavailable_http_exception(error)

    assert result.status_code == 503
    assert result.detail == {
        "error_code": "MARKET_DATA_UNAVAILABLE",
        "message": "BTC data is stale",
        "missing_assets": ["BTC"],
        "oldest_data_date": "2025-01-03",
    }


def test_market_data_unavailable_http_exception_keeps_missing_date_as_none() -> None:
    error = MarketDataUnavailableError("SPY data is missing", missing_assets=["SPY"])

    result = market_data_unavailable_http_exception(error)

    assert result.detail["oldest_data_date"] is None

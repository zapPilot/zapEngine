"""Shared HTTP exception builders for API routers."""

from __future__ import annotations

from fastapi import HTTPException

from src.services.exceptions import MarketDataUnavailableError


def market_data_unavailable_http_exception(
    error: MarketDataUnavailableError,
) -> HTTPException:
    """Map stale/missing market data errors to the canonical HTTP 503 payload."""
    return HTTPException(
        status_code=503,
        detail={
            "error_code": "MARKET_DATA_UNAVAILABLE",
            "message": str(error),
            "missing_assets": error.missing_assets,
            "oldest_data_date": error.oldest_data_date.isoformat()
            if error.oldest_data_date
            else None,
        },
    )

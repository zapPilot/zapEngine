"""Service-level exceptions mapped to specific HTTP status codes.

`MarketDataUnavailableError` extends the project-wide `ServiceError` base so it
participates in the standard error taxonomy (`error_code`, `is_transient`,
`context`) used by the rest of the analytics engine. The route layer maps it
to HTTP 503 — semantically distinct from caller validation errors and from
unexpected internal failures.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from src.core.exceptions import ServiceError


class InvalidDailySuggestionRequestError(ValueError):
    """Caller-supplied daily-suggestion config is unknown or unsupported."""


class MarketDataUnavailableError(ServiceError):
    """Raised when market data lag exceeds a strategy's tolerance."""

    missing_assets: list[str]
    oldest_data_date: date | None

    def __init__(
        self,
        message: str,
        *,
        missing_assets: list[str] | None = None,
        oldest_data_date: date | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        merged_context: dict[str, Any] = dict(context or {})
        if missing_assets:
            merged_context.setdefault("missing_assets", list(missing_assets))
        if oldest_data_date is not None:
            merged_context.setdefault("oldest_data_date", oldest_data_date.isoformat())
        super().__init__(
            message,
            error_code="MARKET_DATA_UNAVAILABLE",
            is_transient=True,
            context=merged_context,
        )
        self.missing_assets = list(missing_assets or [])
        self.oldest_data_date = oldest_data_date

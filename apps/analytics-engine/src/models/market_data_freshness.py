"""Market data freshness metadata for daily-suggestion and backtesting responses.

When the analytics engine cannot serve a request from same-day market data, it
forward-fills missing features from the most recent available date (within the
strategy's tolerance) and surfaces this metadata so consumers can render a
"data updating" indicator instead of failing the entire request.
"""

from __future__ import annotations

from datetime import date
from typing import Self

from pydantic import BaseModel, Field, computed_field, model_validator


class StaleFeatureInfo(BaseModel):
    """One feature that was forward-filled from an older snapshot."""

    feature_name: str = Field(
        description="Internal feature key, e.g. 'dma_200', 'price', 'eth_btc_ratio_dma_200'.",
    )
    asset: str = Field(
        description="Asset symbol the feature belongs to, e.g. 'ETH', 'BTC'.",
    )
    requested_date: date = Field(
        description="Date the request asked for (typically 'today').",
    )
    effective_date: date = Field(
        description="Most recent available date, used to forward-fill the value.",
    )
    lag_days: int = Field(
        ge=0,
        description="requested_date - effective_date in calendar days.",
    )


class MarketDataFreshness(BaseModel):
    """Aggregate freshness metadata for a request.

    For daily-suggestion: requested_date is the date used for the decision and
    effective_date is the latest date all required features are available.

    For backtesting: requested_date is the user-requested window end_date and
    effective_date is the clamped end_date that has full data coverage.
    """

    requested_date: date
    effective_date: date
    missing_dates: list[date] = Field(
        default_factory=list,
        description="Dates between effective_date+1 and requested_date that have no data.",
    )
    stale_features: list[StaleFeatureInfo] = Field(
        default_factory=list,
        description="Per-feature breakdown of forward-fills (only entries with lag_days>0).",
    )
    max_lag_days: int = Field(
        ge=0,
        description="Largest lag_days across stale_features, or 0 if data is current.",
    )

    @model_validator(mode="after")
    def validate_dates(self) -> Self:
        if self.effective_date > self.requested_date:
            effective = self.effective_date
            requested = self.requested_date
            msg = f"effective_date ({effective}) cannot be after requested_date ({requested})"
            raise ValueError(msg)
        return self

    @computed_field(return_type=bool)  # type: ignore[prop-decorator]
    @property
    def is_stale(self) -> bool:
        """True when at least one feature was forward-filled.

        Derived from `max_lag_days` so the schema is self-consistent — callers
        cannot pass an `is_stale` value that disagrees with the underlying lag.
        Surfaced as a serialized field so the frontend can branch on it without
        recomputing.
        """
        return self.max_lag_days > 0

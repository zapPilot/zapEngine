"""
Pydantic models for Yield Return analytics.

Defines standardized response structures for the production-ready yield return
endpoint, including token-level breakdowns, per-day yield data, and summary
statistics. These models ensure consistent terminology and serialization.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from src.models.validation_utils import validate_iso8601_format


class PeriodInfo(BaseModel):
    """Standardized period metadata for analytics responses."""

    start_date: str = Field(..., description="ISO8601 timestamp for the period start")
    end_date: str = Field(..., description="ISO8601 timestamp for the period end")
    days: int = Field(..., ge=1, le=365, description="Number of days in the period")

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def validate_iso8601_dates(cls, v: str | None, info: ValidationInfo) -> str:
        """Validate ISO8601 date string format for period dates."""
        field_name = info.field_name or "date"
        if v is None:
            raise ValueError(f"{field_name} is required")
        return validate_iso8601_format(v, field_name)


class TokenYieldBreakdown(BaseModel):
    """Yield attribution for a single token within a protocol snapshot."""

    symbol: str = Field(..., description="Token symbol or identifier")
    amount_change: float = Field(
        ..., description="Net token amount change versus the previous snapshot"
    )
    current_price: float = Field(
        ..., ge=0, description="Latest token price used for yield calculation"
    )
    yield_return_usd: float = Field(
        ...,
        description=(
            "Yield Return contribution in USD for this token "
            "(amount_change × current_price)"
        ),
    )


class DailyYieldReturn(BaseModel):
    """Day-level yield return entry suitable for charting."""

    date: str = Field(..., description="Calendar date (YYYY-MM-DD) of the snapshot")
    protocol_name: str = Field(..., description="Protocol that generated the yield")
    chain: str = Field(..., description="Blockchain network for the protocol position")
    position_type: str | None = Field(
        None, description="Portfolio position archetype (e.g., Lending, Yield)"
    )
    yield_return_usd: float = Field(
        ..., description="Total Yield Return for the protocol on the given date"
    )
    tokens: list[TokenYieldBreakdown] = Field(
        default_factory=list, description="Breakdown of contributing tokens"
    )

    @field_validator("date", mode="before")
    @classmethod
    def validate_iso8601_format_field(cls, v: str | None) -> str:
        """Validate ISO8601 date string format (YYYY-MM-DD)."""
        if v is None:
            raise ValueError("date is required")
        return validate_iso8601_format(v, "date")


class YieldReturnSummary(BaseModel):
    """Aggregated summary statistics for Yield Returns."""

    total_yield_return_usd: float = Field(
        ..., description="Sum of Yield Returns across the requested period"
    )
    average_daily_return: float = Field(
        ..., description="Average daily Yield Return across all data points"
    )
    positive_days: int = Field(
        ..., ge=0, description="Number of days with positive Yield Returns"
    )
    negative_days: int = Field(
        ..., ge=0, description="Number of days with negative Yield Returns"
    )
    top_protocol: str | None = Field(
        None,
        description="Protocol contributing the highest absolute Yield Return in period",
    )
    top_chain: str | None = Field(
        None,
        description="Chain contributing the highest absolute Yield Return in period",
    )


class YieldReturnsResponse(BaseModel):
    """Top-level API response for daily Yield Return analytics."""

    user_id: str = Field(..., description="User identifier")
    period: PeriodInfo
    daily_returns: list[DailyYieldReturn] = Field(
        default_factory=list, description="Chronological sequence of daily returns"
    )
    summary: YieldReturnSummary

    @field_validator("daily_returns")
    @classmethod
    def validate_daily_returns_ordered(
        cls, v: list[DailyYieldReturn]
    ) -> list[DailyYieldReturn]:
        """Ensure daily_returns are in chronological order (ascending by date)."""
        if len(v) <= 1:
            return v

        dates = [datetime.fromisoformat(ret.date) for ret in v]
        if dates != sorted(dates):
            raise ValueError(
                "daily_returns must be in chronological order (ascending by date)"
            )
        return v


class OutlierInfo(BaseModel):
    """Information about detected outliers in yield data."""

    date: str = Field(..., description="Date of outlier (YYYY-MM-DD)")
    value: float = Field(..., description="Outlier yield value (USD)")
    reason: str = Field(..., description="Detection method (IQR/zscore/percentile)")
    z_score: float | None = Field(None, description="Z-score if applicable")


class StatisticalSummary(BaseModel):
    """Statistical summary of yield returns after outlier filtering."""

    mean: float = Field(..., description="Mean daily yield (USD)")
    median: float = Field(..., description="Median daily yield (USD)")
    std_dev: float = Field(..., ge=0, description="Standard deviation")
    min_value: float = Field(..., description="Minimum daily yield")
    max_value: float = Field(..., description="Maximum daily yield")
    total_days: int = Field(..., ge=0, description="Total days in period")
    filtered_days: int = Field(..., ge=0, description="Days after filtering")
    outliers_removed: int = Field(..., ge=0, description="Number of outliers removed")


class ProtocolYieldWindow(BaseModel):
    """Aggregated protocol yield metrics across the requested window."""

    total_yield_usd: float = Field(
        ..., description="Sum of protocol yield across filtered window days"
    )
    average_daily_yield_usd: float = Field(
        ..., description="Average daily protocol yield across filtered days"
    )
    data_points: int = Field(
        ..., ge=0, description="Number of filtered days contributing to window metrics"
    )
    positive_days: int = Field(
        ..., ge=0, description="Count of days with positive protocol yield"
    )
    negative_days: int = Field(
        ..., ge=0, description="Count of days with negative protocol yield"
    )


class ProtocolYieldToday(BaseModel):
    """Single-day protocol yield snapshot (most recent day)."""

    date: str = Field(..., description="Date for the latest protocol yield entry")
    yield_usd: float = Field(..., description="Protocol yield on the latest day")


class ProtocolYieldBreakdown(BaseModel):
    """Protocol-level yield breakdown with latest day and window metrics."""

    protocol: str = Field(..., description="Protocol name")
    chain: str | None = Field(
        None, description="Blockchain network for the protocol position"
    )
    window: ProtocolYieldWindow = Field(
        ..., description="Protocol yield metrics across the requested window"
    )
    today: ProtocolYieldToday | None = Field(
        None, description="Protocol yield for the latest day (if available)"
    )


class YieldSummaryResponse(BaseModel):
    """Aggregated yield summary with outlier handling and statistics."""

    user_id: str = Field(..., description="User identifier")
    period: PeriodInfo
    average_daily_yield_usd: float = Field(
        ..., description="Average daily yield after outlier filtering"
    )
    median_daily_yield_usd: float = Field(..., description="Median daily yield")
    total_yield_usd: float = Field(
        ..., description="Total yield over period (after filtering)"
    )
    statistics: StatisticalSummary = Field(
        ..., description="Detailed statistical breakdown"
    )
    outlier_strategy: str = Field(
        ..., description="Outlier detection strategy used (none/iqr/zscore/percentile)"
    )
    outliers_detected: list[OutlierInfo] = Field(
        default_factory=list, description="List of detected outliers (if any)"
    )
    protocol_breakdown: list[ProtocolYieldBreakdown] = Field(
        default_factory=list,
        description="Protocol-level yield breakdown with latest day and window metrics",
    )


class MultiWindowYieldSummaryResponse(BaseModel):
    """Multi-window yield summary response supporting multiple time periods."""

    user_id: str = Field(..., description="User identifier")
    windows: dict[str, YieldSummaryResponse] = Field(
        ...,
        description=(
            "Dictionary mapping window labels (e.g., '7d', '30d') to their respective "
            "yield summary data. Allows clients to retrieve multiple time periods in "
            "a single request for efficient comparison and visualization."
        ),
    )

"""
Pydantic response models for analytics services.

Eliminates primitive obsession by replacing `dict[str, Any]` with strongly-typed
response models for portfolio analytics, risk metrics, and performance analysis.
"""

from datetime import date, datetime
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from src.models.types import (
    Float3dpRounded,
    Float4dpRounded,
    Float6dpRounded,
    PercentageRounded,
)
from src.models.validation_utils import validate_array_uniqueness


class SnapshotInfo(BaseModel):
    """Detailed snapshot information."""

    snapshot_date: date = Field(description="Date of the snapshot")
    wallet_count: int = Field(ge=0, description="Number of wallets included")
    last_updated: datetime | None = Field(
        default=None, description="Timestamp of most recent update"
    )


class AnalyticsResponseModel(BaseModel):
    """Base model providing dict-style access for backward compatibility."""

    model_config = ConfigDict(extra="ignore")

    def __getitem__(self, item: str) -> Any:
        try:
            return getattr(self, item)
        except AttributeError as exc:  # pragma: no cover - defensive
            raise KeyError(item) from exc

    def get(self, item: str, default: Any | None = None) -> Any | None:
        return getattr(self, item, default)

    def __contains__(self, item: object) -> bool:
        if not isinstance(item, str):
            return False
        return hasattr(self, item)


class PeriodInfo(AnalyticsResponseModel):
    """Time period information for analytics queries."""

    start_date: datetime = Field(description="Start date of the period")
    end_date: datetime = Field(description="End date of the period")
    days: int = Field(ge=1, description="Number of days in the period")


class PeriodAwareResponseMixin(BaseModel):
    """Mixin providing period_info with backward-compatible 'period' alias and optional message."""

    period_info: PeriodInfo = Field(description="Period information")

    @computed_field(return_type=PeriodInfo)  # type: ignore[prop-decorator]
    @property
    def period(self) -> PeriodInfo:
        """Backward-compatible alias for period_info."""
        return self.period_info

    message: str | None = Field(
        default=None, description="Optional message (e.g., insufficient data)"
    )


class PortfolioVolatilityResponse(PeriodAwareResponseMixin, AnalyticsResponseModel):
    """Portfolio volatility calculation results with risk metrics."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of data points used")
    volatility_daily: Float6dpRounded = Field(
        ge=0.0, description="Daily volatility (standard deviation of returns)"
    )
    volatility_annualized: Float4dpRounded = Field(
        ge=0.0, description="Annualized volatility (daily * sqrt(252))"
    )
    average_daily_return: Float6dpRounded = Field(
        description="Average daily return across the period"
    )


class SharpeRatioResponse(PeriodAwareResponseMixin, AnalyticsResponseModel):
    """Sharpe ratio calculation with risk-adjusted return metrics."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of data points used")
    sharpe_ratio: Float3dpRounded = Field(
        description="Sharpe ratio (excess return / volatility)"
    )
    portfolio_return_annual: Float4dpRounded = Field(
        description="Annualized portfolio return"
    )
    risk_free_rate_annual: float = Field(
        description="Annual risk-free rate used in calculation"
    )
    excess_return: Float4dpRounded = Field(
        description="Excess return over risk-free rate"
    )
    volatility_annual: Float4dpRounded = Field(
        ge=0.0, description="Annualized volatility"
    )
    interpretation: str = Field(
        description="Sharpe ratio interpretation (Poor, Below Average, Good, Very Good, Excellent)"
    )


class MaxDrawdownResponse(PeriodAwareResponseMixin, AnalyticsResponseModel):
    """Maximum drawdown analysis with peak-to-trough metrics."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of data points used")
    max_drawdown_pct: PercentageRounded = Field(
        le=0.0, description="Maximum drawdown as negative percentage"
    )
    peak_value: float = Field(
        ge=0.0, description="Peak portfolio value before drawdown"
    )
    trough_value: float = Field(ge=0.0, description="Trough portfolio value")
    peak_date: datetime | None = Field(description="Date of peak value")
    trough_date: datetime | None = Field(description="Date of trough value")
    drawdown_duration_days: int = Field(ge=0, description="Days from peak to trough")
    current_drawdown: float = Field(
        default=0.0,
        description="Current drawdown ratio (-0.25 == -25%).",
    )
    current_drawdown_percentage: PercentageRounded = Field(
        default=0.0,
        description="Current drawdown percentage of latest portfolio value.",
    )
    recovery_needed_percentage: PercentageRounded = Field(
        default=0.0,
        description="Percentage gain required to recover to previous peak.",
    )

    @computed_field(return_type=PercentageRounded)
    def max_drawdown_percentage(self) -> PercentageRounded:
        """Backward compatible alias for previous API field name."""
        return self.max_drawdown_pct

    @computed_field(return_type=float)
    def max_drawdown(self) -> float:
        """Legacy ratio-based drawdown (-0.5 == -50%)."""
        return (
            float(self.max_drawdown_pct) / 100
            if self.max_drawdown_pct is not None
            else 0.0
        )

    @computed_field(return_type=str | None)
    def max_drawdown_date(self) -> str | None:
        """Legacy alias returning trough date as ISO date string."""
        if not self.trough_date:
            return None
        return self.trough_date.date().isoformat()


class DailyTrendDataPoint(AnalyticsResponseModel):
    """Daily portfolio trend data point with category breakdowns."""

    date: datetime = Field(description="Date of the data point")
    total_value_usd: float = Field(ge=0.0, description="Total portfolio value in USD")
    change_percentage: float = Field(
        default=0.0, description="Day-over-day percentage change"
    )
    categories: list[dict[str, Any]] = Field(
        default_factory=list, description="Category breakdown with assets/debt/pnl"
    )
    protocols: list[str] = Field(
        default_factory=list, description="List of protocols active on this date"
    )
    by_protocol: dict[str, float] = Field(
        default_factory=dict, description="Value breakdown by protocol"
    )
    by_chain: dict[str, float] = Field(
        default_factory=dict, description="Value breakdown by chain"
    )

    @field_validator("protocols")
    @classmethod
    def validate_protocols_unique(cls, v: list[str]) -> list[str]:
        """Ensure protocols list contains no duplicates."""
        return validate_array_uniqueness(v, "protocols")


class PortfolioTrendResponse(PeriodAwareResponseMixin, AnalyticsResponseModel):
    """Historical portfolio trend with daily aggregations."""

    user_id: str = Field(description="User identifier")
    snapshot_date: date | None = Field(
        default=None, description="Canonical snapshot date used for this response"
    )
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of daily data points")
    daily_values: list[DailyTrendDataPoint] = Field(
        default_factory=list, description="Daily portfolio values with breakdowns"
    )
    summary: dict[str, Any] = Field(
        default_factory=dict, description="Summary statistics for the trend period"
    )

    @field_validator("daily_values")
    @classmethod
    def validate_temporal_ordering(
        cls, v: list[DailyTrendDataPoint]
    ) -> list[DailyTrendDataPoint]:
        """Ensure daily_values are in chronological order (ascending by date)."""
        if len(v) <= 1:
            return v

        dates = [point.date for point in v]
        if dates != sorted(dates):
            raise ValueError(
                "daily_values must be in chronological order (ascending by date)"
            )
        return v

    @field_validator("snapshot_date")
    @classmethod
    def _validate_snapshot_date_present(cls, v: date | None) -> date | None:
        """Allow snapshot_date to be optional while preserving type checks."""
        return v

    @model_validator(mode="after")
    def validate_snapshot_date_matches_latest(self) -> "PortfolioTrendResponse":
        """Ensure snapshot_date matches the latest daily_values date when provided."""
        if self.snapshot_date is None or not self.daily_values:
            return self

        latest_value = self.daily_values[-1].date
        latest = (
            latest_value.date() if isinstance(latest_value, datetime) else latest_value
        )
        if latest != self.snapshot_date:
            raise ValueError(
                "snapshot_date does not match latest daily_values date "
                f"({self.snapshot_date.isoformat()} vs {latest.isoformat()})"
            )
        return self


class CategoryAllocationDataPoint(AnalyticsResponseModel):
    """Portfolio allocation for a specific category on a given date."""

    date: str = Field(description="Date of the allocation snapshot (ISO format)")
    category: str = Field(description="Token category (btc, eth, stablecoins, others)")
    category_value_usd: float = Field(
        ge=0.0, description="USD value of this category on this date"
    )
    total_portfolio_value_usd: float = Field(
        ge=0.0, description="Total portfolio value on this date"
    )
    allocation_percentage: PercentageRounded = Field(
        ge=0.0, le=100.0, description="Percentage of portfolio in this category"
    )


class AllocationTimeseriesResponse(PeriodAwareResponseMixin, AnalyticsResponseModel):
    """Portfolio allocation breakdown over time by category."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of daily allocation snapshots")
    allocations: list[CategoryAllocationDataPoint] = Field(
        default_factory=list, description="Daily allocation snapshots"
    )
    summary: dict[str, Any] = Field(
        default_factory=dict, description="Summary with unique_dates and categories"
    )


class DrawdownDataPoint(BaseModel):
    """Daily drawdown data point with portfolio value and peak tracking."""

    date: datetime = Field(description="Date of the data point")
    portfolio_value: float = Field(ge=0.0, description="Portfolio value on this date")
    running_peak: float = Field(
        ge=0.0, description="Running maximum value up to this date"
    )
    drawdown_pct: PercentageRounded = Field(
        le=0.0, description="Drawdown percentage (negative)"
    )


class EnhancedDrawdownAnalysisResponse(PeriodAwareResponseMixin):
    """Enhanced drawdown analysis with daily values and running peaks."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of daily data points")
    drawdowns: list[DrawdownDataPoint] = Field(
        default_factory=list, description="Daily drawdown data points"
    )
    max_drawdown_pct: PercentageRounded = Field(
        le=0.0, description="Maximum drawdown as negative percentage"
    )


class UnderwaterPeriod(BaseModel):
    """Period during which portfolio was underwater (below previous peak)."""

    start_date: datetime = Field(description="Start of underwater period")
    end_date: datetime | None = Field(
        description="End of underwater period (None if ongoing)"
    )
    duration_days: int = Field(ge=0, description="Duration in days")
    max_drawdown_pct: PercentageRounded = Field(
        le=0.0, description="Maximum drawdown during this period"
    )
    recovered: bool = Field(description="Whether portfolio recovered to previous peak")


class UnderwaterRecoveryAnalysisResponse(PeriodAwareResponseMixin):
    """Underwater periods and recovery point analysis."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    underwater_periods: list[UnderwaterPeriod] = Field(
        default_factory=list, description="Periods portfolio was underwater"
    )
    currently_underwater: bool = Field(
        description="Whether portfolio is currently underwater"
    )


class RollingSharpeDataPoint(BaseModel):
    """30-day rolling Sharpe ratio data point."""

    date: datetime = Field(description="End date of the 30-day window")
    sharpe_ratio: float = Field(description="Sharpe ratio for this 30-day window")
    interpretation: str = Field(description="Sharpe ratio interpretation")
    window_days: int = Field(
        default=30, ge=1, description="Number of days in rolling window"
    )
    reliable: bool = Field(
        description="Whether this window has sufficient data for reliability"
    )


class RollingSharpeAnalysisResponse(PeriodAwareResponseMixin):
    """30-day rolling Sharpe ratio analysis with reliability indicators."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of rolling window data points")
    rolling_sharpe: list[RollingSharpeDataPoint] = Field(
        default_factory=list, description="30-day rolling Sharpe ratios"
    )
    reliability_assessment: str = Field(
        description="Overall reliability assessment of the analysis"
    )

    @computed_field(return_type=list[dict[str, Any]])
    def allocation_data(self) -> list[dict[str, Any]]:
        """Alias for previous API field name used by the frontend/tests."""
        return [item.model_dump() for item in self.rolling_sharpe]


class RollingVolatilityDataPoint(BaseModel):
    """30-day rolling volatility data point."""

    date: datetime = Field(description="End date of the 30-day window")
    volatility_daily: Float6dpRounded = Field(
        ge=0.0, description="Daily volatility for this window"
    )
    volatility_annualized: Float4dpRounded = Field(
        ge=0.0, description="Annualized volatility for this window"
    )
    interpretation: str = Field(description="Volatility level interpretation")
    window_days: int = Field(
        default=30, ge=1, description="Number of days in rolling window"
    )
    reliable: bool = Field(
        description="Whether this window has sufficient data for reliability"
    )


class RollingVolatilityAnalysisResponse(PeriodAwareResponseMixin):
    """30-day rolling volatility analysis with daily and annualized metrics."""

    user_id: str = Field(description="User identifier")
    period_days: int = Field(ge=1, description="Analysis period in days")
    data_points: int = Field(ge=0, description="Number of rolling window data points")
    rolling_volatility: list[RollingVolatilityDataPoint] = Field(
        default_factory=list, description="30-day rolling volatility values"
    )
    reliability_assessment: str = Field(
        description="Overall reliability assessment of the analysis"
    )

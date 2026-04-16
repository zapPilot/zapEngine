"""
Pydantic models for portfolio data validation and serialization.

This module contains comprehensive data validation models for DeFi portfolio analytics,
ensuring mathematical consistency and financial data integrity.
"""

from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from src.core.config import settings
from src.core.financial_utils import (
    sum_category_total_values,
)
from src.models.types import Float4dpRounded, PercentageRounded, USDRounded
from src.models.validation_utils import is_close, validate_array_uniqueness


class CategoryAllocation(BaseModel):
    """Portfolio allocation for a single category (btc, eth, stablecoins, others)."""

    total_value: USDRounded = Field(
        ge=0.0, description="Total USD value for this category (non-negative)"
    )
    percentage_of_portfolio: PercentageRounded = Field(
        ge=0.0,
        le=100.0,
        description="Percentage of total portfolio (0-100%)",
    )
    wallet_tokens_value: USDRounded = Field(
        ge=0.0, description="USD value from wallet tokens (non-negative)"
    )
    other_sources_value: USDRounded = Field(
        ge=0.0, description="USD value from other sources (non-negative)"
    )

    @model_validator(mode="after")
    def validate_component_sum(self) -> Self:
        """Validate that wallet_tokens + other_sources = total_value."""
        total = self.total_value
        wallet = self.wallet_tokens_value
        other = self.other_sources_value

        calculated_total = wallet + other
        tolerance = settings.validation.tolerance

        if not is_close(total, calculated_total, tolerance):
            raise ValueError(
                f"Category total_value ({total:.2f}) does not equal "
                f"wallet_tokens_value ({wallet:.2f}) + other_sources_value ({other:.2f}) "
                f"= {calculated_total:.2f} (tolerance: {tolerance})"
            )
        return self

    # Rounding handled by custom Annotated types


class PortfolioAllocation(BaseModel):
    """Complete portfolio allocation across all categories."""

    btc: CategoryAllocation
    eth: CategoryAllocation
    stablecoins: CategoryAllocation
    others: CategoryAllocation

    @model_validator(mode="after")
    def validate_percentages_sum_to_100(self) -> Self:
        """Validate that category percentages sum to approximately 100%."""
        categories = [self.btc, self.eth, self.stablecoins, self.others]
        categories = [cat for cat in categories if cat is not None]

        if not categories:
            return self  # pragma: no cover

        percentage_sum = sum(cat.percentage_of_portfolio for cat in categories)
        tolerance = settings.validation.percentage_tolerance

        # Allow for empty portfolios (0%) or normal portfolios (~100%)
        is_empty_portfolio = is_close(percentage_sum, 0.0, tolerance)
        is_normal_portfolio = is_close(percentage_sum, 100.0, tolerance)

        if not (is_empty_portfolio or is_normal_portfolio):
            raise ValueError(
                f"Portfolio allocation percentages sum to {percentage_sum:.2f}%, "
                f"should be 0% (empty) or 100% (normal portfolio). "
                f"Tolerance: ±{tolerance}%"
            )
        return self


class WalletTokenSummary(BaseModel):
    """Summary of wallet token holdings."""

    total_value_usd: USDRounded = Field(
        ge=0.0, description="Total USD value of wallet tokens (non-negative)"
    )
    token_count: int = Field(
        ge=0, description="Number of different tokens (non-negative integer)"
    )
    apr_30d: float | None = Field(
        default=0.0,
        ge=0.0,
        description="Deprecated 30d APR placeholder (set to 0)",
    )
    # Rounding handled by custom Annotated types where applicable

    @field_validator("token_count")
    @classmethod
    def validate_token_count_bounds(cls, v: int) -> int:
        """Validate token count is within reasonable bounds."""
        if v > settings.validation.max_token_count:
            raise ValueError(
                f"Token count {v} exceeds maximum allowed {settings.validation.max_token_count}"
            )
        return v


class ROIData(BaseModel):
    """ROI data with value, data point count, and starting balance."""

    value: Float4dpRounded = Field(
        ge=-100.0,
        description="ROI as percentage change of portfolio value",
    )
    data_points: int = Field(
        ge=0,
        description="Number of data points used for ROI calculation",
    )
    start_balance: USDRounded = Field(
        description="Portfolio balance at the start of the window (USD)",
    )

    # Rounding handled by custom Annotated types


class PortfolioROI(BaseModel):
    """Portfolio return on investment across configurable lookback windows."""

    windows: dict[str, ROIData] = Field(
        default_factory=dict,
        description="Mapping of ROI window identifier (e.g. roi_7d) to ROI data",
    )
    recommended_roi: Float4dpRounded = Field(
        ge=-100.0,
        description="Recommended ROI as percentage change of portfolio value",
    )
    recommended_period: str = Field(
        description="Identifier of the window used for the recommended ROI",
    )
    recommended_yearly_roi: Float4dpRounded = Field(
        default=0.0,
        description="Recommended ROI normalized to an annualized rate (percentage)",
    )
    estimated_yearly_pnl_usd: USDRounded = Field(
        default=0.0,
        description="Estimated yearly PnL in USD based on normalized ROI and start balance",
    )
    # Rounding handled by custom Annotated types

    @model_validator(mode="after")
    def validate_recommended_period_present(self) -> Self:
        """Ensure the recommended period exists within the windows mapping."""
        if self.recommended_period and self.recommended_period not in self.windows:
            raise ValueError(
                "Recommended ROI period must exist within the ROI windows mapping"
            )
        return self


class CategorySummaryDebt(BaseModel):
    """Debt summary by category."""

    btc: USDRounded = Field(ge=0.0, description="BTC category debt (non-negative)")
    eth: USDRounded = Field(ge=0.0, description="ETH category debt (non-negative)")
    stablecoins: USDRounded = Field(
        ge=0.0, description="Stablecoin category debt (non-negative)"
    )
    others: USDRounded = Field(
        ge=0.0, description="Others category debt (non-negative)"
    )
    # Rounding handled by custom Annotated types


class PoolDetail(BaseModel):
    """Individual pool performance detail with contribution metrics."""

    wallet: str = Field(description="Wallet address holding this pool position")
    snapshot_id: str = Field(
        description="Representative snapshot ID for this pool (UUID)"
    )
    snapshot_ids: list[str] = Field(
        default_factory=list,
        description="All snapshot IDs aggregated for this pool (UUIDs)",
    )
    chain: str = Field(description="Blockchain identifier (e.g., 'eth', 'arbitrum')")
    protocol_id: str = Field(description="Protocol identifier")
    protocol: str = Field(description="Protocol name (e.g., 'Aave V3', 'Hyperliquid')")
    protocol_name: str = Field(description="Display name for the protocol")
    asset_usd_value: USDRounded = Field(
        ge=0.0,
        description="Total USD value of assets in this pool position (non-negative)",
    )
    pool_symbols: list[str] = Field(
        default_factory=list,
        description="Token symbols in this pool (e.g., ['USDC', 'ETH'])",
    )
    contribution_to_portfolio: float = Field(
        ge=0.0,
        le=100.0,
        description="Percentage contribution to total portfolio value (0-100%)",
    )

    @field_validator("snapshot_id", mode="before")
    @classmethod
    def validate_uuid_format(cls, v: str | None) -> str | None:
        """Validate UUID string format for snapshot_id."""
        if v is None:
            return v  # pragma: no cover
        try:
            UUID(v)  # Validates format, raises ValueError if invalid
        except ValueError as e:
            raise ValueError(f"Invalid UUID format: {v}") from e
        return v

    @field_validator("snapshot_ids")
    @classmethod
    def validate_snapshot_ids_unique(cls, v: list[str]) -> list[str]:
        """Ensure snapshot_ids array contains no duplicates."""
        return validate_array_uniqueness(v, "snapshot_ids")

    @field_validator("pool_symbols")
    @classmethod
    def validate_pool_symbols_unique(cls, v: list[str]) -> list[str]:
        """Ensure pool_symbols array contains no duplicates."""
        return validate_array_uniqueness(v, "pool_symbols")

    # Rounding handled by custom Annotated types


class BorrowingSummary(BaseModel):
    """
    Borrowing position summary for landing page.

    Always present in response. When has_debt=false, all numeric fields are null/0.
    For detailed position data, use /borrowing/positions endpoint.
    """

    has_debt: bool = Field(description="Whether user has any borrowing positions")

    worst_health_rate: float | None = Field(
        default=None,
        description="Lowest health rate across all positions (null if no debt)",
    )

    overall_status: Literal["HEALTHY", "WARNING", "CRITICAL"] | None = Field(
        default=None,
        description="Overall risk status based on worst health rate (null if no debt)",
    )

    critical_count: int = Field(
        default=0,
        ge=0,
        description="Number of positions with health_rate < 1.5 (critical risk)",
    )

    warning_count: int = Field(
        default=0,
        ge=0,
        description="Number of positions with 1.5 <= health_rate < 2.0 (warning risk)",
    )

    healthy_count: int = Field(
        default=0,
        ge=0,
        description="Number of positions with health_rate >= 2.0 (healthy)",
    )

    @classmethod
    def empty(cls, has_debt: bool = False) -> "BorrowingSummary":
        """Create an empty borrowing summary with null/zero values."""
        return cls(
            has_debt=has_debt,
            worst_health_rate=None,
            overall_status=None,
            critical_count=0,
            warning_count=0,
            healthy_count=0,
        )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "has_debt": True,
                "worst_health_rate": 1.52,
                "overall_status": "WARNING",
                "critical_count": 1,
                "warning_count": 2,
                "healthy_count": 3,
            }
        }
    )


class BorrowingRiskMetrics(BaseModel):
    """Portfolio-level risk metrics for leveraged positions with per-position tracking."""

    has_leverage: bool = Field(description="Whether user has any leveraged positions")

    # Per-position tracking fields
    worst_health_rate: Float4dpRounded = Field(
        gt=0.0,
        description="Worst (lowest) health rate across all positions - primary risk metric",
    )
    overall_health_status: Literal["HEALTHY", "WARNING", "CRITICAL"] = Field(
        description="Overall portfolio health based on worst position (HEALTHY ≥2.0, WARNING 1.5-2.0, CRITICAL <1.5)"
    )
    critical_position_count: int = Field(
        ge=0,
        default=0,
        description="Number of positions with health rate < 1.5 (critical risk)",
    )
    warning_position_count: int = Field(
        ge=0,
        default=0,
        description="Number of positions with health rate 1.5-2.0 (needs attention)",
    )

    # Existing fields (kept for backward compatibility)
    leverage_ratio: Float4dpRounded = Field(
        gt=0.0, description="Portfolio leverage ratio (total_assets / net_worth)"
    )
    collateral_value_usd: USDRounded = Field(
        ge=0.0, description="Total collateral value in USD"
    )
    debt_value_usd: USDRounded = Field(ge=0.0, description="Total debt value in USD")
    liquidation_threshold: Float4dpRounded = Field(
        gt=0.0,
        description="Critical health rate threshold (conservative default for MVP)",
    )
    protocol_source: str = Field(
        description="Protocol source ('portfolio-aggregate' for MVP)"
    )
    position_count: int = Field(
        ge=1, description="Number of leveraged positions (estimated for MVP)"
    )

    # DEPRECATED: backward-compat alias derived from worst_health_rate
    @computed_field(return_type=Float4dpRounded)  # type: ignore[prop-decorator]
    @property
    def health_rate(self) -> Float4dpRounded:
        """Portfolio health rate (DEPRECATED - use worst_health_rate)."""
        return self.worst_health_rate

    # Rounding handled by custom Annotated types


class PortfolioResponse(BaseModel):
    """Complete portfolio response with comprehensive validation."""

    snapshot_date: date | None = Field(
        default=None, description="Canonical snapshot date for this response"
    )
    total_assets_usd: USDRounded = Field(
        ge=0.0,
        le=settings.validation.max_portfolio_value,
        description="Total portfolio assets in USD (non-negative)",
    )
    total_debt_usd: USDRounded = Field(
        ge=0.0, description="Total portfolio debt in USD (non-negative)"
    )
    total_net_usd: USDRounded = Field(description="Net portfolio value in USD")
    net_portfolio_value: USDRounded | None = Field(
        default=None,
        description="Alias for total_net_usd (backward compatibility)",
    )
    weighted_apr: float | None = Field(
        default=0.0, description="Deprecated weighted APR metric (set to 0)"
    )
    estimated_monthly_income: float | None = Field(
        default=0.0, description="Deprecated monthly income metric (set to 0)"
    )
    wallet_count: int = Field(
        ge=0,
        le=settings.validation.max_wallet_count,
        description="Number of wallets (non-negative integer)",
    )
    last_updated: datetime | None = Field(description="Last update timestamp")
    portfolio_allocation: PortfolioAllocation
    wallet_token_summary: WalletTokenSummary
    portfolio_roi: PortfolioROI
    category_summary_debt: CategorySummaryDebt

    # Pool details (used by landing page consistency tests)
    pool_details: list[PoolDetail] = Field(
        default_factory=list,
        description="Detailed pool performance entries for the landing page",
    )

    # Lightweight counts replacing pool_details array
    positions: int = Field(ge=0, description="Total number of positions")
    protocols: int = Field(ge=0, description="Total number of unique protocols")
    chains: int = Field(ge=0, description="Total number of unique chains")

    # Borrowing position summary (always present)
    borrowing_summary: BorrowingSummary = Field(
        description="Borrowing position summary (always present)",
    )

    @model_validator(mode="after")
    def validate_portfolio_allocation_sum_equals_total_assets(self) -> Self:
        """Validate that portfolio allocation sum equals total assets."""
        total_assets = self.total_assets_usd
        portfolio_allocation = self.portfolio_allocation

        if portfolio_allocation is None:
            return self  # pragma: no cover

        allocation_sum = sum_category_total_values(portfolio_allocation)

        tolerance = settings.validation.tolerance
        if abs(allocation_sum - total_assets) > tolerance:
            raise ValueError(
                f"Portfolio allocation sum ({allocation_sum:.2f}) does not match "
                f"total assets ({total_assets:.2f}). "
                f"Difference: {abs(allocation_sum - total_assets):.4f}, "
                f"Tolerance: {tolerance}"
            )
        return self

    @model_validator(mode="after")
    def validate_net_calculation(self) -> Self:
        """Validate that total_net_usd = total_assets_usd - total_debt_usd."""
        total_assets = self.total_assets_usd
        total_debt = self.total_debt_usd
        total_net = self.total_net_usd
        net_alias = self.net_portfolio_value

        calculated_net = total_assets - total_debt
        tolerance = settings.validation.tolerance

        if abs(total_net - calculated_net) > tolerance:
            raise ValueError(
                f"Total net value ({total_net:.2f}) does not equal "
                f"total_assets ({total_assets:.2f}) - total_debt ({total_debt:.2f}) "
                f"= {calculated_net:.2f}. Tolerance: {tolerance}"
            )

        if net_alias is None:
            object.__setattr__(self, "net_portfolio_value", total_net)
        elif abs(net_alias - total_net) > tolerance:
            raise ValueError(
                f"net_portfolio_value ({net_alias:.2f}) does not match total_net_usd "
                f"({total_net:.2f}). Tolerance: {tolerance}"
            )
        return self

    @model_validator(mode="after")
    def validate_snapshot_date_alignment(self) -> Self:
        """Ensure snapshot_date aligns with last_updated when provided."""
        if self.snapshot_date is None or self.last_updated is None:
            return self

        if self.last_updated.date() != self.snapshot_date:
            raise ValueError(
                "snapshot_date does not match last_updated date "
                f"({self.snapshot_date.isoformat()} vs {self.last_updated.date().isoformat()})"
            )
        return self

    @model_validator(mode="after")
    def validate_debt_to_assets_ratio(self) -> Self:
        """Validate debt-to-assets ratio is reasonable for DeFi portfolios."""
        total_assets = self.total_assets_usd
        total_debt = self.total_debt_usd

        if total_assets > 0:
            debt_ratio = total_debt / total_assets
            max_ratio = settings.validation.max_debt_to_assets_ratio

            if debt_ratio > max_ratio:
                raise ValueError(
                    f"Debt-to-assets ratio ({debt_ratio:.2%}) exceeds maximum allowed "
                    f"({max_ratio:.2%}) for portfolio safety"
                )
        return self

    # Rounding handled by custom Annotated types

    model_config = ConfigDict(
        # Allow extra fields for future extensibility
        extra="forbid",
        # Validate assignment to catch runtime modifications
        validate_assignment=True,
        # Use enum values for serialization
        use_enum_values=True,
        # JSON schema extra information
        json_schema_extra={
            "example": {
                "total_assets_usd": 75000.0,
                "total_debt_usd": 5000.0,
                "total_net_usd": 70000.0,
                "wallet_count": 3,
                "last_updated": "2025-01-01T12:00:00Z",
                "portfolio_allocation": {
                    "btc": {
                        "total_value": 30000.0,
                        "percentage_of_portfolio": 40.0,
                        "wallet_tokens_value": 10000.0,
                        "other_sources_value": 20000.0,
                    },
                    "eth": {
                        "total_value": 22500.0,
                        "percentage_of_portfolio": 30.0,
                        "wallet_tokens_value": 7500.0,
                        "other_sources_value": 15000.0,
                    },
                    "stablecoins": {
                        "total_value": 15000.0,
                        "percentage_of_portfolio": 20.0,
                        "wallet_tokens_value": 5000.0,
                        "other_sources_value": 10000.0,
                    },
                    "others": {
                        "total_value": 7500.0,
                        "percentage_of_portfolio": 10.0,
                        "wallet_tokens_value": 2500.0,
                        "other_sources_value": 5000.0,
                    },
                },
                "wallet_token_summary": {
                    "total_value_usd": 25000.0,
                    "token_count": 15,
                },
                "portfolio_roi": {
                    "windows": {
                        "roi_7d": {
                            "value": 1.25,
                            "data_points": 7,
                            "start_balance": 25000.0,
                        },
                        "roi_30d": {
                            "value": 3.4,
                            "data_points": 30,
                            "start_balance": 24000.0,
                        },
                        "roi_365d": {
                            "value": 28.75,
                            "data_points": 120,
                            "start_balance": 20000.0,
                        },
                    },
                    "recommended_roi": 3.4,
                    "recommended_period": "roi_30d",
                    "recommended_yearly_roi": 41.70,
                    "estimated_yearly_pnl_usd": 1420.0,
                },
                "category_summary_debt": {
                    "btc": 0.0,
                    "eth": 0.0,
                    "stablecoins": 3000.0,
                    "others": 2000.0,
                },
            }
        },
    )

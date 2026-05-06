from __future__ import annotations

from datetime import date, datetime
from typing import Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from src.models.analytics_responses import (
    EnhancedDrawdownAnalysisResponse,
    MaxDrawdownResponse,
    PortfolioTrendResponse,
    PortfolioVolatilityResponse,
    RollingSharpeAnalysisResponse,
    RollingVolatilityAnalysisResponse,
    SharpeRatioResponse,
    UnderwaterRecoveryAnalysisResponse,
)
from src.models.yield_returns import (
    YieldReturnsResponse,
)

from .types import PortfolioROIComputed


class ROICalculatorProtocol(Protocol):
    """Interface for ROI calculator services"""

    def compute_portfolio_roi(
        self, db: Session, user_id: UUID, *, current_snapshot_date: date | None = None
    ) -> PortfolioROIComputed: ...  # pragma: no cover


class TrendAnalysisServiceProtocol(Protocol):
    """Interface for portfolio trend analysis services"""

    # fmt: off
    def get_portfolio_trend(self, user_id: UUID, days: int = 30, wallet_address: str | None = None, limit: int = 100, snapshot_date: date | datetime | None = None) -> PortfolioTrendResponse: ...  # pragma: no cover
    # fmt: on


class RiskMetricsServiceProtocol(Protocol):
    """Interface for portfolio risk metrics calculation services"""

    def calculate_portfolio_volatility(
        self, user_id: UUID, days: int = 30, wallet_address: str | None = None
    ) -> PortfolioVolatilityResponse: ...  # pragma: no cover

    def calculate_sharpe_ratio(
        self, user_id: UUID, days: int = 30, wallet_address: str | None = None
    ) -> SharpeRatioResponse: ...  # pragma: no cover

    def calculate_max_drawdown(
        self, user_id: UUID, days: int = 90, wallet_address: str | None = None
    ) -> MaxDrawdownResponse: ...  # pragma: no cover


class DrawdownAnalysisServiceProtocol(Protocol):
    """Interface for portfolio drawdown analysis services"""

    def get_enhanced_drawdown_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> EnhancedDrawdownAnalysisResponse: ...  # pragma: no cover

    def get_underwater_recovery_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> UnderwaterRecoveryAnalysisResponse: ...  # pragma: no cover


class RollingAnalyticsServiceProtocol(Protocol):
    """Interface for rolling window analytics services"""

    def get_rolling_sharpe_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> RollingSharpeAnalysisResponse: ...  # pragma: no cover

    def get_rolling_volatility_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> RollingVolatilityAnalysisResponse: ...  # pragma: no cover


class YieldReturnServiceProtocol(Protocol):
    """Interface for Yield Return analytics services."""

    # fmt: off
    async def get_daily_yield_returns(self, user_id: UUID, *, wallet_address: str | None = None, days: int = 30, min_threshold: float = 0.0, protocols: list[str] | None = None, chains: list[str] | None = None) -> YieldReturnsResponse: ...  # pragma: no cover
    # fmt: on

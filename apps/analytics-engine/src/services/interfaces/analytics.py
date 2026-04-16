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
        self,
        db: Session,
        user_id: UUID,
        *,
        current_snapshot_date: date | None = None,
    ) -> PortfolioROIComputed:
        """
        Compute ROI percentages across the configured lookback windows.

        Args:
            db: Database session
            user_id: User identifier
            current_snapshot_date: Explicit snapshot date to use as the ROI calculation endpoint.
                                  When provided, calculates ROI windows relative to this date.
                                  When None, uses current datetime (legacy behavior).
                                  For consistency, callers should ALWAYS provide current_snapshot_date
                                  from CanonicalSnapshotService.

        Returns:
            Portfolio ROI data with windows and recommended period

        Results are cached for 12 hours to match daily ETL pattern.
        """
        ...  # pragma: no cover


class TrendAnalysisServiceProtocol(Protocol):
    """Interface for portfolio trend analysis services"""

    def get_portfolio_trend(
        self,
        user_id: UUID,
        days: int = 30,
        wallet_address: str | None = None,
        limit: int = 100,
        snapshot_date: date | datetime | None = None,
    ) -> PortfolioTrendResponse:
        """
        Get historical portfolio trend data with daily aggregations.

        Args:
            user_id: User identifier
            days: Number of days to look back
            wallet_address: Optional wallet filtering
            limit: Maximum data points to return
            snapshot_date: Optional specific date to anchor the trend end point.
                           If None, uses current date/time.

        Returns:
            PortfolioTrendResponse containing daily history and period summary.
        """
        ...  # pragma: no cover


class RiskMetricsServiceProtocol(Protocol):
    """Interface for portfolio risk metrics calculation services"""

    def calculate_portfolio_volatility(
        self, user_id: UUID, days: int = 30, wallet_address: str | None = None
    ) -> PortfolioVolatilityResponse:
        """Calculate annualized portfolio volatility using daily returns"""
        ...  # pragma: no cover

    def calculate_sharpe_ratio(
        self, user_id: UUID, days: int = 30, wallet_address: str | None = None
    ) -> SharpeRatioResponse:
        """Calculate Sharpe ratio with risk-adjusted return metrics"""
        ...  # pragma: no cover

    def calculate_max_drawdown(
        self, user_id: UUID, days: int = 90, wallet_address: str | None = None
    ) -> MaxDrawdownResponse:
        """Calculate maximum drawdown over specified period"""
        ...  # pragma: no cover


class DrawdownAnalysisServiceProtocol(Protocol):
    """Interface for portfolio drawdown analysis services"""

    def get_enhanced_drawdown_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> EnhancedDrawdownAnalysisResponse:
        """Get enhanced drawdown analysis with daily portfolio values and running peaks"""
        ...  # pragma: no cover

    def get_underwater_recovery_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> UnderwaterRecoveryAnalysisResponse:
        """Get underwater periods and recovery point analysis"""
        ...  # pragma: no cover


class RollingAnalyticsServiceProtocol(Protocol):
    """Interface for rolling window analytics services"""

    def get_rolling_sharpe_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> RollingSharpeAnalysisResponse:
        """Get 30-day rolling Sharpe ratio analysis with statistical reliability"""
        ...  # pragma: no cover

    def get_rolling_volatility_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> RollingVolatilityAnalysisResponse:
        """Get 30-day rolling volatility analysis with daily and annualized metrics"""
        ...  # pragma: no cover


class YieldReturnServiceProtocol(Protocol):
    """Interface for Yield Return analytics services."""

    async def get_daily_yield_returns(
        self,
        user_id: UUID,
        *,
        wallet_address: str | None = None,
        days: int = 30,
        min_threshold: float = 0.0,
        protocols: list[str] | None = None,
        chains: list[str] | None = None,
    ) -> YieldReturnsResponse:
        """Calculate Yield Returns for the requested period."""
        ...  # pragma: no cover

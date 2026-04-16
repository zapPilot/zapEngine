"""
Risk Metrics Service - Portfolio risk calculation and analysis

Handles volatility calculations, Sharpe ratio analysis, and maximum drawdown
measurements for comprehensive portfolio risk assessment.
"""

import statistics
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from typing import Any
from uuid import UUID

from src.core.config import settings
from src.core.constants import TRADING_DAYS_PER_YEAR
from src.core.utils import parse_iso_datetime
from src.models.analytics_responses import (
    MaxDrawdownResponse,
    PeriodInfo,
    PortfolioVolatilityResponse,
    SharpeRatioResponse,
)
from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES


@dataclass(frozen=True)
class _DrawdownExtrema:
    """Max/current drawdown extrema extracted from query rows."""

    max_drawdown_pct: float
    peak_value: float
    trough_value: float
    trough_date: datetime | str | None
    current_drawdown_ratio: float
    current_drawdown_pct: float


@dataclass(frozen=True)
class _DrawdownComputation:
    """Typed container for drawdown response assembly."""

    drawdown_data: list[dict[str, Any]]
    extrema: _DrawdownExtrema
    peak_date: datetime | None
    drawdown_duration_days: int


class RiskMetricsService(BaseAnalyticsService):
    """Service for portfolio risk metrics and financial ratios calculation."""

    @staticmethod
    def _extract_daily_returns(returns_data: list[dict[str, Any]]) -> list[float]:
        return [
            float(row["daily_return"])
            for row in returns_data
            if row["daily_return"] is not None
        ]

    def _get_daily_returns_base_data(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Get base daily returns data (shared by Volatility and Sharpe calculations).

        Executes the daily returns query once and caches the result.
        Both Volatility and Sharpe Ratio methods use this shared dataset,
        eliminating duplicate SQL execution.

        Args:
            user_id: UUID of the user
            days: Number of days for returns data
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            List of daily returns rows
        """
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)

        return self._cached_query_with_row_conversion(
            ("daily_returns_base", user_id, wallet_key, days),
            QUERY_NAMES.PORTFOLIO_DAILY_RETURNS,
            days,
            lambda start_date, end_date: {
                "user_id": self.uuid_to_str(user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": wallet_address,
            },
            ttl_hours=ttl_hours,
        )

    def calculate_portfolio_volatility(
        self, user_id: UUID, days: int = 30, wallet_address: str | None = None
    ) -> PortfolioVolatilityResponse:
        """
        Calculate annualized portfolio volatility using daily returns.

        Uses standard deviation of daily portfolio returns to measure volatility,
        then annualizes the result using sqrt(TRADING_DAYS_PER_YEAR) for trading days.

        Args:
            user_id: UUID of the user
            days: Number of days to include in calculation (default 30)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            PortfolioVolatilityResponse with volatility metrics and statistics

        Raises:
            Exception: Database operation errors
        """
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        cache_key = self._cache_key("risk_volatility", user_id, wallet_key, days)

        compute = partial(
            self._compute_portfolio_volatility_response,
            user_id=user_id,
            days=days,
            wallet_address=wallet_address,
        )
        return self._with_cache(cache_key, compute, ttl_hours=ttl_hours)

    def calculate_sharpe_ratio(
        self, user_id: UUID, days: int = 30, wallet_address: str | None = None
    ) -> SharpeRatioResponse:
        """
        Calculate Sharpe ratio using portfolio returns and configurable risk-free rate.

        Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
        Measures risk-adjusted return performance.

        Args:
            user_id: UUID of the user
            days: Number of days to include in calculation (default 30)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            SharpeRatioResponse with Sharpe ratio metrics and interpretation

        Raises:
            Exception: Database operation errors
        """
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        cache_key = self._cache_key(
            "risk_sharpe", user_id, wallet_key, days, settings.risk_free_rate_annual
        )

        compute = partial(
            self._compute_sharpe_ratio_response,
            user_id=user_id,
            days=days,
            wallet_address=wallet_address,
        )
        return self._with_cache(cache_key, compute, ttl_hours=ttl_hours)

    def calculate_max_drawdown(
        self, user_id: UUID, days: int = 90, wallet_address: str | None = None
    ) -> MaxDrawdownResponse:
        """
        Calculate maximum drawdown over specified period.

        Measures the largest peak-to-trough decline in portfolio value,
        providing essential downside risk assessment.

        Args:
            user_id: UUID of the user
            days: Number of days to analyze (default 90)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            MaxDrawdownResponse with drawdown analysis and risk metrics

        Raises:
            Exception: Database operation errors
        """
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        cache_key = self._cache_key("risk_max_drawdown", user_id, wallet_key, days)

        compute = partial(
            self._compute_max_drawdown_response,
            user_id=user_id,
            days=days,
            wallet_address=wallet_address,
        )
        return self._with_cache(cache_key, compute, ttl_hours=ttl_hours)

    def _compute_portfolio_volatility_response(
        self,
        *,
        user_id: UUID,
        days: int,
        wallet_address: str | None,
    ) -> PortfolioVolatilityResponse:
        """Compute portfolio volatility payload for cache wrapper."""
        _, _, period_info_dict = self._date_range_with_period(days)
        period_info = PeriodInfo(**period_info_dict)
        returns_data = self._get_daily_returns_base_data(user_id, days, wallet_address)

        daily_returns = self._extract_daily_returns(returns_data)
        if len(daily_returns) < 2:
            return PortfolioVolatilityResponse(
                user_id=self.uuid_to_str(user_id),
                period_days=days,
                data_points=len(daily_returns),
                volatility_daily=0.0,
                volatility_annualized=0.0,
                average_daily_return=0.0,
                period_info=period_info,
                message="Insufficient data for volatility calculation (minimum 2 data points required)",
            )

        volatility_daily = statistics.stdev(daily_returns)
        average_daily_return = statistics.mean(daily_returns)
        volatility_annualized = volatility_daily * (TRADING_DAYS_PER_YEAR**0.5)
        return PortfolioVolatilityResponse(
            user_id=self.uuid_to_str(user_id),
            period_days=days,
            data_points=len(daily_returns),
            volatility_daily=volatility_daily,
            volatility_annualized=volatility_annualized,
            average_daily_return=average_daily_return,
            period_info=period_info,
        )

    def _compute_sharpe_ratio_response(
        self,
        *,
        user_id: UUID,
        days: int,
        wallet_address: str | None,
    ) -> SharpeRatioResponse:
        """Compute Sharpe ratio payload for cache wrapper."""
        _, _, period_info_dict = self._date_range_with_period(days)
        period_info = PeriodInfo(**period_info_dict)
        returns_data = self._get_daily_returns_base_data(user_id, days, wallet_address)

        daily_returns = self._extract_daily_returns(returns_data)
        if len(daily_returns) < 2:
            return SharpeRatioResponse(
                user_id=self.uuid_to_str(user_id),
                period_days=days,
                data_points=len(daily_returns),
                sharpe_ratio=0.0,
                portfolio_return_annual=0.0,
                risk_free_rate_annual=settings.risk_free_rate_annual,
                excess_return=0.0,
                volatility_annual=0.0,
                interpretation="Insufficient Data",
                period_info=period_info,
                message="Insufficient data for Sharpe ratio calculation (minimum 2 data points required)",
            )

        avg_daily_return = statistics.mean(daily_returns)
        volatility_daily = statistics.stdev(daily_returns)
        portfolio_return_annual = avg_daily_return * TRADING_DAYS_PER_YEAR
        volatility_annual = volatility_daily * (TRADING_DAYS_PER_YEAR**0.5)

        risk_free_rate = settings.risk_free_rate_annual
        excess_return = portfolio_return_annual - risk_free_rate
        sharpe_ratio = (
            excess_return / volatility_annual if volatility_annual > 0 else 0.0
        )
        return SharpeRatioResponse(
            user_id=self.uuid_to_str(user_id),
            period_days=days,
            data_points=len(daily_returns),
            sharpe_ratio=sharpe_ratio,
            portfolio_return_annual=portfolio_return_annual,
            risk_free_rate_annual=risk_free_rate,
            excess_return=excess_return,
            volatility_annual=volatility_annual,
            interpretation=self.context.interpret_sharpe_ratio(sharpe_ratio),
            period_info=period_info,
        )

    def _compute_max_drawdown_response(
        self,
        *,
        user_id: UUID,
        days: int,
        wallet_address: str | None,
    ) -> MaxDrawdownResponse:
        """Compute max drawdown payload for cache wrapper."""
        _, _, period_info_dict = self._date_range_with_period(days)
        period_info = PeriodInfo(**period_info_dict)
        drawdown_data = self._get_drawdown_base_data(user_id, days, wallet_address)

        if not drawdown_data:
            return self._build_empty_max_drawdown_response(
                user_id=user_id,
                days=days,
                period_info=period_info,
            )

        computation = self._build_drawdown_computation(drawdown_data)
        return self._build_max_drawdown_response(
            user_id=user_id,
            days=days,
            period_info=period_info,
            computation=computation,
        )

    def _build_drawdown_computation(
        self,
        drawdown_data: list[dict[str, Any]],
    ) -> _DrawdownComputation:
        """Build typed drawdown computation details from raw query rows."""
        extrema = self._extract_drawdown_extrema(drawdown_data)
        peak_date = self._resolve_peak_date_for_trough(
            drawdown_data=drawdown_data,
            trough_date=extrema.trough_date,
            peak_value=extrema.peak_value,
        )
        drawdown_duration_days = self._compute_drawdown_duration_days(
            peak_date=peak_date,
            trough_date=extrema.trough_date,
        )
        return _DrawdownComputation(
            drawdown_data=drawdown_data,
            extrema=extrema,
            peak_date=peak_date,
            drawdown_duration_days=drawdown_duration_days,
        )

    @staticmethod
    def _coerce_drawdown_datetime(value: datetime | str | None) -> datetime | None:
        """Convert drawdown timestamp input to a naive datetime."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(tzinfo=None)
        try:
            dt = parse_iso_datetime(value)
            return dt.replace(tzinfo=None)
        except ValueError:
            return datetime.fromtimestamp(0)

    def _build_empty_max_drawdown_response(
        self,
        *,
        user_id: UUID,
        days: int,
        period_info: PeriodInfo,
    ) -> MaxDrawdownResponse:
        """Build the empty max drawdown response payload."""
        return MaxDrawdownResponse(
            user_id=self.uuid_to_str(user_id),
            period_days=days,
            data_points=0,
            max_drawdown_pct=0.0,
            peak_value=0.0,
            trough_value=0.0,
            peak_date=None,
            trough_date=None,
            drawdown_duration_days=0,
            current_drawdown=0.0,
            current_drawdown_percentage=0.0,
            recovery_needed_percentage=0.0,
            period_info=period_info,
            message="No portfolio data found",
        )

    @staticmethod
    def _extract_drawdown_extrema(
        drawdown_data: list[dict[str, Any]],
    ) -> _DrawdownExtrema:
        """Extract extrema and current drawdown metrics from drawdown rows."""
        max_drawdown_row = min(drawdown_data, key=lambda x: float(x["drawdown_pct"]))
        max_drawdown_pct = float(max_drawdown_row["drawdown_pct"]) * 100
        peak_value = float(max_drawdown_row["peak_value"])
        trough_value = float(max_drawdown_row["portfolio_value"])
        trough_date = max_drawdown_row["date"]
        current_row = drawdown_data[-1]
        current_drawdown_ratio = float(current_row["drawdown_pct"])
        current_drawdown_pct = current_drawdown_ratio * 100
        return _DrawdownExtrema(
            max_drawdown_pct=max_drawdown_pct,
            peak_value=peak_value,
            trough_value=trough_value,
            trough_date=trough_date,
            current_drawdown_ratio=current_drawdown_ratio,
            current_drawdown_pct=current_drawdown_pct,
        )

    def _resolve_peak_date_for_trough(
        self,
        *,
        drawdown_data: list[dict[str, Any]],
        trough_date: datetime | str | None,
        peak_value: float,
    ) -> datetime | None:
        """Find first peak timestamp associated with the max drawdown trough."""
        trough_dt = self._coerce_drawdown_datetime(trough_date)
        if trough_dt is None:
            return None

        for row in drawdown_data:
            row_date = self._coerce_drawdown_datetime(row["date"])
            if row_date is None or row_date > trough_dt:
                continue

            row_peak = float(row["peak_value"])
            if abs(row_peak - peak_value) < 0.01:  # Float comparison tolerance
                return row_date

        return None

    def _compute_drawdown_duration_days(
        self,
        *,
        peak_date: datetime | None,
        trough_date: datetime | str | None,
    ) -> int:
        """Compute non-negative day duration between peak and trough."""
        if peak_date is None:
            return 0

        trough_dt = self._coerce_drawdown_datetime(trough_date)
        if trough_dt is None:
            return 0

        duration = (trough_dt - peak_date).days
        return max(0, duration)

    def _build_max_drawdown_response(
        self,
        *,
        user_id: UUID,
        days: int,
        period_info: PeriodInfo,
        computation: _DrawdownComputation,
    ) -> MaxDrawdownResponse:
        """Build the populated max drawdown response payload."""
        trough_datetime = self._coerce_drawdown_datetime(
            computation.extrema.trough_date
        )
        return MaxDrawdownResponse(
            user_id=self.uuid_to_str(user_id),
            period_days=days,
            data_points=len(computation.drawdown_data),
            max_drawdown_pct=computation.extrema.max_drawdown_pct,
            peak_value=computation.extrema.peak_value,
            trough_value=computation.extrema.trough_value,
            peak_date=computation.peak_date,
            trough_date=trough_datetime,
            drawdown_duration_days=computation.drawdown_duration_days,
            current_drawdown=computation.extrema.current_drawdown_ratio,
            current_drawdown_percentage=computation.extrema.current_drawdown_pct,
            recovery_needed_percentage=abs(computation.extrema.max_drawdown_pct),
            period_info=period_info,
        )

"""
Rolling Analytics Service - Rolling window financial metrics

Handles rolling Sharpe ratio and volatility calculations with configurable
windows (7-365 days). Includes statistical reliability indicators and
educational context. Note: 30+ day windows recommended for statistical significance.
"""

import statistics
from typing import Any
from uuid import UUID

from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES


def _extract_latest(
    rows: list[dict[str, Any]], key: str, default: float = 0.0
) -> float:
    """Extract latest value from timeseries with None fallback."""
    value = rows[-1].get(key)
    return float(value) if value is not None else default


class RollingAnalyticsService(BaseAnalyticsService):
    """Service for rolling window financial analytics and reliability assessment."""

    def _get_rolling_metrics_base_data(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Get base rolling metrics data (shared by Sharpe and Volatility calculations).

        Executes the unified rolling metrics query once and caches the result.
        Both Sharpe and Volatility methods extract their respective columns from
        this shared dataset, eliminating duplicate SQL execution.

        Args:
            user_id: UUID of the user
            days: Number of days for rolling metrics
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            List of rolling metrics dictionaries with all columns
        """
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)

        return self._cached_query_with_row_conversion(
            (
                "rolling_metrics_base",
                user_id,
                wallet_key,
                days,
            ),  # Include wallet in cache key
            QUERY_NAMES.PORTFOLIO_ROLLING_METRICS,
            days,
            lambda start_date, _end_date: {
                "user_id": self.uuid_to_str(user_id),
                "start_date": start_date,
                "wallet_address": wallet_address,
            },
            ttl_hours=ttl_hours,  # Conditional TTL
        )

    def get_rolling_sharpe_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> dict[str, Any]:
        """
        Get 30-day rolling Sharpe ratio analysis with statistical reliability indicators.

        Returns daily 30-day rolling Sharpe ratios with clear labeling about statistical
        limitations for short-term analysis. Includes reliability flags and window size
        information for educational context.

        Statistical Disclaimer: 30-day Sharpe ratios are directional indicators only.
        Statistically robust analysis typically requires 90+ days of data.

        Args:
            user_id: UUID of the user
            days: Number of days for rolling Sharpe analysis (minimum 7 accepted, 30+ recommended for statistical reliability)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            Dictionary with rolling Sharpe analysis data and statistical context

        Raises:
            Exception: Database operation errors
        """
        _, _, period_info = self._date_range_with_period(days)

        rolling_sharpe_timeseries = self._get_rolling_metrics_base_data(
            user_id, days, wallet_address
        )

        if not rolling_sharpe_timeseries:
            return self._build_empty_response(
                user_id,
                period_info,
                rolling_sharpe_data=[],
                data_points=0,
                summary={
                    "latest_sharpe_ratio": 0.0,
                    "avg_sharpe_ratio": 0.0,
                    "reliable_data_points": 0,
                    "statistical_reliability": "Insufficient Data",
                },
                educational_context=self.context.build_sharpe_educational_context(0.0),
                message="No rolling Sharpe data found for the specified period",
            )

        # Calculate summary statistics
        valid_sharpe_ratios = [
            float(row["rolling_sharpe_ratio"])
            for row in rolling_sharpe_timeseries
            if row["rolling_sharpe_ratio"] is not None
        ]

        reliable_data_points = sum(
            1 for row in rolling_sharpe_timeseries if row["is_statistically_reliable"]
        )

        latest_sharpe_ratio = _extract_latest(
            rolling_sharpe_timeseries, "rolling_sharpe_ratio"
        )

        avg_sharpe_ratio = (
            statistics.mean(valid_sharpe_ratios) if valid_sharpe_ratios else 0.0
        )

        # Determine statistical reliability
        reliability_assessment = self.context.assess_statistical_reliability(
            reliable_data_points, len(rolling_sharpe_timeseries), days
        )

        return {
            "user_id": self.uuid_to_str(user_id),
            "period": period_info,
            "rolling_sharpe_data": rolling_sharpe_timeseries,
            "data_points": len(rolling_sharpe_timeseries),
            "summary": {
                "latest_sharpe_ratio": round(latest_sharpe_ratio, 4),
                "avg_sharpe_ratio": round(avg_sharpe_ratio, 4),
                "reliable_data_points": reliable_data_points,
                "statistical_reliability": reliability_assessment,
            },
            "educational_context": self.context.build_sharpe_educational_context(
                avg_sharpe_ratio
            ),
        }

    def get_rolling_volatility_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> dict[str, Any]:
        """
        Get 30-day rolling volatility analysis with both daily and annualized metrics.

        Returns rolling volatility calculations with clear distinctions between daily
        and annualized figures. Includes statistical reliability indicators and
        educational context about short-term volatility measurement.

        Educational Note: Shows both daily volatility and annualized projections.
        Short-term volatility can be highly variable in DeFi markets.

        Args:
            user_id: UUID of the user
            days: Number of days for rolling volatility analysis (minimum 7 accepted, 30+ recommended for statistical reliability)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            Dictionary with rolling volatility analysis data and educational context

        Raises:
            Exception: Database operation errors
        """
        _, _, period_info = self._date_range_with_period(days)

        rolling_volatility_timeseries = self._get_rolling_metrics_base_data(
            user_id, days, wallet_address
        )

        if not rolling_volatility_timeseries:
            return self._build_empty_response(
                user_id,
                period_info,
                rolling_volatility_data=[],
                data_points=0,
                summary={
                    "latest_daily_volatility": 0.0,
                    "latest_annualized_volatility": 0.0,
                    "avg_daily_volatility": 0.0,
                    "avg_annualized_volatility": 0.0,
                    "reliable_data_points": 0,
                },
                educational_context=self.context.build_volatility_educational_context(
                    0.0
                ),
                message="No rolling volatility data found for the specified period",
            )

        # Calculate summary statistics
        valid_daily_volatilities = [
            float(row["rolling_volatility_daily_pct"])
            for row in rolling_volatility_timeseries
            if row["rolling_volatility_daily_pct"] is not None
        ]

        valid_annualized_volatilities = [
            float(row["annualized_volatility_pct"])
            for row in rolling_volatility_timeseries
            if row["annualized_volatility_pct"] is not None
        ]

        reliable_data_points = sum(
            1
            for row in rolling_volatility_timeseries
            if row["is_statistically_reliable"]
        )

        latest_daily_volatility = _extract_latest(
            rolling_volatility_timeseries, "rolling_volatility_daily_pct"
        )
        latest_annualized_volatility = _extract_latest(
            rolling_volatility_timeseries, "annualized_volatility_pct"
        )

        avg_daily_volatility = (
            statistics.mean(valid_daily_volatilities)
            if valid_daily_volatilities
            else 0.0
        )

        avg_annualized_volatility = (
            statistics.mean(valid_annualized_volatilities)
            if valid_annualized_volatilities
            else 0.0
        )

        return {
            "user_id": self.uuid_to_str(user_id),
            "period": period_info,
            "rolling_volatility_data": rolling_volatility_timeseries,
            "data_points": len(rolling_volatility_timeseries),
            "summary": {
                "latest_daily_volatility": round(latest_daily_volatility, 4),
                "latest_annualized_volatility": round(latest_annualized_volatility, 2),
                "avg_daily_volatility": round(avg_daily_volatility, 4),
                "avg_annualized_volatility": round(avg_annualized_volatility, 2),
                "reliable_data_points": reliable_data_points,
            },
            "educational_context": self.context.build_volatility_educational_context(
                avg_annualized_volatility
            ),
        }

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


def _valid_floats(rows: list[dict[str, Any]], key: str) -> list[float]:
    """Collect non-None values for ``key`` as floats, preserving row order."""
    return [float(row[key]) for row in rows if row[key] is not None]


class RollingAnalyticsService(BaseAnalyticsService):
    """Service for rolling window financial analytics and reliability assessment."""

    def _get_rolling_metrics_base_data(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> list[dict[str, Any]]:
        """Fetch cached rolling metric rows shared by Sharpe and volatility."""
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
        """Return rolling Sharpe time series and reliability summary."""
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
        valid_sharpe_ratios = _valid_floats(
            rolling_sharpe_timeseries, "rolling_sharpe_ratio"
        )

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
        """Return rolling volatility time series and reliability summary."""
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
        valid_daily_volatilities = _valid_floats(
            rolling_volatility_timeseries, "rolling_volatility_daily_pct"
        )

        valid_annualized_volatilities = _valid_floats(
            rolling_volatility_timeseries, "annualized_volatility_pct"
        )

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

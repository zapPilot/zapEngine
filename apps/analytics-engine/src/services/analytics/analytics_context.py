"""
Portfolio Analytics Context - Shared utility functions for analytics services

Provides stateless utility methods for date calculations, period information,
and interpretation helpers used across multiple portfolio analytics services.

Implements explicit singleton pattern for consistent instance reuse across
all analytics services.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from src.core.config import settings
from src.core.constants import TRADING_DAYS_PER_YEAR


class PortfolioAnalyticsContext:
    """Shared utilities for portfolio analytics calculations and interpretations.

    Uses centralized configuration from settings.analytics for all thresholds and parameters.
    """

    def __init__(self) -> None:
        """Initialize context with centralized analytics settings."""
        self._analytics_settings = settings.analytics

    def calculate_date_range(
        self, days: int, end_date: datetime | None = None
    ) -> tuple[datetime, datetime]:
        """
        Calculate start and end dates for a given lookback period.

        Args:
            days: Number of days to look back from now
            end_date: Optional end date to anchor the range (defaults to now)

        Returns:
            tuple: (start_date, end_date) as datetime objects in UTC
        """
        end_date = end_date or datetime.now(UTC)
        start_date = end_date - timedelta(days=days)
        return start_date, end_date

    def build_period_info(
        self, start_date: datetime, end_date: datetime, days: int
    ) -> dict[str, str | int]:
        """
        Build standardized period info dictionary.

        Args:
            start_date: Period start date
            end_date: Period end date
            days: Number of days in period

        Returns:
            dict: Standardized period info with ISO formatted dates
        """
        return {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": days,
        }

    def interpret_sharpe_ratio(self, ratio: float) -> str:
        """Interpret Sharpe ratio value with standard financial thresholds."""
        thresholds = [
            (self._analytics_settings.sharpe_poor_threshold, "Poor"),
            (self._analytics_settings.sharpe_below_avg_threshold, "Below Average"),
            (self._analytics_settings.sharpe_good_threshold, "Good"),
            (self._analytics_settings.sharpe_very_good_threshold, "Very Good"),
        ]
        for threshold, label in thresholds:
            if ratio < threshold:
                return label
        return "Excellent"

    def interpret_volatility_level(self, annualized_volatility: float) -> str:
        """Interpret annualized volatility level for DeFi context."""
        thresholds = [
            (self._analytics_settings.volatility_very_low_threshold, "Very Low"),
            (self._analytics_settings.volatility_low_threshold, "Low"),
            (self._analytics_settings.volatility_moderate_threshold, "Moderate"),
            (self._analytics_settings.volatility_high_threshold, "High"),
        ]
        for threshold, label in thresholds:
            if annualized_volatility < threshold:
                return label
        return "Very High"

    def assess_statistical_reliability(
        self, reliable_points: int, total_points: int, period_days: int
    ) -> str:
        """
        Assess statistical reliability of financial metrics based on data points.

        Args:
            reliable_points: Number of statistically reliable data points
            total_points: Total number of data points
            period_days: Number of days in the period

        Returns:
            str: Reliability assessment description
        """
        if period_days < self._analytics_settings.reliability_min_period:
            return "Unreliable - Insufficient Period"
        if reliable_points == 0:
            return f"Unreliable - No {self._analytics_settings.rolling_window_days}-day Windows"
        if period_days < self._analytics_settings.reliability_robust_period:
            return "Directional Only - Limited Period"
        if (
            reliable_points / total_points
            < self._analytics_settings.reliability_min_window_ratio
        ):
            return "Partially Reliable"
        return "Statistically Robust"

    def build_sharpe_educational_context(self, avg_sharpe: float) -> dict[str, Any]:
        """
        Build educational context for rolling Sharpe ratio analysis.

        Provides standardized educational messaging about rolling Sharpe ratio
        interpretation, reliability warnings, and best practices.

        Args:
            avg_sharpe: Average Sharpe ratio to interpret

        Returns:
            dict: Educational context with reliability warnings and interpretation
        """
        window_days = self._analytics_settings.rolling_window_days
        robust_days = self._analytics_settings.reliability_robust_period
        return {
            "reliability_warning": f"{window_days}-day Sharpe ratios are directional indicators only",
            "recommended_minimum": f"{robust_days}+ days for statistically robust analysis",
            "window_size": window_days,
            "interpretation": self.interpret_sharpe_ratio(avg_sharpe),
        }

    def build_volatility_educational_context(
        self, avg_volatility: float
    ) -> dict[str, Any]:
        """
        Build educational context for rolling volatility analysis.

        Provides standardized educational messaging about rolling volatility
        calculation methods, interpretation, and DeFi-specific considerations.

        Args:
            avg_volatility: Average annualized volatility to interpret

        Returns:
            dict: Educational context with calculation method and interpretation
        """
        window_days = self._analytics_settings.rolling_window_days
        return {
            "volatility_note": "Short-term volatility can be highly variable in DeFi markets",
            "calculation_method": f"{window_days}-day rolling standard deviation of daily returns",
            "annualization_factor": f"Daily volatility * sqrt({TRADING_DAYS_PER_YEAR} trading days)",
            "window_size": window_days,
            "interpretation": self.interpret_volatility_level(avg_volatility),
        }


# Module-level singleton for consistent instance reuse across all services
_analytics_context_singleton: PortfolioAnalyticsContext | None = None


def get_analytics_context() -> PortfolioAnalyticsContext:
    """
    Get the shared PortfolioAnalyticsContext singleton instance.

    Uses explicit singleton pattern to ensure all analytics services share
    the same context instance, eliminating memory overhead from multiple
    instantiations.

    Returns:
        PortfolioAnalyticsContext: Singleton instance with shared utilities
    """
    global _analytics_context_singleton
    if _analytics_context_singleton is None:
        _analytics_context_singleton = PortfolioAnalyticsContext()
    return _analytics_context_singleton

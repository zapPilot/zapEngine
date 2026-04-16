"""
Dashboard Parameter Models

Defines parameter objects for dashboard service configuration,
replacing primitive obsession with strongly-typed, validated models.
"""

from pydantic import BaseModel, Field


class DashboardTimeRanges(BaseModel):
    """
    Time range configuration for dashboard analytics.

    Consolidates the 5 separate day parameters into a single
    validated parameter object following the Parameter Object pattern.
    """

    trend_days: int = Field(
        default=30,
        ge=1,
        description="Days for trend analysis (default: 30)",
    )
    drawdown_days: int = Field(
        default=90,
        ge=1,
        description="Days for drawdown analysis (default: 90)",
    )
    rolling_days: int = Field(
        default=40,
        ge=7,
        description="Days for rolling analytics (min 7, default: 40)",
    )

    def to_cache_key_parts(self) -> tuple[int, int, int]:
        """
        Convert to tuple for cache key generation.

        Returns:
            Tuple of (trend_days, drawdown_days, rolling_days)
        """
        return (
            self.trend_days,
            self.drawdown_days,
            self.rolling_days,
        )

    def to_log_dict(self) -> dict[str, int]:
        """
        Convert to dict for structured logging.

        Returns:
            Dictionary with all day parameters for logging
        """
        return {
            "trend_days": self.trend_days,
            "drawdown_days": self.drawdown_days,
            "rolling_days": self.rolling_days,
        }

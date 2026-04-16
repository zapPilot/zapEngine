"""
Drawdown Analysis Service - Portfolio drawdown and recovery analysis

Handles enhanced drawdown calculations, underwater period tracking, and
recovery point detection for comprehensive downside risk visualization.
"""

from typing import Any
from uuid import UUID

from src.services.shared.base_analytics_service import BaseAnalyticsService


class DrawdownAnalysisService(BaseAnalyticsService):
    """Service for portfolio drawdown and underwater analysis."""

    def get_enhanced_drawdown_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> dict[str, Any]:
        """
        Get enhanced drawdown analysis with daily portfolio values and running peaks.

        Returns detailed daily drawdown data including portfolio values, running peaks,
        and daily drawdown percentages for comprehensive drawdown visualization.

        Args:
            user_id: UUID of the user
            days: Number of days for enhanced drawdown analysis (default 40)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            Dictionary with enhanced drawdown analysis data and summary metrics

        Raises:
            Exception: Database operation errors
        """
        _, _, period_info = self._date_range_with_period(days)

        drawdown_timeseries = self._get_drawdown_base_data(
            user_id, days, wallet_address
        )

        if not drawdown_timeseries:
            return self._build_empty_response(
                user_id,
                period_info,
                drawdown_data=[],
                data_points=0,
                summary={
                    "max_drawdown_pct": 0.0,
                    "current_drawdown_pct": 0.0,
                    "peak_value": 0.0,
                    "current_value": 0.0,
                },
                message="No drawdown data found for the specified period",
            )

        # Calculate summary statistics
        max_drawdown_pct = min(
            float(row["drawdown_pct"]) for row in drawdown_timeseries
        )
        current_drawdown_pct = float(drawdown_timeseries[-1]["drawdown_pct"])
        peak_value = max(float(row["peak_value"]) for row in drawdown_timeseries)
        current_value = float(drawdown_timeseries[-1]["portfolio_value"])

        return {
            "user_id": self.uuid_to_str(user_id),
            "period_info": period_info,
            "drawdown_data": drawdown_timeseries,
            "data_points": len(drawdown_timeseries),
            "summary": {
                "max_drawdown_pct": round(max_drawdown_pct, 2),
                "current_drawdown_pct": round(current_drawdown_pct, 2),
                "peak_value": round(peak_value, 2),
                "current_value": round(current_value, 2),
            },
        }

    def get_underwater_recovery_analysis(
        self, user_id: UUID, days: int = 40, wallet_address: str | None = None
    ) -> dict[str, Any]:
        """
        Get underwater periods and recovery point analysis.

        Returns daily underwater status, underwater percentages, and recovery point
        detection for comprehensive understanding of portfolio recovery patterns.

        Args:
            user_id: UUID of the user
            days: Number of days for underwater recovery analysis (default 40)
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            Dictionary with underwater analysis data and recovery statistics

        Raises:
            Exception: Database operation errors
        """
        _, _, period_info = self._date_range_with_period(days)

        underwater_timeseries = self._get_drawdown_base_data(
            user_id, days, wallet_address
        )

        if not underwater_timeseries:
            return self._build_empty_response(
                user_id,
                period_info,
                underwater_data=[],
                data_points=0,
                summary={
                    "total_underwater_days": 0,
                    "underwater_percentage": 0.0,
                    "recovery_points": 0,
                    "current_underwater_pct": 0.0,
                    "is_currently_underwater": False,
                },
                message="No underwater data found for the specified period",
            )

        # Calculate summary statistics
        total_underwater_days = sum(
            1 for row in underwater_timeseries if row["is_underwater"]
        )
        underwater_percentage = (
            (total_underwater_days / len(underwater_timeseries)) * 100
            if underwater_timeseries
            else 0.0
        )
        recovery_points = sum(
            1 for row in underwater_timeseries if row["recovery_point"]
        )
        current_underwater_pct = float(underwater_timeseries[-1]["underwater_pct"])
        is_currently_underwater = underwater_timeseries[-1]["is_underwater"]

        return {
            "user_id": self.uuid_to_str(user_id),
            "period_info": period_info,
            "underwater_data": underwater_timeseries,
            "data_points": len(underwater_timeseries),
            "summary": {
                "total_underwater_days": total_underwater_days,
                "underwater_percentage": round(underwater_percentage, 2),
                "recovery_points": recovery_points,
                "current_underwater_pct": round(current_underwater_pct, 2),
                "is_currently_underwater": is_currently_underwater,
            },
        }

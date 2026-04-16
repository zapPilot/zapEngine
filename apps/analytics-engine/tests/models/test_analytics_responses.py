"""Tests for analytics response model validation."""

from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from src.models.analytics_responses import (
    AllocationTimeseriesResponse,
    DailyTrendDataPoint,
    DrawdownDataPoint,
    EnhancedDrawdownAnalysisResponse,
    MaxDrawdownResponse,
    PeriodInfo,
    PortfolioTrendResponse,
    PortfolioVolatilityResponse,
    RollingSharpeAnalysisResponse,
    RollingVolatilityAnalysisResponse,
    SharpeRatioResponse,
    UnderwaterRecoveryAnalysisResponse,
)


def test_portfolio_trend_snapshot_date_mismatch_raises_error():
    """snapshot_date must match the latest daily_values date when provided."""
    period = PeriodInfo(
        start_date=datetime(2025, 1, 1, tzinfo=UTC),
        end_date=datetime(2025, 1, 3, tzinfo=UTC),
        days=2,
    )
    daily_values = [
        DailyTrendDataPoint(
            date=datetime(2025, 1, 2, tzinfo=UTC),
            total_value_usd=100.0,
            categories=[],
        )
    ]

    with pytest.raises(ValidationError) as exc_info:
        PortfolioTrendResponse(
            user_id="user-1",
            snapshot_date=date(2025, 1, 1),
            period_days=2,
            data_points=1,
            daily_values=daily_values,
            summary={},
            period_info=period,
        )

    assert "snapshot_date does not match latest daily_values date" in str(
        exc_info.value
    )


def test_period_aliases_return_period_info_for_all_response_models():
    """All backward-compatible `period` aliases should return `period_info`."""
    period_info = PeriodInfo(
        start_date=datetime(2025, 1, 1, tzinfo=UTC),
        end_date=datetime(2025, 1, 31, tzinfo=UTC),
        days=30,
    )

    volatility = PortfolioVolatilityResponse(
        user_id="user-1",
        period_days=30,
        data_points=30,
        volatility_daily=0.01,
        volatility_annualized=0.2,
        average_daily_return=0.001,
        period_info=period_info,
    )
    assert volatility.period == period_info

    sharpe = SharpeRatioResponse(
        user_id="user-1",
        period_days=30,
        data_points=30,
        sharpe_ratio=1.2,
        portfolio_return_annual=0.15,
        risk_free_rate_annual=0.02,
        excess_return=0.13,
        volatility_annual=0.1,
        interpretation="Good",
        period_info=period_info,
    )
    assert sharpe.period == period_info

    drawdown = MaxDrawdownResponse(
        user_id="user-1",
        period_days=30,
        data_points=30,
        max_drawdown_pct=-10.0,
        peak_value=1000.0,
        trough_value=900.0,
        peak_date=datetime(2025, 1, 5, tzinfo=UTC),
        trough_date=datetime(2025, 1, 20, tzinfo=UTC),
        drawdown_duration_days=15,
        period_info=period_info,
    )
    assert drawdown.period == period_info

    allocation = AllocationTimeseriesResponse(
        user_id="user-1",
        period_days=30,
        data_points=0,
        allocations=[],
        summary={},
        period_info=period_info,
    )
    assert allocation.period == period_info

    enhanced_drawdown = EnhancedDrawdownAnalysisResponse(
        user_id="user-1",
        period_days=30,
        data_points=1,
        drawdowns=[
            DrawdownDataPoint(
                date=datetime(2025, 1, 10, tzinfo=UTC),
                portfolio_value=950.0,
                running_peak=1000.0,
                drawdown_pct=-5.0,
            )
        ],
        max_drawdown_pct=-5.0,
        period_info=period_info,
    )
    assert enhanced_drawdown.period == period_info

    underwater = UnderwaterRecoveryAnalysisResponse(
        user_id="user-1",
        period_days=30,
        underwater_periods=[],
        currently_underwater=False,
        period_info=period_info,
    )
    assert underwater.period == period_info

    rolling_sharpe = RollingSharpeAnalysisResponse(
        user_id="user-1",
        period_days=30,
        data_points=0,
        rolling_sharpe=[],
        reliability_assessment="Low confidence",
        period_info=period_info,
    )
    assert rolling_sharpe.period == period_info

    rolling_volatility = RollingVolatilityAnalysisResponse(
        user_id="user-1",
        period_days=30,
        data_points=0,
        rolling_volatility=[],
        reliability_assessment="Low confidence",
        period_info=period_info,
    )
    assert rolling_volatility.period == period_info

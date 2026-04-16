"""Integration tests for trend analysis validation.

Tests that Pydantic validators correctly catch data integrity issues:
- Temporal ordering validation (daily_values chronological)
- Array uniqueness validation (protocols list)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.models.analytics_responses import (
    DailyTrendDataPoint,
    PeriodInfo,
    PortfolioTrendResponse,
)


def _create_period_info(days: int = 7) -> PeriodInfo:
    """Create valid period info for testing."""
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=days)
    return PeriodInfo(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        days=days,
    )


def _create_data_point(day_offset: int, value: float) -> DailyTrendDataPoint:
    """Create daily trend data point for testing."""
    base_date = datetime(2024, 1, 1, tzinfo=UTC)
    return DailyTrendDataPoint(
        date=base_date + timedelta(days=day_offset),
        total_value_usd=value,
        change_percentage=0.0,
        categories=[],
        protocols=[],
    )


class TestDailyTrendDataPointValidation:
    """Test DailyTrendDataPoint validators."""

    def test_unique_protocols_passes(self) -> None:
        """Unique protocols list should pass validation."""
        data_point = DailyTrendDataPoint(
            date=datetime(2024, 1, 1, tzinfo=UTC),
            total_value_usd=1000.0,
            change_percentage=0.0,
            protocols=["Aave", "Compound", "Uniswap"],
        )
        assert len(data_point.protocols) == 3
        assert len(set(data_point.protocols)) == 3

    def test_duplicate_protocols_fails(self) -> None:
        """Duplicate protocols should raise ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            DailyTrendDataPoint(
                date=datetime(2024, 1, 1, tzinfo=UTC),
                total_value_usd=1000.0,
                change_percentage=0.0,
                protocols=["Aave", "Compound", "Aave"],  # Duplicate Aave
            )

        error_msg = str(exc_info.value)
        assert "protocols must be unique" in error_msg
        assert "Aave" in error_msg

    def test_empty_protocols_passes(self) -> None:
        """Empty protocols list should pass (edge case)."""
        data_point = DailyTrendDataPoint(
            date=datetime(2024, 1, 1, tzinfo=UTC),
            total_value_usd=1000.0,
            change_percentage=0.0,
            protocols=[],  # Empty
        )
        assert data_point.protocols == []

    def test_single_protocol_passes(self) -> None:
        """Single protocol should pass (no duplicates possible)."""
        data_point = DailyTrendDataPoint(
            date=datetime(2024, 1, 1, tzinfo=UTC),
            total_value_usd=1000.0,
            change_percentage=0.0,
            protocols=["Aave"],
        )
        assert len(data_point.protocols) == 1


class TestPortfolioTrendResponseValidation:
    """Test PortfolioTrendResponse validators."""

    def test_chronological_daily_values_passes(self) -> None:
        """Daily values in chronological order should pass validation."""
        response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=3,
            data_points=3,
            daily_values=[
                _create_data_point(0, 1000.0),  # Jan 1
                _create_data_point(1, 1050.0),  # Jan 2
                _create_data_point(2, 1100.0),  # Jan 3
            ],
            summary={},
            period_info=_create_period_info(3),
        )
        assert len(response.daily_values) == 3
        assert response.daily_values[0].date < response.daily_values[1].date
        assert response.daily_values[1].date < response.daily_values[2].date

    def test_reverse_chronological_daily_values_fails(self) -> None:
        """Daily values in reverse order should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioTrendResponse(
                user_id="test-user",
                period_days=3,
                data_points=3,
                daily_values=[
                    _create_data_point(2, 1100.0),  # Jan 3 (wrong order)
                    _create_data_point(1, 1050.0),  # Jan 2
                    _create_data_point(0, 1000.0),  # Jan 1
                ],
                summary={},
                period_info=_create_period_info(3),
            )

        error_msg = str(exc_info.value)
        assert "chronological order" in error_msg.lower()

    def test_mixed_order_daily_values_fails(self) -> None:
        """Daily values in mixed order should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioTrendResponse(
                user_id="test-user",
                period_days=4,
                data_points=4,
                daily_values=[
                    _create_data_point(0, 1000.0),  # Jan 1
                    _create_data_point(2, 1100.0),  # Jan 3 (skipped Jan 2)
                    _create_data_point(1, 1050.0),  # Jan 2 (out of order)
                    _create_data_point(3, 1150.0),  # Jan 4
                ],
                summary={},
                period_info=_create_period_info(4),
            )

        error_msg = str(exc_info.value)
        assert "chronological order" in error_msg.lower()

    def test_single_data_point_passes(self) -> None:
        """Single data point should pass (no ordering to check)."""
        response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=1,
            data_points=1,
            daily_values=[_create_data_point(0, 1000.0)],
            summary={},
            period_info=_create_period_info(1),
        )
        assert len(response.daily_values) == 1

    def test_empty_daily_values_passes(self) -> None:
        """Empty daily_values should pass (edge case)."""
        response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=7,
            data_points=0,
            daily_values=[],  # Empty
            summary={},
            period_info=_create_period_info(7),
            message="No data available",
        )
        assert response.daily_values == []

    def test_large_chronological_dataset_passes(self) -> None:
        """Large dataset in chronological order should pass efficiently."""
        # Create 90 days of data
        daily_values = [_create_data_point(i, 1000.0 + i * 10) for i in range(90)]

        response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=90,
            data_points=90,
            daily_values=daily_values,
            summary={},
            period_info=_create_period_info(90),
        )
        assert len(response.daily_values) == 90

    def test_duplicate_dates_in_order_passes(self) -> None:
        """Duplicate dates (same timestamp) should pass if in order."""
        same_date = datetime(2024, 1, 1, tzinfo=UTC)
        response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=3,
            data_points=3,
            daily_values=[
                DailyTrendDataPoint(
                    date=same_date,
                    total_value_usd=1000.0,
                    change_percentage=0.0,
                ),
                DailyTrendDataPoint(
                    date=same_date,
                    total_value_usd=1000.0,
                    change_percentage=0.0,
                ),
                DailyTrendDataPoint(
                    date=same_date + timedelta(days=1),
                    total_value_usd=1050.0,
                    change_percentage=5.0,
                ),
            ],
            summary={},
            period_info=_create_period_info(3),
        )
        assert len(response.daily_values) == 3


class TestComplexTrendValidationScenarios:
    """Test complex multi-validator scenarios for trends."""

    def test_valid_trend_with_protocols_passes_all_validators(self) -> None:
        """Valid trend with protocols should pass all validators."""
        response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=3,
            data_points=3,
            daily_values=[
                DailyTrendDataPoint(
                    date=datetime(2024, 1, 1, tzinfo=UTC),
                    total_value_usd=1000.0,
                    change_percentage=0.0,
                    protocols=["Aave", "Compound"],  # Unique
                ),
                DailyTrendDataPoint(
                    date=datetime(2024, 1, 2, tzinfo=UTC),
                    total_value_usd=1050.0,
                    change_percentage=5.0,
                    protocols=["Aave", "Uniswap"],  # Unique
                ),
                DailyTrendDataPoint(
                    date=datetime(2024, 1, 3, tzinfo=UTC),
                    total_value_usd=1100.0,
                    change_percentage=4.76,
                    protocols=["Compound", "Curve"],  # Unique
                ),
            ],
            summary={},
            period_info=_create_period_info(3),
        )
        assert len(response.daily_values) == 3
        # Verify each data point has unique protocols
        for point in response.daily_values:
            assert len(point.protocols) == len(set(point.protocols))

"""Integration tests for yield returns validation.

Tests that Pydantic validators correctly catch data integrity issues:
- Temporal ordering validation (daily_returns chronological)
- ISO8601 date format validation (date fields)
- Numeric constraints (ge=0 for prices, counts, std_dev)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.models.yield_returns import (
    DailyYieldReturn,
    PeriodInfo,
    StatisticalSummary,
    TokenYieldBreakdown,
    YieldReturnsResponse,
    YieldReturnSummary,
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


def _create_daily_yield_return(day_offset: int, yield_usd: float) -> DailyYieldReturn:
    """Create daily yield return for testing."""
    base_date = datetime(2024, 1, 1, tzinfo=UTC)
    return DailyYieldReturn(
        date=(base_date + timedelta(days=day_offset)).date().isoformat(),
        protocol_name="Aave V3",
        chain="ethereum",
        position_type="Lending",
        yield_return_usd=yield_usd,
        tokens=[],
    )


class TestYieldReturnsResponseValidation:
    """Test YieldReturnsResponse model validation."""

    def test_valid_yield_returns_response_passes(self) -> None:
        """Valid yield returns response should pass validation."""
        response = YieldReturnsResponse(
            user_id="test-user",
            period=_create_period_info(3),
            daily_returns=[
                _create_daily_yield_return(0, 10.5),  # Jan 1
                _create_daily_yield_return(1, 12.3),  # Jan 2
                _create_daily_yield_return(2, 8.7),  # Jan 3
            ],
            summary=YieldReturnSummary(
                total_yield_return_usd=31.5,
                average_daily_return=10.5,
                positive_days=3,
                negative_days=0,
                top_protocol="Aave V3",
                top_chain="ethereum",
            ),
        )
        assert len(response.daily_returns) == 3
        assert response.summary.total_yield_return_usd == 31.5

    def test_reverse_chronological_daily_returns_fails(self) -> None:
        """Daily returns in reverse order should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            YieldReturnsResponse(
                user_id="test-user",
                period=_create_period_info(3),
                daily_returns=[
                    _create_daily_yield_return(2, 8.7),  # Jan 3 (wrong order)
                    _create_daily_yield_return(1, 12.3),  # Jan 2
                    _create_daily_yield_return(0, 10.5),  # Jan 1
                ],
                summary=YieldReturnSummary(
                    total_yield_return_usd=31.5,
                    average_daily_return=10.5,
                    positive_days=3,
                    negative_days=0,
                ),
            )

        error_msg = str(exc_info.value)
        assert "chronological order" in error_msg.lower()

    def test_single_daily_return_passes(self) -> None:
        """Single daily return should pass (no ordering to check)."""
        response = YieldReturnsResponse(
            user_id="test-user",
            period=_create_period_info(1),
            daily_returns=[_create_daily_yield_return(0, 10.5)],
            summary=YieldReturnSummary(
                total_yield_return_usd=10.5,
                average_daily_return=10.5,
                positive_days=1,
                negative_days=0,
            ),
        )
        assert len(response.daily_returns) == 1


class TestDailyYieldReturnValidation:
    """Test DailyYieldReturn model validation."""

    def test_valid_daily_yield_return_passes(self) -> None:
        """Valid daily yield return should pass validation."""
        daily_return = DailyYieldReturn(
            date="2024-01-01",
            protocol_name="Aave V3",
            chain="ethereum",
            position_type="Lending",
            yield_return_usd=10.5,
            tokens=[
                TokenYieldBreakdown(
                    symbol="USDC",
                    amount_change=5.0,
                    current_price=1.0,
                    yield_return_usd=5.0,
                )
            ],
        )
        assert daily_return.yield_return_usd == 10.5
        assert len(daily_return.tokens) == 1

    def test_invalid_date_format_fails(self) -> None:
        """Invalid ISO8601 date format should raise ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            DailyYieldReturn(
                date="01/01/2024",  # Invalid format (should be YYYY-MM-DD)
                protocol_name="Aave V3",
                chain="ethereum",
                position_type="Lending",
                yield_return_usd=10.5,
            )

        error_msg = str(exc_info.value)
        assert "Invalid ISO8601 date format" in error_msg


class TestTokenYieldBreakdownValidation:
    """Test TokenYieldBreakdown model validation."""

    def test_valid_token_breakdown_passes(self) -> None:
        """Valid token breakdown should pass validation."""
        token = TokenYieldBreakdown(
            symbol="USDC",
            amount_change=5.0,
            current_price=1.0,
            yield_return_usd=5.0,
        )
        assert token.current_price == 1.0

    def test_negative_current_price_fails(self) -> None:
        """Negative current_price should fail validation (ge=0)."""
        with pytest.raises(ValidationError) as exc_info:
            TokenYieldBreakdown(
                symbol="USDC",
                amount_change=5.0,
                current_price=-1.0,  # Invalid - price cannot be negative
                yield_return_usd=5.0,
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()

    def test_zero_current_price_passes(self) -> None:
        """Zero current_price should pass (edge case for worthless tokens)."""
        token = TokenYieldBreakdown(
            symbol="DEFUNCT",
            amount_change=100.0,
            current_price=0.0,  # Worthless token
            yield_return_usd=0.0,
        )
        assert token.current_price == 0.0


class TestYieldReturnSummaryValidation:
    """Test YieldReturnSummary model validation."""

    def test_valid_summary_passes(self) -> None:
        """Valid yield return summary should pass validation."""
        summary = YieldReturnSummary(
            total_yield_return_usd=31.5,
            average_daily_return=10.5,
            positive_days=3,
            negative_days=0,
            top_protocol="Aave V3",
            top_chain="ethereum",
        )
        assert summary.positive_days == 3

    def test_negative_positive_days_fails(self) -> None:
        """Negative positive_days should fail validation (ge=0)."""
        with pytest.raises(ValidationError) as exc_info:
            YieldReturnSummary(
                total_yield_return_usd=31.5,
                average_daily_return=10.5,
                positive_days=-1,  # Invalid
                negative_days=0,
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()

    def test_negative_negative_days_fails(self) -> None:
        """Negative negative_days should fail validation (ge=0)."""
        with pytest.raises(ValidationError) as exc_info:
            YieldReturnSummary(
                total_yield_return_usd=31.5,
                average_daily_return=10.5,
                positive_days=3,
                negative_days=-1,  # Invalid
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()


class TestStatisticalSummaryValidation:
    """Test StatisticalSummary model validation."""

    def test_valid_statistical_summary_passes(self) -> None:
        """Valid statistical summary should pass validation."""
        stats = StatisticalSummary(
            mean=10.5,
            median=9.0,
            std_dev=2.5,
            min_value=5.0,
            max_value=15.0,
            total_days=7,
            filtered_days=6,
            outliers_removed=1,
        )
        assert stats.std_dev == 2.5

    def test_negative_std_dev_fails(self) -> None:
        """Negative std_dev should fail validation (ge=0)."""
        with pytest.raises(ValidationError) as exc_info:
            StatisticalSummary(
                mean=10.5,
                median=9.0,
                std_dev=-2.5,  # Invalid - std dev cannot be negative
                min_value=5.0,
                max_value=15.0,
                total_days=7,
                filtered_days=6,
                outliers_removed=1,
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()

    def test_zero_std_dev_passes(self) -> None:
        """Zero std_dev should pass (constant returns edge case)."""
        stats = StatisticalSummary(
            mean=10.0,
            median=10.0,
            std_dev=0.0,  # Valid - no variance
            min_value=10.0,
            max_value=10.0,
            total_days=7,
            filtered_days=7,
            outliers_removed=0,
        )
        assert stats.std_dev == 0.0

    def test_negative_total_days_fails(self) -> None:
        """Negative total_days should fail validation (ge=0)."""
        with pytest.raises(ValidationError) as exc_info:
            StatisticalSummary(
                mean=10.5,
                median=9.0,
                std_dev=2.5,
                min_value=5.0,
                max_value=15.0,
                total_days=-7,  # Invalid
                filtered_days=6,
                outliers_removed=1,
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()

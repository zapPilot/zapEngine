"""Integration tests for risk metrics validation.

Tests that Pydantic models correctly validate risk metric calculations
and catch mathematical inconsistencies.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from src.models.analytics_responses import (
    DrawdownDataPoint,
    EnhancedDrawdownAnalysisResponse,
    MaxDrawdownResponse,
    PeriodInfo,
    PortfolioVolatilityResponse,
    RollingSharpeAnalysisResponse,
    RollingSharpeDataPoint,
    RollingVolatilityAnalysisResponse,
    RollingVolatilityDataPoint,
    SharpeRatioResponse,
)


def _create_period_info(days: int = 30) -> PeriodInfo:
    """Create valid period info for testing."""
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=days)
    return PeriodInfo(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        days=days,
    )


class TestPortfolioVolatilityValidation:
    """Test PortfolioVolatilityResponse model validation."""

    def test_valid_volatility_response_passes(self) -> None:
        """Valid volatility response should pass validation."""
        response = PortfolioVolatilityResponse(
            user_id="test-user",
            period_days=30,
            volatility_annualized=15.5,
            volatility_daily=0.98,
            average_daily_return=0.05,
            data_points=30,
            period_info=_create_period_info(30),
        )
        assert response.volatility_annualized == 15.5
        assert response.volatility_daily == 0.98

    def test_negative_volatility_fails(self) -> None:
        """Negative volatility should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioVolatilityResponse(
                user_id="test-user",
                period_days=30,
                volatility_annualized=-5.0,  # Invalid - volatility cannot be negative
                volatility_daily=0.98,
                average_daily_return=0.05,
                data_points=30,
                period_info=_create_period_info(30),
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()

    def test_invalid_period_days_fails(self) -> None:
        """Period days < 1 should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioVolatilityResponse(
                user_id="test-user",
                period_days=0,  # Invalid - must be >= 1
                volatility_annualized=15.5,
                volatility_daily=0.98,
                average_daily_return=0.05,
                data_points=0,
                period_info=_create_period_info(1),
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 1" in error_msg.lower()


class TestSharpeRatioValidation:
    """Test SharpeRatioResponse model validation."""

    def test_valid_sharpe_ratio_passes(self) -> None:
        """Valid Sharpe ratio response should pass validation."""
        response = SharpeRatioResponse(
            user_id="test-user",
            period_days=30,
            sharpe_ratio=1.5,
            portfolio_return_annual=12.5,
            risk_free_rate_annual=2.0,
            excess_return=10.5,
            volatility_annual=10.0,
            data_points=30,
            period_info=_create_period_info(30),
            interpretation="Good risk-adjusted returns",
        )
        assert response.sharpe_ratio == 1.5
        assert response.portfolio_return_annual == 12.5

    def test_negative_sharpe_ratio_passes(self) -> None:
        """Negative Sharpe ratio should pass (valid for poor performance)."""
        response = SharpeRatioResponse(
            user_id="test-user",
            period_days=30,
            sharpe_ratio=-0.5,  # Valid - negative Sharpe is allowed
            portfolio_return_annual=-5.0,
            risk_free_rate_annual=2.0,
            excess_return=-7.0,
            volatility_annual=10.0,
            data_points=30,
            period_info=_create_period_info(30),
            interpretation="Poor risk-adjusted returns",
        )
        assert response.sharpe_ratio == -0.5

    def test_invalid_data_points_fails(self) -> None:
        """Data points < 0 should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            SharpeRatioResponse(
                user_id="test-user",
                period_days=30,
                sharpe_ratio=1.5,
                portfolio_return_annual=12.5,
                risk_free_rate_annual=2.0,
                excess_return=10.5,
                volatility_annual=10.0,
                data_points=-5,  # Invalid
                period_info=_create_period_info(30),
                interpretation="Good",
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()


class TestMaxDrawdownValidation:
    """Test MaxDrawdownResponse model validation."""

    def test_valid_drawdown_response_passes(self) -> None:
        """Valid drawdown response should pass validation."""
        response = MaxDrawdownResponse(
            user_id="test-user",
            period_days=30,
            max_drawdown_pct=-15.5,  # Negative percentage
            peak_value=10000.0,
            trough_value=8450.0,
            peak_date=datetime(2024, 1, 1, tzinfo=UTC),
            trough_date=datetime(2024, 1, 15, tzinfo=UTC),
            drawdown_duration_days=14,
            data_points=30,
            period_info=_create_period_info(30),
        )
        assert response.max_drawdown_pct == -15.5
        assert response.drawdown_duration_days == 14

    def test_positive_drawdown_percentage_fails(self) -> None:
        """Positive drawdown percentage should fail validation (must be le=0)."""
        with pytest.raises(ValidationError) as exc_info:
            MaxDrawdownResponse(
                user_id="test-user",
                period_days=30,
                max_drawdown_pct=5.0,  # Invalid - drawdown must be negative or zero
                peak_value=10000.0,
                trough_value=9500.0,
                peak_date=datetime(2024, 1, 1, tzinfo=UTC),
                trough_date=datetime(2024, 1, 15, tzinfo=UTC),
                drawdown_duration_days=14,
                data_points=30,
                period_info=_create_period_info(30),
            )

        error_msg = str(exc_info.value)
        assert "less than or equal to 0" in error_msg.lower()

    def test_zero_drawdown_passes(self) -> None:
        """Zero drawdown should pass (portfolio never declined)."""
        response = MaxDrawdownResponse(
            user_id="test-user",
            period_days=30,
            max_drawdown_pct=0.0,  # Valid - no drawdown
            peak_value=10000.0,
            trough_value=10000.0,
            peak_date=None,
            trough_date=None,
            drawdown_duration_days=0,
            data_points=30,
            period_info=_create_period_info(30),
        )
        assert response.max_drawdown_pct == 0.0


class TestDrawdownDataPointValidation:
    """Test DrawdownDataPoint model validation."""

    def test_valid_drawdown_data_point_passes(self) -> None:
        """Valid drawdown data point should pass validation."""
        point = DrawdownDataPoint(
            date=datetime(2024, 1, 1, tzinfo=UTC),
            portfolio_value=10000.0,
            running_peak=10000.0,
            drawdown_pct=0.0,
        )
        assert point.portfolio_value == 10000.0
        assert point.drawdown_pct == 0.0

    def test_positive_drawdown_percentage_fails(self) -> None:
        """Positive drawdown percentage should fail validation (must be le=0)."""
        with pytest.raises(ValidationError) as exc_info:
            DrawdownDataPoint(
                date=datetime(2024, 1, 1, tzinfo=UTC),
                portfolio_value=10000.0,
                running_peak=10000.0,
                drawdown_pct=5.0,  # Invalid - must be negative or zero
            )

        error_msg = str(exc_info.value)
        assert "less than or equal to 0" in error_msg.lower()


class TestRollingSharpeValidation:
    """Test RollingSharpeAnalysisResponse model validation."""

    def test_valid_rolling_sharpe_passes(self) -> None:
        """Valid rolling Sharpe analysis should pass validation."""
        response = RollingSharpeAnalysisResponse(
            user_id="test-user",
            period_days=60,
            rolling_sharpe=[
                RollingSharpeDataPoint(
                    date=datetime(2024, 1, 30, tzinfo=UTC),
                    sharpe_ratio=1.5,
                    interpretation="Good",
                    reliable=True,
                ),
                RollingSharpeDataPoint(
                    date=datetime(2024, 1, 31, tzinfo=UTC),
                    sharpe_ratio=1.6,
                    interpretation="Good",
                    reliable=True,
                ),
            ],
            reliability_assessment="High confidence",
            data_points=60,
            period_info=_create_period_info(60),
        )
        assert len(response.rolling_sharpe) == 2

    def test_invalid_period_days_fails(self) -> None:
        """Period days < 1 should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            RollingSharpeAnalysisResponse(
                user_id="test-user",
                period_days=0,  # Invalid
                rolling_sharpe=[],
                reliability_assessment="Low confidence",
                data_points=0,
                period_info=_create_period_info(1),
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 1" in error_msg.lower()


class TestRollingVolatilityValidation:
    """Test RollingVolatilityAnalysisResponse model validation."""

    def test_valid_rolling_volatility_passes(self) -> None:
        """Valid rolling volatility analysis should pass validation."""
        response = RollingVolatilityAnalysisResponse(
            user_id="test-user",
            period_days=60,
            rolling_volatility=[
                RollingVolatilityDataPoint(
                    date=datetime(2024, 1, 30, tzinfo=UTC),
                    volatility_daily=0.98,
                    volatility_annualized=15.5,
                    interpretation="Moderate",
                    reliable=True,
                ),
                RollingVolatilityDataPoint(
                    date=datetime(2024, 1, 31, tzinfo=UTC),
                    volatility_daily=1.02,
                    volatility_annualized=16.1,
                    interpretation="Moderate",
                    reliable=True,
                ),
            ],
            reliability_assessment="High confidence",
            data_points=60,
            period_info=_create_period_info(60),
        )
        assert len(response.rolling_volatility) == 2

    def test_negative_volatility_in_data_point_fails(self) -> None:
        """Negative volatility in data point should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            RollingVolatilityDataPoint(
                date=datetime(2024, 1, 30, tzinfo=UTC),
                volatility_daily=-0.98,  # Invalid
                volatility_annualized=15.5,
                interpretation="Low",
                reliable=True,
            )

        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()


class TestComplexRiskValidationScenarios:
    """Test complex multi-metric risk validation scenarios."""

    def test_enhanced_drawdown_analysis_passes(self) -> None:
        """Enhanced drawdown analysis with daily values should pass."""
        response = EnhancedDrawdownAnalysisResponse(
            user_id="test-user",
            period_days=7,
            drawdowns=[
                DrawdownDataPoint(
                    date=datetime(2024, 1, 1, tzinfo=UTC),
                    portfolio_value=10000.0,
                    running_peak=10000.0,
                    drawdown_pct=0.0,
                ),
                DrawdownDataPoint(
                    date=datetime(2024, 1, 2, tzinfo=UTC),
                    portfolio_value=9500.0,
                    running_peak=10000.0,
                    drawdown_pct=-5.0,  # Negative percentage
                ),
            ],
            max_drawdown_pct=-5.0,  # Negative percentage
            data_points=2,
            period_info=_create_period_info(7),
        )
        assert len(response.drawdowns) == 2
        assert response.max_drawdown_pct == -5.0

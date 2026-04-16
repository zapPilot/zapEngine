"""
Unit tests for PortfolioAnalyticsContext utility class.

Tests interpretation methods and reliability assessment logic.
"""

import pytest

from src.services.analytics.analytics_context import PortfolioAnalyticsContext


@pytest.fixture
def context():
    """Provide a PortfolioAnalyticsContext instance."""
    return PortfolioAnalyticsContext()


class TestInterpretVolatilityLevel:
    """Tests for the interpret_volatility_level method."""

    def test_volatility_very_low(self, context):
        """Verify volatility below 10% is interpreted as 'Very Low'."""
        assert context.interpret_volatility_level(5.0) == "Very Low"
        assert context.interpret_volatility_level(9.9) == "Very Low"

    def test_volatility_low(self, context):
        """Verify volatility between 10% and 25% is 'Low'."""
        assert context.interpret_volatility_level(10.0) == "Low"
        assert context.interpret_volatility_level(20.0) == "Low"
        assert context.interpret_volatility_level(24.9) == "Low"

    def test_volatility_moderate(self, context):
        """Verify volatility between 25% and 50% is 'Moderate'."""
        assert context.interpret_volatility_level(25.0) == "Moderate"
        assert context.interpret_volatility_level(40.0) == "Moderate"
        assert context.interpret_volatility_level(49.9) == "Moderate"

    def test_volatility_high(self, context):
        """Verify volatility between 50% and 100% is 'High'."""
        assert context.interpret_volatility_level(50.0) == "High"
        assert context.interpret_volatility_level(75.0) == "High"
        assert context.interpret_volatility_level(99.9) == "High"

    def test_volatility_very_high(self, context):
        """Verify volatility above 100% is 'Very High'."""
        assert context.interpret_volatility_level(100.0) == "Very High"
        assert context.interpret_volatility_level(150.0) == "Very High"
        assert context.interpret_volatility_level(200.0) == "Very High"


class TestAssessStatisticalReliability:
    """Tests for the assess_statistical_reliability method."""

    def test_unreliable_insufficient_period(self, context):
        """Verify periods under 30 days are 'Unreliable - Insufficient Period'."""
        result = context.assess_statistical_reliability(
            reliable_points=10, total_points=20, period_days=29
        )
        assert result == "Unreliable - Insufficient Period"

    def test_unreliable_no_windows(self, context):
        """Verify zero reliable points gives 'Unreliable - No 30-day Windows'."""
        result = context.assess_statistical_reliability(
            reliable_points=0, total_points=40, period_days=60
        )
        assert result == "Unreliable - No 30-day Windows"

    def test_directional_only_limited_period(self, context):
        """Verify periods under 90 days are 'Directional Only - Limited Period'."""
        result = context.assess_statistical_reliability(
            reliable_points=30, total_points=40, period_days=60
        )
        assert result == "Directional Only - Limited Period"

    def test_partially_reliable_low_ratio(self, context):
        """Verify low reliable/total ratio gives 'Partially Reliable'."""
        # 40/100 = 0.4 < 0.5 threshold
        result = context.assess_statistical_reliability(
            reliable_points=40, total_points=100, period_days=120
        )
        assert result == "Partially Reliable"

    def test_statistically_robust(self, context):
        """Verify high ratio and sufficient period gives 'Statistically Robust'."""
        # 60/100 = 0.6 >= 0.5 threshold, period >= 90 days
        result = context.assess_statistical_reliability(
            reliable_points=60, total_points=100, period_days=120
        )
        assert result == "Statistically Robust"

    def test_statistically_robust_exact_thresholds(self, context):
        """Verify exactly meeting thresholds gives 'Statistically Robust'."""
        # Exactly 90 days, exactly 0.5 ratio
        result = context.assess_statistical_reliability(
            reliable_points=50, total_points=100, period_days=90
        )
        assert result == "Statistically Robust"

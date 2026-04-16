"""
Comprehensive edge case testing for financial calculations in analytics services.

Tests critical financial calculations (Sharpe ratio, volatility, max drawdown, rolling metrics)
against extreme values, boundary conditions, and edge cases to ensure production reliability.
"""

from unittest.mock import Mock
from uuid import uuid4

import pytest

from src.core.constants import TRADING_DAYS_PER_YEAR
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.analytics.risk_metrics_service import RiskMetricsService
from src.services.analytics.rolling_analytics_service import RollingAnalyticsService
from src.services.shared.query_service import QueryService


@pytest.fixture
def risk_service():
    """Provides a RiskMetricsService instance with mock database."""
    return RiskMetricsService(db=Mock(), query_service=QueryService())


@pytest.fixture
def rolling_service():
    """Provides a RollingAnalyticsService instance with mock database."""
    return RollingAnalyticsService(db=Mock(), query_service=QueryService())


@pytest.fixture
def analytics_context():
    """Provides a PortfolioAnalyticsContext instance for testing."""
    return PortfolioAnalyticsContext()


@pytest.fixture
def sample_user_id():
    """Provides a sample user UUID for testing."""
    return uuid4()


class TestSharpeRatioEdgeCases:
    """Comprehensive edge case tests for Sharpe ratio calculations."""

    @pytest.mark.parametrize(
        "daily_returns,expected_sharpe,description",
        [
            # Zero volatility - all identical returns (stdev = 0)
            ([0.05, 0.05, 0.05, 0.05], 0.0, "zero_volatility_identical_returns"),
            # All identical returns (different value)
            ([0.10, 0.10, 0.10], 0.0, "zero_volatility_high_returns"),
            # All zero returns
            ([0.0, 0.0, 0.0, 0.0], 0.0, "all_zero_returns"),
            # All negative returns (bear market)
            ([-0.05, -0.05, -0.05], 0.0, "zero_volatility_negative_returns"),
        ],
    )
    def test_zero_volatility_cases(
        self,
        risk_service,
        sample_user_id,
        mocker,
        daily_returns,
        expected_sharpe,
        description,
    ):
        """Test Sharpe ratio calculation with zero volatility (division by zero protection)."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["sharpe_ratio"] == expected_sharpe, f"Failed for {description}"
        assert result["volatility_annual"] == 0.0
        assert result["data_points"] == len(daily_returns)

    @pytest.mark.parametrize(
        "daily_returns,risk_free_rate,expected_negative,description",
        [
            # Negative returns with positive risk-free rate
            ([-0.01, -0.02, -0.015], 0.02, True, "negative_returns_positive_rf"),
            # Mixed returns averaging below risk-free rate (with volatility)
            ([0.02, -0.01, 0.01, -0.02], 0.05, True, "mixed_returns_below_rf"),
        ],
    )
    def test_negative_excess_return_cases(
        self,
        risk_service,
        sample_user_id,
        mocker,
        daily_returns,
        risk_free_rate,
        expected_negative,
        description,
    ):
        """Test Sharpe ratio with negative excess return (return < risk-free rate)."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)
        mocker.patch("src.core.config.settings.risk_free_rate_annual", risk_free_rate)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        if expected_negative:
            assert result["sharpe_ratio"] < 0, f"Failed for {description}"
            assert result["excess_return"] < 0
        assert result["interpretation"] in ["Poor", "Below Average"]

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Exactly 2 data points (minimum threshold)
            ([0.05, 0.03], "exactly_minimum_two_points"),
            # Exactly 3 data points
            ([0.05, 0.03, 0.04], "exactly_three_points"),
        ],
    )
    def test_minimum_data_points(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test Sharpe ratio at minimum data point thresholds."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["data_points"] == len(daily_returns)
        assert "sharpe_ratio" in result
        # With only 2-3 points, we should still get a calculation (not error)
        assert isinstance(result["sharpe_ratio"], int | float)

    def test_zero_risk_free_rate(self, risk_service, sample_user_id, mocker):
        """Test Sharpe ratio calculation with risk-free rate = 0%."""
        daily_returns = [0.05, 0.03, 0.04, 0.02]
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)
        mocker.patch("src.core.config.settings.risk_free_rate_annual", 0.0)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        # With risk_free_rate = 0, Sharpe = return / volatility
        assert result["risk_free_rate_annual"] == 0.0
        assert result["excess_return"] == result["portfolio_return_annual"]
        assert result["sharpe_ratio"] != 0.0  # Should have non-zero Sharpe

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Very high volatility scenario (crypto crash)
            ([0.50, -0.40, 0.30, -0.20, 0.10], "extreme_volatility_swings"),
            # Oscillating returns
            ([0.10, -0.10, 0.10, -0.10, 0.10], "high_frequency_oscillation"),
            # Single outlier in otherwise stable returns
            ([0.001, 0.001, 0.50, 0.001, 0.001], "single_extreme_outlier"),
        ],
    )
    def test_high_volatility_scenarios(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test Sharpe ratio calculation with very high volatility (> 50% annualized)."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        # High volatility should result in low Sharpe ratio
        assert result["volatility_annual"] > 0.1  # > 10% annualized
        assert "sharpe_ratio" in result
        # Sharpe should be defined (not error) even with extreme volatility
        assert isinstance(result["sharpe_ratio"], int | float)

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Mixed positive/negative returns
            ([0.10, -0.05, 0.03, -0.02, 0.06], "mixed_positive_negative"),
            # Mostly negative with occasional positive
            ([-0.05, -0.03, 0.01, -0.04, -0.02], "mostly_negative_returns"),
            # All negative returns
            ([-0.01, -0.02, -0.015, -0.025], "all_negative_returns"),
        ],
    )
    def test_mixed_return_scenarios(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test Sharpe ratio with various positive/negative return combinations."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["data_points"] == len(daily_returns)
        # Interpretation should reflect performance
        if all(r < 0 for r in daily_returns):
            assert result["interpretation"] in ["Poor", "Below Average"]

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Very small returns (precision issues)
            ([0.0001, 0.0002, 0.00015, 0.00018], "very_small_positive_returns"),
            # Very small negative returns
            ([-0.0001, -0.0002, -0.00015], "very_small_negative_returns"),
            # Returns near zero
            ([0.0001, -0.0001, 0.00005, -0.00005], "near_zero_returns"),
        ],
    )
    def test_precision_edge_cases(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test Sharpe ratio calculation with very small returns (precision edge cases)."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        # Should handle precision without errors
        assert "sharpe_ratio" in result
        assert isinstance(result["sharpe_ratio"], int | float)
        # Results should be rounded appropriately
        assert result["sharpe_ratio"] == round(result["sharpe_ratio"], 3)


class TestVolatilityEdgeCases:
    """Comprehensive edge case tests for volatility calculations."""

    @pytest.mark.parametrize(
        "daily_returns,expected_volatility,description",
        [
            # All identical positive returns (zero stdev)
            ([0.05, 0.05, 0.05, 0.05], 0.0, "all_identical_positive_returns"),
            # All identical negative returns
            ([-0.05, -0.05, -0.05], 0.0, "all_identical_negative_returns"),
            # All zero returns
            ([0.0, 0.0, 0.0, 0.0], 0.0, "all_zero_returns"),
        ],
    )
    def test_zero_standard_deviation(
        self,
        risk_service,
        sample_user_id,
        mocker,
        daily_returns,
        expected_volatility,
        description,
    ):
        """Test volatility calculation with zero standard deviation."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        assert result["volatility_daily"] == expected_volatility, (
            f"Failed for {description}"
        )
        assert result["volatility_annualized"] == expected_volatility
        assert result["data_points"] == len(daily_returns)

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Single huge outlier in stable portfolio
            ([0.001, 0.001, 0.001, 0.50, 0.001, 0.001], "single_massive_outlier"),
            # Two extreme values
            ([0.001, 0.50, 0.001, -0.40, 0.001], "two_extreme_outliers"),
            # Outlier at end of period
            ([0.01, 0.01, 0.01, 0.01, 0.50], "outlier_at_end"),
        ],
    )
    def test_outlier_impact(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test volatility calculation with single or few extreme outliers."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        # Outliers should significantly increase volatility
        assert result["volatility_daily"] > 0.01  # Should be > 1% daily
        assert result["volatility_annualized"] > 0.15  # Should be > 15% annualized

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Perfect oscillation
            ([-0.1, 0.1, -0.1, 0.1, -0.1, 0.1], "perfect_oscillation"),
            # Asymmetric oscillation
            ([-0.05, 0.10, -0.05, 0.10], "asymmetric_oscillation"),
            # High frequency changes
            ([0.05, -0.05, 0.05, -0.05, 0.05], "high_frequency_changes"),
        ],
    )
    def test_oscillating_returns(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test volatility with oscillating (alternating +/-) returns."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        # Oscillating returns should show high volatility
        assert result["volatility_daily"] > 0.03  # > 3% daily
        assert result["data_points"] == len(daily_returns)

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Exactly 2 data points (minimum)
            ([0.05, 0.03], "exactly_minimum_two_points"),
            # Just above minimum
            ([0.05, 0.03, 0.04], "three_data_points"),
        ],
    )
    def test_minimum_data_points_volatility(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test volatility calculation at minimum data point threshold (2 points)."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        assert result["data_points"] == len(daily_returns)
        # With 2+ points, should calculate volatility (not error)
        assert isinstance(result["volatility_daily"], int | float)
        assert isinstance(result["volatility_annualized"], int | float)

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # Very small standard deviations
            ([0.0001, 0.0002, 0.00015, 0.00018, 0.00012], "very_small_stdev"),
            # Near-zero variance
            ([0.001, 0.001, 0.0011, 0.001, 0.0009], "near_zero_variance"),
            # Tiny negative returns
            ([-0.0001, -0.0002, -0.00015, -0.00012], "tiny_negative_returns"),
        ],
    )
    def test_very_small_standard_deviations(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test volatility calculation with very small standard deviations (< 0.0001)."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        # Should handle tiny values without errors
        assert result["volatility_daily"] >= 0
        assert result["volatility_annualized"] >= 0
        # Results should be properly rounded
        assert result["volatility_daily"] == round(result["volatility_daily"], 6)

    @pytest.mark.parametrize(
        "daily_returns,description",
        [
            # All negative returns (bear market)
            ([-0.01, -0.02, -0.015, -0.025, -0.03], "all_negative_bear_market"),
            # Severe negative returns
            ([-0.10, -0.15, -0.12, -0.08], "severe_negative_returns"),
        ],
    )
    def test_negative_return_volatility(
        self, risk_service, sample_user_id, mocker, daily_returns, description
    ):
        """Test volatility calculation with all negative returns."""
        mock_data = [
            {"date": f"2023-01-{i:02d}", "daily_return": ret}
            for i, ret in enumerate(daily_returns, 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        # Volatility should be calculated regardless of return direction
        assert result["volatility_daily"] >= 0
        assert result["average_daily_return"] < 0  # Average should be negative
        assert result["data_points"] == len(daily_returns)


class TestMaxDrawdownEdgeCases:
    """Comprehensive edge case tests for maximum drawdown calculations."""

    @pytest.mark.parametrize(
        "portfolio_values,expected_drawdown,description",
        [
            # Continuous gains (never had drawdown)
            ([100, 110, 120, 130, 140], 0.0, "continuous_gains_no_drawdown"),
            # Monotonic increase
            ([1000, 1100, 1200, 1300], 0.0, "monotonic_increase"),
            # Flat portfolio (no change)
            ([100, 100, 100, 100], 0.0, "flat_portfolio_no_change"),
        ],
    )
    def test_no_drawdown_scenarios(
        self,
        risk_service,
        sample_user_id,
        mocker,
        portfolio_values,
        expected_drawdown,
        description,
    ):
        """Test max drawdown when portfolio never declines (continuous gains or flat)."""
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": val,
                "peak_value": max(portfolio_values[: i + 1]),
                "drawdown_pct": (val - max(portfolio_values[: i + 1]))
                / max(portfolio_values[: i + 1]),
            }
            for i, val in enumerate(portfolio_values)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        assert result["max_drawdown"] == pytest.approx(expected_drawdown)
        assert result["max_drawdown"] <= 0.0, f"Failed for {description}"
        assert result["max_drawdown_percentage"] <= 0.0
        assert result["recovery_needed_percentage"] == 0.0

    @pytest.mark.parametrize(
        "portfolio_values,description",
        [
            # Continuous decline (no recovery)
            ([100, 90, 80, 70, 60], "continuous_decline_no_recovery"),
            # Steep continuous loss
            ([1000, 800, 600, 400, 200], "steep_continuous_loss"),
        ],
    )
    def test_continuous_decline(
        self, risk_service, sample_user_id, mocker, portfolio_values, description
    ):
        """Test max drawdown with continuous portfolio decline (no recovery)."""
        peak_value = portfolio_values[0]
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": val,
                "peak_value": peak_value,
                "drawdown_pct": (val - peak_value) / peak_value,
            }
            for i, val in enumerate(portfolio_values)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        # Max drawdown should be at final value (worst point)
        expected_max_dd = (portfolio_values[-1] - peak_value) / peak_value
        assert result["max_drawdown"] == pytest.approx(expected_max_dd, abs=0.001)
        assert result["max_drawdown"] < 0  # Should be negative
        assert result["current_drawdown"] < 0  # Still in drawdown

    @pytest.mark.parametrize(
        "portfolio_values,description",
        [
            # Multiple peaks and troughs
            ([100, 120, 80, 110, 70, 90], "multiple_peaks_troughs"),
            # Recovery between drawdowns
            ([100, 80, 100, 60, 100], "recovery_between_drawdowns"),
            # Successive peaks with drawdowns
            ([100, 150, 120, 200, 150], "successive_peaks_drawdowns"),
        ],
    )
    def test_multiple_peak_trough_cycles(
        self, risk_service, sample_user_id, mocker, portfolio_values, description
    ):
        """Test max drawdown with multiple peak-to-trough cycles."""

        def calculate_running_peak_and_dd(values):
            """Calculate running peak and drawdown for each value."""
            results = []
            running_peak = values[0]
            for val in values:
                running_peak = max(running_peak, val)
                dd_pct = (
                    (val - running_peak) / running_peak if running_peak > 0 else 0.0
                )
                results.append((running_peak, dd_pct))
            return results

        peak_dd_data = calculate_running_peak_and_dd(portfolio_values)
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": val,
                "peak_value": peak,
                "drawdown_pct": dd,
            }
            for i, (val, (peak, dd)) in enumerate(
                zip(portfolio_values, peak_dd_data, strict=False)
            )
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        # Should find the maximum (most negative) drawdown
        expected_max_dd = min(dd for _, dd in peak_dd_data)
        assert result["max_drawdown"] == pytest.approx(expected_max_dd, abs=0.001)
        assert result["max_drawdown"] <= 0

    @pytest.mark.parametrize(
        "portfolio_values,description",
        [
            # Full recovery to new high
            ([100, 50, 100], "full_recovery_to_original"),
            # Recovery to new all-time high
            ([100, 50, 120], "recovery_to_new_high"),
        ],
    )
    def test_full_recovery_scenarios(
        self, risk_service, sample_user_id, mocker, portfolio_values, description
    ):
        """Test max drawdown with full recovery to original or new high."""

        def calculate_running_peak_and_dd(values):
            results = []
            running_peak = values[0]
            for val in values:
                running_peak = max(running_peak, val)
                dd_pct = (
                    (val - running_peak) / running_peak if running_peak > 0 else 0.0
                )
                results.append((running_peak, dd_pct))
            return results

        peak_dd_data = calculate_running_peak_and_dd(portfolio_values)
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": val,
                "peak_value": peak,
                "drawdown_pct": dd,
            }
            for i, (val, (peak, dd)) in enumerate(
                zip(portfolio_values, peak_dd_data, strict=False)
            )
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        # Max drawdown should have occurred at trough (50)
        assert result["max_drawdown"] < 0  # Had drawdown during period
        # Current drawdown should be 0 if recovered to new peak
        if portfolio_values[-1] >= max(portfolio_values):
            assert result["current_drawdown"] == pytest.approx(0.0, abs=0.001)

    @pytest.mark.parametrize(
        "portfolio_values,description",
        [
            # Partial recovery
            ([100, 50, 75], "partial_recovery_to_75pct"),
            # Slight recovery
            ([100, 50, 60], "slight_recovery_to_60pct"),
        ],
    )
    def test_partial_recovery_scenarios(
        self, risk_service, sample_user_id, mocker, portfolio_values, description
    ):
        """Test max drawdown with partial recovery (not reaching original peak)."""

        def calculate_running_peak_and_dd(values):
            results = []
            running_peak = values[0]
            for val in values:
                running_peak = max(running_peak, val)
                dd_pct = (
                    (val - running_peak) / running_peak if running_peak > 0 else 0.0
                )
                results.append((running_peak, dd_pct))
            return results

        peak_dd_data = calculate_running_peak_and_dd(portfolio_values)
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": val,
                "peak_value": peak,
                "drawdown_pct": dd,
            }
            for i, (val, (peak, dd)) in enumerate(
                zip(portfolio_values, peak_dd_data, strict=False)
            )
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        # Max drawdown should be at trough
        assert result["max_drawdown"] < 0
        # Current drawdown should be negative (still underwater)
        assert result["current_drawdown"] < 0
        # Recovery needed should be positive
        assert result["recovery_needed_percentage"] > 0

    def test_single_data_point(self, risk_service, sample_user_id, mocker):
        """Test max drawdown with only one data point."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 100,
                "peak_value": 100,
                "drawdown_pct": 0.0,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        assert result["max_drawdown"] == 0.0
        assert result["current_drawdown"] == 0.0
        assert result["data_points"] == 1

    def test_identical_values_no_change(self, risk_service, sample_user_id, mocker):
        """Test max drawdown with identical portfolio values (no change)."""
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": 100,
                "peak_value": 100,
                "drawdown_pct": 0.0,
            }
            for i in range(1, 6)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        assert result["max_drawdown"] == 0.0
        assert result["current_drawdown"] == 0.0
        assert result["recovery_needed_percentage"] == 0.0


class TestRollingWindowEdgeCases:
    """Comprehensive edge case tests for rolling window analytics (30-day windows)."""

    @pytest.mark.parametrize(
        "num_days,expected_reliable,description",
        [
            # Exactly at minimum period (30 days)
            (30, True, "exactly_minimum_30_days"),
            # Just below minimum
            (29, False, "one_day_below_minimum"),
            # Half minimum period
            (15, False, "half_minimum_period_15_days"),
            # Double the period
            (60, True, "double_period_60_days"),
            # Very small window
            (7, False, "very_small_window_7_days"),
        ],
    )
    def test_rolling_window_reliability_threshold(
        self,
        rolling_service,
        sample_user_id,
        mocker,
        num_days,
        expected_reliable,
        description,
    ):
        """Test rolling window reliability assessment at various period lengths."""
        # Generate mock data for specified number of days
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "rolling_sharpe_ratio": 1.5,
                "rolling_volatility_daily_pct": 0.02,
                "annualized_volatility_pct": 0.32,
                "is_statistically_reliable": i >= 30,  # Only reliable after 30+ days
            }
            for i in range(1, num_days + 1)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            sample_user_id, days=num_days
        )

        if expected_reliable:
            assert result["summary"]["reliable_data_points"] >= 0
        else:
            # Below minimum period should have reliability warning
            reliability = result["summary"]["statistical_reliability"]
            assert "Unreliable" in reliability or "Insufficient" in reliability, (
                f"Failed for {description}"
            )

    def test_large_rolling_window(self, rolling_service, sample_user_id, mocker):
        """Test rolling window with large period (> 90 days for robust analysis)."""
        num_days = 120
        mock_data = [
            {
                "date": f"2023-{(i // 30) + 1:02d}-{(i % 30) + 1:02d}",
                "rolling_sharpe_ratio": 1.5 + (i % 10) * 0.1,  # Varying Sharpe
                "rolling_volatility_daily_pct": 0.02,
                "annualized_volatility_pct": 0.32,
                "is_statistically_reliable": i >= 30,
            }
            for i in range(num_days)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            sample_user_id, days=num_days
        )

        # Large window should be statistically robust
        assert result["summary"]["statistical_reliability"] == "Statistically Robust"
        assert result["data_points"] == num_days
        assert (
            result["summary"]["reliable_data_points"] >= 90
        )  # Should have many reliable points

    def test_rolling_window_with_gaps(self, rolling_service, sample_user_id, mocker):
        """Test rolling window when there are data gaps (missing days)."""
        # Simulate 40 days of data with gaps (5 days missing in middle)
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "rolling_sharpe_ratio": 1.5,
                "rolling_volatility_daily_pct": 0.02,
                "annualized_volatility_pct": 0.32,
                "is_statistically_reliable": True,
            }
            for i in range(1, 16)  # Days 1-15
        ] + [
            {
                "date": f"2023-01-{i:02d}",
                "rolling_sharpe_ratio": 1.5,
                "rolling_volatility_daily_pct": 0.02,
                "annualized_volatility_pct": 0.32,
                "is_statistically_reliable": True,
            }
            for i in range(21, 41)  # Days 21-40 (16-20 missing)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(sample_user_id, days=40)

        # Should handle gaps gracefully
        assert result["data_points"] == 35  # 15 + 20 days
        assert "rolling_sharpe_data" in result

    @pytest.mark.parametrize(
        "num_null_values,total_days,description",
        [
            # All null/None values
            (40, 40, "all_null_values"),
            # Mostly null values
            (35, 40, "mostly_null_values"),
            # Half null values
            (20, 40, "half_null_values"),
        ],
    )
    def test_rolling_window_with_null_values(
        self,
        rolling_service,
        sample_user_id,
        mocker,
        num_null_values,
        total_days,
        description,
    ):
        """Test rolling window when many values are null/None."""
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "rolling_sharpe_ratio": None if i < num_null_values else 1.5,
                "rolling_volatility_daily_pct": None if i < num_null_values else 0.02,
                "annualized_volatility_pct": None if i < num_null_values else 0.32,
                "is_statistically_reliable": i >= num_null_values,
            }
            for i in range(total_days)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            sample_user_id, days=total_days
        )

        valid_count = total_days - num_null_values
        if valid_count == 0:
            # All null - should return default values
            assert result["summary"]["avg_sharpe_ratio"] == 0.0
        else:
            # Some valid values
            assert result["summary"]["avg_sharpe_ratio"] != 0.0

    def test_rolling_window_at_dataset_beginning(
        self, rolling_service, sample_user_id, mocker
    ):
        """Test rolling window at the beginning of dataset (first 30 days)."""
        # First 30 days - at minimum threshold
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "rolling_sharpe_ratio": 1.0 + i * 0.01,  # Gradually increasing
                "rolling_volatility_daily_pct": 0.02,
                "annualized_volatility_pct": 0.32,
                "is_statistically_reliable": i >= 30,
            }
            for i in range(1, 31)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(sample_user_id, days=30)

        assert result["data_points"] == 30
        # Should have reliability warning for 30-day period
        assert "Directional Only" in result["summary"]["statistical_reliability"]

    def test_rolling_window_at_dataset_end(
        self, rolling_service, sample_user_id, mocker
    ):
        """Test rolling window at the end of dataset (most recent 30 days)."""
        # 60 days total, but we're looking at rolling metrics
        mock_data = [
            {
                "date": f"2023-{1 + i // 30:02d}-{(i % 30) + 1:02d}",
                "rolling_sharpe_ratio": 1.5 - i * 0.01,  # Gradually decreasing
                "rolling_volatility_daily_pct": 0.02 + i * 0.0001,
                "annualized_volatility_pct": 0.32 + i * 0.001,
                "is_statistically_reliable": i >= 30,
            }
            for i in range(60)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(sample_user_id, days=60)

        # Latest value should be from the end of the dataset
        assert result["summary"]["latest_sharpe_ratio"] != 0.0
        assert result["data_points"] == 60


class TestAnalyticsContextEducationalMethods:
    """Tests for educational context building methods in PortfolioAnalyticsContext."""

    @pytest.mark.parametrize(
        "sharpe_ratio,expected_interpretation",
        [
            (-0.5, "Poor"),  # Poor (< 0)
            (0.5, "Below Average"),  # Below average (0 - 1)
            (1.5, "Good"),  # Good (1 - 2)
            (2.5, "Very Good"),  # Very good (2 - 3)
            (3.5, "Excellent"),  # Excellent (> 3)
            # Boundary values - implementation uses < not <=, so equal values fall into next tier
            (0.0, "Below Average"),  # Exactly at 0.0 threshold -> Below Average
            (1.0, "Good"),  # Exactly at 1.0 threshold -> Good
            (2.0, "Very Good"),  # Exactly at 2.0 threshold -> Very Good
            (3.0, "Excellent"),  # Exactly at 3.0 threshold -> Excellent
        ],
    )
    def test_sharpe_educational_context_interpretation(
        self, analytics_context, sharpe_ratio, expected_interpretation
    ):
        """Test Sharpe ratio educational context generation across all interpretation levels."""
        context = analytics_context.build_sharpe_educational_context(sharpe_ratio)

        assert context["interpretation"] == expected_interpretation
        assert context["window_size"] == 30
        assert "reliability_warning" in context
        assert "directional indicators" in context["reliability_warning"]
        assert (
            context["recommended_minimum"]
            == "90+ days for statistically robust analysis"
        )

    def test_sharpe_educational_context_structure(self, analytics_context):
        """Test that Sharpe educational context has all required fields."""
        context = analytics_context.build_sharpe_educational_context(1.5)

        required_fields = {
            "reliability_warning",
            "recommended_minimum",
            "window_size",
            "interpretation",
        }
        assert set(context.keys()) == required_fields

    @pytest.mark.parametrize(
        "volatility,expected_level",
        [
            (5.0, "Very Low"),  # Very low (< 10%)
            (15.0, "Low"),  # Low (10-25%)
            (35.0, "Moderate"),  # Moderate (25-50%)
            (75.0, "High"),  # High (50-100%)
            (150.0, "Very High"),  # Very high (> 100%)
            # Boundary values - implementation uses < not <=, so equal values fall into next tier
            (10.0, "Low"),  # Exactly at 10.0 threshold -> Low
            (25.0, "Moderate"),  # Exactly at 25.0 threshold -> Moderate
            (50.0, "High"),  # Exactly at 50.0 threshold -> High
            (100.0, "Very High"),  # Exactly at 100.0 threshold -> Very High
        ],
    )
    def test_volatility_educational_context_interpretation(
        self, analytics_context, volatility, expected_level
    ):
        """Test volatility educational context generation across all interpretation levels."""
        context = analytics_context.build_volatility_educational_context(volatility)

        assert context["interpretation"] == expected_level
        assert context["window_size"] == 30
        assert "volatility_note" in context
        assert "Short-term volatility" in context["volatility_note"]
        assert (
            context["calculation_method"]
            == "30-day rolling standard deviation of daily returns"
        )
        assert (
            context["annualization_factor"]
            == f"Daily volatility * sqrt({TRADING_DAYS_PER_YEAR} trading days)"
        )

    def test_volatility_educational_context_structure(self, analytics_context):
        """Test that volatility educational context has all required fields."""
        context = analytics_context.build_volatility_educational_context(35.0)

        required_fields = {
            "volatility_note",
            "calculation_method",
            "annualization_factor",
            "window_size",
            "interpretation",
        }
        assert set(context.keys()) == required_fields

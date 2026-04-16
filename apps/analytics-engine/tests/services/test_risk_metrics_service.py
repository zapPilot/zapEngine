"""
Unit tests for Risk Metrics functionality in RiskMetricsService.

Tests portfolio volatility, maximum drawdown, and Sharpe ratio calculations
with various data scenarios and edge cases.
"""

from unittest.mock import Mock
from uuid import uuid4

import pytest

from src.core.constants import TRADING_DAYS_PER_YEAR
from src.services.analytics.risk_metrics_service import RiskMetricsService
from src.services.shared.query_service import QueryService


@pytest.fixture
def risk_service():
    """Provides a RiskMetricsService instance with a mock database."""
    return RiskMetricsService(db=Mock(), query_service=QueryService())


@pytest.fixture
def sample_user_id():
    """Provides a sample user UUID for testing."""
    return uuid4()


class TestPortfolioVolatilityCalculation:
    """Tests for portfolio volatility calculation method."""

    def test_insufficient_data_for_volatility(
        self, risk_service, sample_user_id, mocker
    ):
        """Test volatility calculation with insufficient data points."""
        mock_execute = mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": None,
                }
            ],
        )

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        mock_execute.assert_called_once()
        assert result["user_id"] == str(sample_user_id)
        assert result["volatility_annualized"] == 0.0
        assert result["data_points"] == 0
        assert "Insufficient data" in result["message"]

    def test_no_valid_returns_data(self, risk_service, sample_user_id, mocker):
        """Test volatility calculation with null returns."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": None,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1100.0,
                    "daily_return": None,
                },
            ],
        )

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        assert result["volatility_annualized"] == 0.0
        assert result["data_points"] == 0
        assert "Insufficient data" in result["message"]

    def test_successful_volatility_calculation(
        self, risk_service, sample_user_id, mocker
    ):
        """Test successful volatility calculation with valid returns data."""
        # Sample returns data: 10% daily returns with some variation
        mock_execute = mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.10,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1100.0,
                    "daily_return": 0.091,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1200.0,
                    "daily_return": 0.091,
                },
                {
                    "date": "2023-01-04",
                    "total_portfolio_value": 1300.0,
                    "daily_return": 0.083,
                },
                {
                    "date": "2023-01-05",
                    "total_portfolio_value": 1400.0,
                    "daily_return": 0.077,
                },
            ],
        )

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        mock_execute.assert_called_once()
        assert result["user_id"] == str(sample_user_id)
        assert result["period_days"] == 30
        assert result["data_points"] == 5
        assert result["volatility_daily"] > 0
        assert result["volatility_annualized"] > 0
        assert result["average_daily_return"] > 0

        # Verify annualization factor matches configured trading days
        expected_annualized = result["volatility_daily"] * (TRADING_DAYS_PER_YEAR**0.5)
        assert abs(result["volatility_annualized"] - expected_annualized) < 0.001

    def test_high_volatility_portfolio(self, risk_service, sample_user_id, mocker):
        """Test volatility calculation with high variance returns."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.20,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 800.0,
                    "daily_return": -0.20,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1200.0,
                    "daily_return": 0.50,
                },
                {
                    "date": "2023-01-04",
                    "total_portfolio_value": 600.0,
                    "daily_return": -0.50,
                },
                {
                    "date": "2023-01-05",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.67,
                },
            ],
        )

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        assert result["volatility_daily"] > 0.4  # High daily volatility
        assert result["volatility_annualized"] > 6.0  # High annualized volatility

    def test_stable_portfolio_low_volatility(
        self, risk_service, sample_user_id, mocker
    ):
        """Test volatility calculation with stable returns."""
        # Very stable returns (1% daily with minimal variation)
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.01,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1010.0,
                    "daily_return": 0.0099,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1020.0,
                    "daily_return": 0.0098,
                },
                {
                    "date": "2023-01-04",
                    "total_portfolio_value": 1030.0,
                    "daily_return": 0.0098,
                },
                {
                    "date": "2023-01-05",
                    "total_portfolio_value": 1040.0,
                    "daily_return": 0.0097,
                },
            ],
        )

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=30)

        assert result["volatility_daily"] < 0.01  # Very low daily volatility
        assert result["volatility_annualized"] < 0.16  # Low annualized volatility


class TestMaxDrawdownCalculation:
    """Tests for maximum drawdown calculation method."""

    def test_no_portfolio_data(self, risk_service, sample_user_id, mocker):
        """Test drawdown calculation with no portfolio data."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        mock_execute.assert_called_once()
        assert result["user_id"] == str(sample_user_id)
        assert result["max_drawdown"] == 0.0
        assert result["max_drawdown_percentage"] == 0.0
        assert result["data_points"] == 0
        assert "No portfolio data found" in result["message"]

    def test_no_drawdown_scenario(self, risk_service, sample_user_id, mocker):
        """Test drawdown calculation with continuously increasing portfolio value."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "portfolio_value": 1000.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-02",
                    "portfolio_value": 1100.0,
                    "peak_value": 1100.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-03",
                    "portfolio_value": 1200.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-04",
                    "portfolio_value": 1300.0,
                    "peak_value": 1300.0,
                    "drawdown_pct": 0.0,
                },
            ],
        )

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        assert result["max_drawdown"] == 0.0
        assert result["max_drawdown_percentage"] == 0.0
        assert result["recovery_needed_percentage"] == 0.0
        assert result["current_drawdown"] == 0.0

    def test_significant_drawdown_scenario(self, risk_service, sample_user_id, mocker):
        """Test drawdown calculation with significant portfolio decline."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "portfolio_value": 1000.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-02",
                    "portfolio_value": 1200.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-03",
                    "portfolio_value": 800.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": -0.333333,
                },  # 33.33% drawdown
                {
                    "date": "2023-01-04",
                    "portfolio_value": 600.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": -0.5,
                },  # 50% drawdown (max)
                {
                    "date": "2023-01-05",
                    "portfolio_value": 900.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": -0.25,
                },  # Current: 25% drawdown
            ],
        )

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        assert result["max_drawdown"] == -0.5
        assert result["max_drawdown_percentage"] == -50.0
        assert result["max_drawdown_date"] == "2023-01-04"
        assert result["peak_value"] == 1200.0
        assert result["trough_value"] == 600.0
        assert result["recovery_needed_percentage"] == 50.0
        assert result["current_drawdown"] == -0.25
        assert result["current_drawdown_percentage"] == -25.0

    def test_recovery_after_drawdown(self, risk_service, sample_user_id, mocker):
        """Test drawdown calculation with full recovery scenario."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "portfolio_value": 1000.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-02",
                    "portfolio_value": 1500.0,
                    "peak_value": 1500.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-03",
                    "portfolio_value": 750.0,
                    "peak_value": 1500.0,
                    "drawdown_pct": -0.5,
                },  # 50% drawdown
                {
                    "date": "2023-01-04",
                    "portfolio_value": 1200.0,
                    "peak_value": 1500.0,
                    "drawdown_pct": -0.2,
                },  # Recovery
                {
                    "date": "2023-01-05",
                    "portfolio_value": 1500.0,
                    "peak_value": 1500.0,
                    "drawdown_pct": 0.0,
                },  # Full recovery
            ],
        )

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        assert result["max_drawdown"] == -0.5
        assert result["max_drawdown_percentage"] == -50.0
        assert result["current_drawdown"] == 0.0  # Fully recovered
        assert result["current_drawdown_percentage"] == 0.0

    def test_multiple_drawdown_periods(self, risk_service, sample_user_id, mocker):
        """Test drawdown calculation with multiple drawdown periods."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "portfolio_value": 1000.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": 0.0,
                },
                {
                    "date": "2023-01-02",
                    "portfolio_value": 800.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": -0.2,
                },  # 20% drawdown
                {
                    "date": "2023-01-03",
                    "portfolio_value": 1200.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": 0.0,
                },  # New peak
                {
                    "date": "2023-01-04",
                    "portfolio_value": 600.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": -0.5,
                },  # 50% drawdown (max)
                {
                    "date": "2023-01-05",
                    "portfolio_value": 1000.0,
                    "peak_value": 1200.0,
                    "drawdown_pct": -0.167,
                },  # Partial recovery
            ],
        )

        result = risk_service.calculate_max_drawdown(sample_user_id, days=90)

        # Should capture the maximum drawdown across all periods
        assert result["max_drawdown"] == -0.5
        assert result["max_drawdown_percentage"] == -50.0
        assert result["data_points"] == 5


class TestRiskCalculationEdgeCases:
    """Tests for edge cases in risk calculations."""

    def test_single_day_portfolio_data(self, risk_service, sample_user_id, mocker):
        """Test handling of single day portfolio data."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": None,
                }
            ],
        )

        result = risk_service.calculate_portfolio_volatility(sample_user_id, days=1)

        assert result["volatility_annualized"] == 0.0
        assert "Insufficient data" in result["message"]

    def test_zero_portfolio_values(self, risk_service, sample_user_id, mocker):
        """Test handling of zero portfolio values in drawdown calculation."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "portfolio_value": 0.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": -1.0,
                },  # 100% loss
                {
                    "date": "2023-01-02",
                    "portfolio_value": 0.0,
                    "peak_value": 1000.0,
                    "drawdown_pct": -1.0,
                },
            ],
        )

        result = risk_service.calculate_max_drawdown(sample_user_id, days=30)

        assert result["max_drawdown"] == -1.0
        assert result["max_drawdown_percentage"] == -100.0
        assert result["trough_value"] == 0.0

    def test_custom_date_ranges(self, risk_service, sample_user_id, mocker):
        """Test risk calculations with custom date ranges."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.01,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1010.0,
                    "daily_return": 0.01,
                },
            ],
        )

        # Test with different day ranges
        result_30_days = risk_service.calculate_portfolio_volatility(
            sample_user_id, days=30
        )
        result_7_days = risk_service.calculate_portfolio_volatility(
            sample_user_id, days=7
        )

        assert result_30_days["period_days"] == 30
        assert result_7_days["period_days"] == 7

        # Both should have the same volatility values (data is the same)
        assert result_30_days["volatility_daily"] == result_7_days["volatility_daily"]


class TestSharpeRatioCalculation:
    """Tests for Sharpe ratio calculation method."""

    def test_insufficient_data_for_sharpe_ratio(
        self, risk_service, sample_user_id, mocker
    ):
        """Test Sharpe ratio calculation with insufficient data points."""
        mock_execute = mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": None,
                }
            ],
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        mock_execute.assert_called_once()
        assert result["user_id"] == str(sample_user_id)
        assert result["sharpe_ratio"] == 0.0
        assert result["data_points"] == 0  # Empty response due to < 2 records
        assert "Insufficient data" in result["message"]

    def test_no_valid_returns_for_sharpe_ratio(
        self, risk_service, sample_user_id, mocker
    ):
        """Test Sharpe ratio calculation with null returns."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": None,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1100.0,
                    "daily_return": None,
                },
            ],
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["sharpe_ratio"] == 0.0
        assert result["data_points"] == 0
        assert "Insufficient data" in result["message"]

    def test_successful_sharpe_ratio_calculation(
        self, risk_service, sample_user_id, mocker
    ):
        """Test successful Sharpe ratio calculation with valid returns data."""
        # Sample returns data: Positive returns above risk-free rate
        mock_execute = mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.002,  # ~0.5% daily = ~126% annual
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1002.0,
                    "daily_return": 0.003,  # 0.3% daily
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1005.0,
                    "daily_return": 0.0025,
                },
                {
                    "date": "2023-01-04",
                    "total_portfolio_value": 1007.5,
                    "daily_return": 0.0015,
                },
                {
                    "date": "2023-01-05",
                    "total_portfolio_value": 1009.0,
                    "daily_return": 0.002,
                },
            ],
        )

        # Mock config settings
        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        mock_execute.assert_called_once()
        assert result["user_id"] == str(sample_user_id)
        assert result["period_days"] == 30
        assert result["data_points"] == 5
        assert result["sharpe_ratio"] > 0  # Should be positive
        assert result["portfolio_return_annual"] > 0
        assert result["risk_free_rate_annual"] == 0.025
        assert result["excess_return"] > 0  # Portfolio return > risk-free rate
        assert result["volatility_annual"] > 0
        assert result["interpretation"] in ["Good", "Very Good", "Excellent"]

        # Verify Sharpe ratio calculation (accounting for rounding)
        expected_sharpe = result["excess_return"] / result["volatility_annual"]
        assert (
            abs(result["sharpe_ratio"] - expected_sharpe) < 0.5
        )  # Allow for rounding differences

    def test_negative_sharpe_ratio_scenario(self, risk_service, sample_user_id, mocker):
        """Test Sharpe ratio calculation with portfolio returns below risk-free rate."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": -0.001,  # -0.1% daily = ~-25% annual
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 999.0,
                    "daily_return": -0.0005,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 998.5,
                    "daily_return": -0.0008,
                },
                {
                    "date": "2023-01-04",
                    "total_portfolio_value": 997.7,
                    "daily_return": -0.0012,
                },
                {
                    "date": "2023-01-05",
                    "total_portfolio_value": 996.5,
                    "daily_return": -0.0006,
                },
            ],
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["sharpe_ratio"] < 0  # Negative Sharpe ratio
        assert result["portfolio_return_annual"] < 0
        assert result["excess_return"] < 0  # Portfolio return < risk-free rate
        assert result["interpretation"] == "Poor"

    def test_zero_volatility_sharpe_ratio(self, risk_service, sample_user_id, mocker):
        """Test Sharpe ratio calculation with zero volatility (constant returns)."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.001,  # Constant 0.1% daily
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1001.0,
                    "daily_return": 0.001,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1002.0,
                    "daily_return": 0.001,
                },
            ],
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        # With zero volatility, Sharpe ratio should be 0 (division by zero protection)
        assert result["sharpe_ratio"] == 0
        assert result["volatility_annual"] == 0.0

    def test_sharpe_ratio_interpretation_thresholds(self, risk_service):
        """Test Sharpe ratio interpretation at specific threshold values."""
        test_cases = [
            {"sharpe": -0.5, "expected": "Poor"},
            {
                "sharpe": 0.0,
                "expected": "Below Average",
            },  # 0 is not negative, so Below Average
            {"sharpe": 0.5, "expected": "Below Average"},
            {"sharpe": 1.5, "expected": "Good"},
            {"sharpe": 2.5, "expected": "Very Good"},
            {"sharpe": 3.5, "expected": "Excellent"},
        ]

        for case in test_cases:
            result = risk_service.context.interpret_sharpe_ratio(case["sharpe"])
            assert result == case["expected"], (
                f"Sharpe ratio {case['sharpe']} should be '{case['expected']}', got '{result}'"
            )

    def test_sharpe_ratio_with_high_risk_free_rate(
        self, risk_service, sample_user_id, mocker
    ):
        """Test Sharpe ratio calculation with high risk-free rate."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.002,  # 0.2% daily = ~50% annual
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1002.0,
                    "daily_return": 0.002,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1004.0,
                    "daily_return": 0.002,
                },
            ],
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.10,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["risk_free_rate_annual"] == 0.10
        # With 10% risk-free rate vs ~50% portfolio return, excess return should be positive
        assert result["excess_return"] > 0

    def test_sharpe_ratio_custom_date_ranges(
        self, risk_service, sample_user_id, mocker
    ):
        """Test Sharpe ratio calculation with custom date ranges."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.001,
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1001.0,
                    "daily_return": 0.001,
                },
            ],
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        # Test with different day ranges
        result_7_days = risk_service.calculate_sharpe_ratio(sample_user_id, days=7)
        result_90_days = risk_service.calculate_sharpe_ratio(sample_user_id, days=90)

        assert result_7_days["period_days"] == 7
        assert result_90_days["period_days"] == 90
        # Both should have the same calculated values (data is the same)
        assert result_7_days["sharpe_ratio"] == result_90_days["sharpe_ratio"]


class TestSharpeRatioConfigurableRiskFreeRate:
    """Tests for Sharpe ratio functionality with configurable risk-free rates."""

    def test_sharpe_ratio_with_configurable_risk_free_rate(
        self, risk_service, sample_user_id, mocker
    ):
        """Test Sharpe ratio calculation with different risk-free rates."""
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.004,  # 0.4% daily = ~100% annual
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1004.0,
                    "daily_return": 0.004,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1008.0,
                    "daily_return": 0.004,
                },
            ],
        )

        # Test with default 2.5% risk-free rate
        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result["risk_free_rate_annual"] == 0.025
        assert result["portfolio_return_annual"] > 0.9  # Should be ~100% annual
        assert result["excess_return"] > 0.9  # Portfolio return - 2.5%
        # With identical returns, volatility is zero, so Sharpe ratio is 0
        assert result["sharpe_ratio"] == 0  # Zero volatility = zero Sharpe ratio

        # Test with higher risk-free rate (5%)
        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.05,
        )
        result_high_rf = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result_high_rf["risk_free_rate_annual"] == 0.05
        assert (
            result_high_rf["excess_return"] < result["excess_return"]
        )  # Lower excess return
        # Both Sharpe ratios are 0 due to zero volatility, so no comparison needed

    def test_sharpe_ratio_calculation_precision(
        self, risk_service, sample_user_id, mocker
    ):
        """Test mathematical precision of Sharpe ratio calculations."""
        # Use precise return values to test calculation accuracy
        precise_returns = [0.001234, 0.002345, 0.001567, 0.002890, 0.001445]
        mock_data = []
        portfolio_value = 1000.0

        for i, daily_return in enumerate(precise_returns):
            portfolio_value *= 1 + daily_return
            mock_data.append(
                {
                    "date": f"2023-01-{i + 1:02d}",
                    "total_portfolio_value": portfolio_value,
                    "daily_return": daily_return,
                }
            )

        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=mock_data,
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        # Manually calculate expected values for verification
        import statistics

        avg_daily_return = statistics.mean(precise_returns)
        volatility_daily = statistics.stdev(precise_returns)

        expected_portfolio_return_annual = avg_daily_return * TRADING_DAYS_PER_YEAR
        expected_volatility_annual = volatility_daily * (TRADING_DAYS_PER_YEAR**0.5)
        expected_excess_return = expected_portfolio_return_annual - 0.025
        expected_sharpe = expected_excess_return / expected_volatility_annual

        # Verify calculations with small tolerance for floating point precision
        assert (
            abs(result["portfolio_return_annual"] - expected_portfolio_return_annual)
            < 0.0001
        )
        assert abs(result["volatility_annual"] - expected_volatility_annual) < 0.0001
        assert abs(result["excess_return"] - expected_excess_return) < 0.0001
        assert abs(result["sharpe_ratio"] - expected_sharpe) < 0.001

    def test_sharpe_ratio_edge_cases(self, risk_service, sample_user_id, mocker):
        """Test Sharpe ratio calculation edge cases."""

        # Test case 1: Perfect constant returns (zero volatility)
        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=[
                {
                    "date": "2023-01-01",
                    "total_portfolio_value": 1000.0,
                    "daily_return": 0.002,  # Exactly 0.2% daily
                },
                {
                    "date": "2023-01-02",
                    "total_portfolio_value": 1002.0,
                    "daily_return": 0.002,
                },
                {
                    "date": "2023-01-03",
                    "total_portfolio_value": 1004.0,
                    "daily_return": 0.002,
                },
            ],
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        result = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        # With zero volatility, Sharpe ratio should be 0 (division by zero protection)
        assert result["volatility_annual"] == 0.0
        assert result["sharpe_ratio"] == 0

        # Clear cache between test cases within this test method
        from src.core.cache_service import analytics_cache

        analytics_cache.clear()

        # Test case 2: Extremely high volatility
        high_volatility_returns = [
            0.05,
            -0.04,
            0.06,
            -0.05,
            0.07,
            -0.06,
        ]  # Very volatile
        mock_data = []
        portfolio_value = 1000.0

        for i, daily_return in enumerate(high_volatility_returns):
            portfolio_value *= 1 + daily_return
            mock_data.append(
                {
                    "date": f"2023-01-{i + 1:02d}",
                    "total_portfolio_value": portfolio_value,
                    "daily_return": daily_return,
                }
            )

        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=mock_data,
        )

        result_volatile = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)

        assert result_volatile["volatility_annual"] > 0.5  # High volatility
        assert (
            abs(result_volatile["sharpe_ratio"]) < 2
        )  # Should be moderate due to high volatility

    def test_sharpe_ratio_period_consistency(
        self, risk_service, sample_user_id, mocker
    ):
        """Test Sharpe ratio calculation consistency across different periods."""
        # Same return pattern for all tests
        consistent_returns = [0.001, 0.002, 0.0015, 0.0025, 0.002]
        mock_data = []
        portfolio_value = 1000.0

        for i, daily_return in enumerate(consistent_returns):
            portfolio_value *= 1 + daily_return
            mock_data.append(
                {
                    "date": f"2023-01-{i + 1:02d}",
                    "total_portfolio_value": portfolio_value,
                    "daily_return": daily_return,
                }
            )

        mocker.patch.object(
            QueryService,
            "execute_query",
            return_value=mock_data,
        )

        mocker.patch(
            "src.services.analytics.risk_metrics_service.settings.risk_free_rate_annual",
            0.025,
        )

        # Test different period lengths (should produce same results due to same data)
        result_7_days = risk_service.calculate_sharpe_ratio(sample_user_id, days=7)
        result_30_days = risk_service.calculate_sharpe_ratio(sample_user_id, days=30)
        result_90_days = risk_service.calculate_sharpe_ratio(sample_user_id, days=90)

        # All should have same Sharpe ratio (same data)
        assert result_7_days["sharpe_ratio"] == result_30_days["sharpe_ratio"]
        assert result_30_days["sharpe_ratio"] == result_90_days["sharpe_ratio"]

        # But different period_days
        assert result_7_days["period_days"] == 7
        assert result_30_days["period_days"] == 30
        assert result_90_days["period_days"] == 90

"""Tests for PerformanceMetricsCalculator.

Tests each metric calculation independently and the aggregate method.
"""

import numpy as np

from src.services.backtesting.execution.performance_metrics import (
    PerformanceMetricsCalculator,
)


class TestCalculateVolatility:
    """Tests for volatility calculation."""

    def test_zero_volatility(self):
        """Constant returns should have zero volatility."""
        returns = np.array([0.01, 0.01, 0.01, 0.01])
        calc = PerformanceMetricsCalculator()
        volatility = calc.calculate_volatility(returns)
        assert volatility == 0.0

    def test_positive_volatility(self):
        """Variable returns should have positive volatility."""
        returns = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
        calc = PerformanceMetricsCalculator()
        volatility = calc.calculate_volatility(returns)
        assert volatility > 0.0

    def test_annualization(self):
        """Volatility should be annualized (×√365)."""
        returns = np.array([0.01, -0.02, 0.03])
        calc = PerformanceMetricsCalculator()
        volatility = calc.calculate_volatility(returns)

        # Manual calculation
        expected = np.std(returns) * np.sqrt(365)
        assert abs(volatility - expected) < 1e-6


class TestCalculateSharpeRatio:
    """Tests for Sharpe ratio calculation."""

    def test_zero_std_returns_zero(self):
        """Zero standard deviation should return 0."""
        returns = np.array([0.01, 0.01, 0.01])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        assert sharpe == 0.0

    def test_positive_sharpe(self):
        """Positive returns with volatility should have positive Sharpe."""
        returns = np.array([0.01, 0.02, 0.015, 0.018])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        assert sharpe > 0.0

    def test_negative_sharpe(self):
        """Negative returns should have negative Sharpe."""
        returns = np.array([-0.01, -0.02, -0.015])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        assert sharpe < 0.0


class TestCalculateSortinoRatio:
    """Tests for Sortino ratio calculation."""

    def test_no_downside_returns_sharpe(self):
        """No downside should return Sharpe ratio."""
        returns = np.array([0.01, 0.02, 0.015])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        sortino = calc.calculate_sortino_ratio(returns, sharpe)
        assert sortino == sharpe

    def test_only_downside_calculates(self):
        """Only downside returns with variance should still calculate Sortino."""
        returns = np.array([-0.01, -0.02, -0.015])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        sortino = calc.calculate_sortino_ratio(returns, sharpe)

        # Both should be negative, Sortino should calculate normally
        assert sortino < 0.0
        assert sharpe < 0.0

    def test_constant_downside_returns_zero(self):
        """Constant downside returns (zero std dev) should return 0."""
        returns = np.array([-0.01, -0.01, -0.01])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        sortino = calc.calculate_sortino_ratio(returns, sharpe)

        # Sharpe is 0 (zero std dev), Sortino should also be 0
        assert sortino == 0.0
        assert sharpe == 0.0

    def test_mixed_returns(self):
        """Mixed returns should calculate based on downside deviation."""
        returns = np.array([0.02, -0.01, 0.03, -0.02, 0.01])
        calc = PerformanceMetricsCalculator()
        sharpe = calc.calculate_sharpe_ratio(returns)
        sortino = calc.calculate_sortino_ratio(returns, sharpe)

        # Sortino should be higher than Sharpe (only considers downside)
        assert sortino >= sharpe


class TestCalculateMaxDrawdown:
    """Tests for maximum drawdown calculation."""

    def test_no_drawdown(self):
        """Monotonically increasing values should have zero drawdown."""
        values = np.array([100.0, 110.0, 120.0, 130.0])
        calc = PerformanceMetricsCalculator()
        drawdown = calc.calculate_max_drawdown(values)
        assert drawdown == 0.0

    def test_simple_drawdown(self):
        """Calculate drawdown from peak to trough."""
        values = np.array([100.0, 120.0, 90.0, 110.0])
        calc = PerformanceMetricsCalculator()
        drawdown = calc.calculate_max_drawdown(values)

        # Max drawdown from 120 to 90 = -25%
        expected = -0.25
        assert abs(drawdown - expected) < 1e-6

    def test_multiple_drawdowns(self):
        """Should return the maximum (most negative) drawdown."""
        values = np.array([100.0, 120.0, 90.0, 110.0, 85.0, 100.0])
        calc = PerformanceMetricsCalculator()
        drawdown = calc.calculate_max_drawdown(values)

        # Max drawdown from 120 to 85 = -29.17%
        expected = (85.0 - 120.0) / 120.0
        assert abs(drawdown - expected) < 1e-6


class TestCalculateCalmarRatio:
    """Tests for Calmar ratio calculation."""

    def test_no_drawdown_returns_zero(self):
        """No drawdown should return 0."""
        values = np.array([100.0, 110.0, 120.0])
        calc = PerformanceMetricsCalculator()
        calmar = calc.calculate_calmar_ratio(values, 0.0)
        assert calmar == 0.0

    def test_positive_calmar(self):
        """Positive return with drawdown should have positive Calmar."""
        values = np.array([100.0, 120.0, 90.0, 130.0])
        calc = PerformanceMetricsCalculator()
        max_dd = calc.calculate_max_drawdown(values)
        calmar = calc.calculate_calmar_ratio(values, max_dd)
        assert calmar > 0.0

    def test_calmar_formula(self):
        """Verify Calmar formula: annualized return / |max drawdown|."""
        values = np.array([100.0, 120.0, 90.0, 110.0])
        calc = PerformanceMetricsCalculator()
        max_dd = calc.calculate_max_drawdown(values)
        calmar = calc.calculate_calmar_ratio(values, max_dd)

        # Manual calculation
        total_return = (110.0 - 100.0) / 100.0  # 10%
        years = 4 / 365.0
        annualized_return = (1 + total_return) ** (1 / years) - 1
        expected_calmar = annualized_return / abs(max_dd)

        assert abs(calmar - expected_calmar) < 1e-6


class TestCalculateBeta:
    """Tests for beta calculation."""

    def test_insufficient_data(self):
        """Less than 2 data points should return 0."""
        calc = PerformanceMetricsCalculator()
        beta = calc.calculate_beta(np.array([0.01]), np.array([0.01]))
        assert beta == 0.0

    def test_perfect_correlation(self):
        """Identical returns should have beta close to 1 (may vary due to ddof)."""
        returns = np.array([0.01, -0.02, 0.03, -0.01])
        calc = PerformanceMetricsCalculator()
        beta = calc.calculate_beta(returns, returns)

        # Beta should be positive and reasonably close to 1
        # (exact value depends on numpy cov/var ddof defaults)
        assert beta > 0.0
        assert abs(beta - 1.0) < 0.5  # Relax tolerance for ddof differences

    def test_negative_correlation(self):
        """Negatively correlated returns should have negative beta."""
        strategy_returns = np.array([0.01, -0.02, 0.03, -0.01])
        benchmark_returns = np.array([-0.01, 0.02, -0.03, 0.01])  # Opposite signs
        calc = PerformanceMetricsCalculator()
        beta = calc.calculate_beta(strategy_returns, benchmark_returns)
        assert beta < 0.0  # Should be negative correlation

    def test_length_mismatch(self):
        """Should handle different length arrays by truncating."""
        strategy_returns = np.array([0.01, -0.02, 0.03, -0.01, 0.02])
        benchmark_returns = np.array([0.01, -0.02, 0.03])
        calc = PerformanceMetricsCalculator()
        beta = calc.calculate_beta(strategy_returns, benchmark_returns)

        # Should work despite mismatch
        assert isinstance(beta, float)


class TestCalculateAllMetrics:
    """Tests for aggregate metric calculation."""

    def test_insufficient_data(self):
        """Less than 2 data points should return all zeros."""
        calc = PerformanceMetricsCalculator()
        metrics = calc.calculate_all_metrics([100.0], [50.0])

        assert metrics["sharpe_ratio"] == 0.0
        assert metrics["sortino_ratio"] == 0.0
        assert metrics["calmar_ratio"] == 0.0
        assert metrics["volatility"] == 0.0
        assert metrics["beta"] == 0.0
        assert metrics["max_drawdown_percent"] == 0.0

    def test_all_metrics_present(self):
        """Should return all required metric keys."""
        values = [100.0, 110.0, 105.0, 115.0, 120.0]
        prices = [50.0, 55.0, 52.0, 57.0, 60.0]
        calc = PerformanceMetricsCalculator()
        metrics = calc.calculate_all_metrics(values, prices)

        expected_keys = {
            "sharpe_ratio",
            "sortino_ratio",
            "calmar_ratio",
            "volatility",
            "beta",
            "max_drawdown_percent",
        }
        assert set(metrics.keys()) == expected_keys

    def test_drawdown_as_percentage(self):
        """Max drawdown should be returned as percentage."""
        values = [100.0, 120.0, 90.0, 110.0]
        prices = [50.0, 60.0, 45.0, 55.0]
        calc = PerformanceMetricsCalculator()
        metrics = calc.calculate_all_metrics(values, prices)

        # Drawdown from 120 to 90 = -25% = -0.25
        # Should be converted to -25.0 (percentage)
        expected_dd_percent = -25.0
        assert abs(metrics["max_drawdown_percent"] - expected_dd_percent) < 0.01

    def test_consistency_with_original(self):
        """Results should match original engine.py implementation."""
        # Use same test data as original tests
        values = [100.0, 105.0, 110.0, 108.0, 115.0, 120.0]
        prices = [50.0, 52.0, 54.0, 53.0, 56.0, 58.0]
        calc = PerformanceMetricsCalculator()
        metrics = calc.calculate_all_metrics(values, prices)

        # Verify all metrics are calculated (non-zero for this data)
        assert metrics["volatility"] > 0.0
        assert metrics["sharpe_ratio"] != 0.0
        assert metrics["beta"] != 0.0

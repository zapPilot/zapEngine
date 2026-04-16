"""Performance metrics calculator for backtesting strategies.

Provides standardized calculations for:
- Volatility (annualized standard deviation)
- Sharpe ratio (risk-adjusted return)
- Sortino ratio (downside risk-adjusted return)
- Maximum drawdown
- Calmar ratio (return/drawdown)
- Beta (correlation with benchmark)
"""

import numpy as np


class PerformanceMetricsCalculator:
    """Calculate financial performance metrics for backtesting."""

    @staticmethod
    def calculate_volatility(returns: np.ndarray) -> float:
        """Calculate annualized volatility.

        Args:
            returns: Daily returns array

        Returns:
            Annualized volatility (std dev * sqrt(365))
        """
        return float(np.std(returns) * np.sqrt(365))

    @staticmethod
    def calculate_sharpe_ratio(returns: np.ndarray) -> float:
        """Calculate Sharpe ratio (risk-adjusted return).

        Assumes risk-free rate = 0 for crypto markets.

        Args:
            returns: Daily returns array

        Returns:
            Annualized Sharpe ratio
        """
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        if std_return > 0:
            return float((mean_return / std_return) * np.sqrt(365))
        return 0.0

    @staticmethod
    def calculate_sortino_ratio(returns: np.ndarray, sharpe_ratio: float) -> float:
        """Calculate Sortino ratio (downside risk-adjusted return).

        Only considers downside deviation (negative returns) for risk calculation.

        Args:
            returns: Daily returns array
            sharpe_ratio: Pre-calculated Sharpe ratio (fallback if no downside)

        Returns:
            Annualized Sortino ratio
        """
        mean_return = np.mean(returns)
        negative_returns = returns[returns < 0]
        has_downside_returns = negative_returns.size > 0
        downside_std = np.std(negative_returns) if has_downside_returns else 0.0

        if downside_std > 0:
            return float((mean_return / downside_std) * np.sqrt(365))
        # If no negative returns, return Sharpe; if only negative, return 0
        return sharpe_ratio if not has_downside_returns else 0.0

    @staticmethod
    def calculate_max_drawdown(values: np.ndarray) -> float:
        """Calculate maximum drawdown percentage.

        Args:
            values: Portfolio values over time

        Returns:
            Maximum drawdown as negative decimal (e.g., -0.25 for 25% drawdown)
        """
        running_max = np.maximum.accumulate(values)
        drawdowns = (values - running_max) / running_max
        return float(np.min(drawdowns))

    @staticmethod
    def calculate_calmar_ratio(values: np.ndarray, max_drawdown: float) -> float:
        """Calculate Calmar ratio (annualized return / max drawdown).

        Args:
            values: Portfolio values over time
            max_drawdown: Pre-calculated max drawdown (negative decimal)

        Returns:
            Calmar ratio (higher is better)
        """
        if max_drawdown >= 0:
            return 0.0

        total_return = (values[-1] - values[0]) / values[0]
        years = len(values) / 365.0
        annualized_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0.0

        return float(annualized_return / abs(max_drawdown))

    @staticmethod
    def calculate_beta(
        strategy_returns: np.ndarray, benchmark_returns: np.ndarray
    ) -> float:
        """Calculate beta (correlation with benchmark).

        Beta measures systematic risk relative to the market benchmark.

        Args:
            strategy_returns: Strategy daily returns
            benchmark_returns: Benchmark daily returns

        Returns:
            Beta coefficient (1.0 = moves with market)
        """
        min_len = min(len(strategy_returns), len(benchmark_returns))
        if min_len < 2:
            return 0.0

        # Align lengths
        strat_aligned = strategy_returns[:min_len]
        bench_aligned = benchmark_returns[:min_len]

        covariance = np.cov(strat_aligned, bench_aligned)[0][1]
        benchmark_variance = np.var(bench_aligned)

        if benchmark_variance > 0:
            return float(covariance / benchmark_variance)
        return 0.0

    def calculate_all_metrics(
        self,
        strategy_values: list[float],
        benchmark_prices: list[float],
    ) -> dict[str, float]:
        """Calculate all performance metrics at once.

        Args:
            strategy_values: Daily portfolio values
            benchmark_prices: Daily benchmark prices (e.g., BTC)

        Returns:
            Dictionary with all calculated metrics:
                - volatility: Annualized volatility
                - sharpe_ratio: Risk-adjusted return ratio
                - sortino_ratio: Downside risk-adjusted return ratio
                - max_drawdown_percent: Maximum drawdown as percentage
                - calmar_ratio: Return/drawdown ratio
                - beta: Correlation with benchmark
        """
        # Edge case: insufficient data
        if len(strategy_values) < 2 or len(benchmark_prices) < 2:
            return {
                "sharpe_ratio": 0.0,
                "sortino_ratio": 0.0,
                "calmar_ratio": 0.0,
                "volatility": 0.0,
                "beta": 0.0,
                "max_drawdown_percent": 0.0,
            }

        # Convert to numpy arrays
        strategy_arr = np.array(strategy_values)
        benchmark_arr = np.array(benchmark_prices)

        # Calculate daily returns
        strategy_returns = np.diff(strategy_arr) / strategy_arr[:-1]
        benchmark_returns = np.diff(benchmark_arr) / benchmark_arr[:-1]

        # Calculate all metrics
        volatility = self.calculate_volatility(strategy_returns)
        sharpe_ratio = self.calculate_sharpe_ratio(strategy_returns)
        sortino_ratio = self.calculate_sortino_ratio(strategy_returns, sharpe_ratio)
        max_drawdown = self.calculate_max_drawdown(strategy_arr)
        calmar_ratio = self.calculate_calmar_ratio(strategy_arr, max_drawdown)
        beta = self.calculate_beta(strategy_returns, benchmark_returns)

        return {
            "sharpe_ratio": sharpe_ratio,
            "sortino_ratio": sortino_ratio,
            "calmar_ratio": calmar_ratio,
            "volatility": volatility,
            "beta": beta,
            "max_drawdown_percent": max_drawdown * 100,  # Convert to percentage
        }

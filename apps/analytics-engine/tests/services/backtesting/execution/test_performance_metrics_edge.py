"""Edge-case tests for PerformanceMetricsCalculator."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.performance_metrics import (
    PerformanceMetricsCalculator,
)


def test_calculate_beta_zero_benchmark_variance() -> None:
    calc = PerformanceMetricsCalculator()
    # Constant benchmark = zero variance
    strategy_values = [100.0, 110.0, 105.0, 115.0]
    benchmark_prices = [50.0, 50.0, 50.0, 50.0]
    result = calc.calculate_beta(np.array(strategy_values), np.array(benchmark_prices))
    assert result == 0.0

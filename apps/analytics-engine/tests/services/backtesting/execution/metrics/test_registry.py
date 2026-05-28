"""Tests for the extended-metrics registry + aggregator."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics import (
    EXTENDED_METRIC_KEYS,
    EXTENDED_RETURNS_METRICS,
    EXTENDED_VALUES_METRICS,
    ReturnsMetric,
    ValuesMetric,
    compute_extended_metrics,
)


class TestRegistryShape:
    def test_returns_metrics_satisfy_protocol(self) -> None:
        for metric in EXTENDED_RETURNS_METRICS:
            assert isinstance(metric, ReturnsMetric)

    def test_values_metrics_satisfy_protocol(self) -> None:
        for metric in EXTENDED_VALUES_METRICS:
            assert isinstance(metric, ValuesMetric)

    def test_keys_are_unique(self) -> None:
        all_keys = [
            m.key for m in (*EXTENDED_RETURNS_METRICS, *EXTENDED_VALUES_METRICS)
        ]
        assert len(all_keys) == len(set(all_keys))

    def test_keys_match_frozenset(self) -> None:
        all_keys = {
            m.key for m in (*EXTENDED_RETURNS_METRICS, *EXTENDED_VALUES_METRICS)
        }
        assert EXTENDED_METRIC_KEYS == frozenset(all_keys)


class TestComputeExtendedMetrics:
    def test_empty_series_returns_zero_for_every_key(self) -> None:
        result = compute_extended_metrics([])
        assert result == dict.fromkeys(EXTENDED_METRIC_KEYS, 0.0)

    def test_single_value_returns_zero_for_every_key(self) -> None:
        result = compute_extended_metrics([100.0])
        assert result == dict.fromkeys(EXTENDED_METRIC_KEYS, 0.0)

    def test_full_dict_keys_are_complete(self) -> None:
        # 30-day monotonic series with one drawdown
        rng = np.random.default_rng(seed=17)
        returns = rng.normal(0.001, 0.02, 250)
        values = (100.0 * np.cumprod(1.0 + returns)).tolist()
        result = compute_extended_metrics(values)
        assert set(result.keys()) == set(EXTENDED_METRIC_KEYS)
        for v in result.values():
            assert isinstance(v, float)

    def test_does_not_overlap_core_metric_keys(self) -> None:
        # Sanity: extended keys must not shadow the names emitted by
        # PerformanceMetricsCalculator.calculate_all_metrics.
        core_keys = {
            "sharpe_ratio",
            "sortino_ratio",
            "calmar_ratio",
            "volatility",
            "beta",
            "cvar_95",
            "ulcer_index",
            "alpha",
            "information_ratio",
            "max_drawdown_percent",
        }
        assert EXTENDED_METRIC_KEYS.isdisjoint(core_keys)

    def test_benchmark_argument_currently_ignored(self) -> None:
        values = [100.0, 105.0, 95.0, 110.0]
        with_bench = compute_extended_metrics(values, [100.0, 101.0, 102.0, 103.0])
        without_bench = compute_extended_metrics(values)
        assert with_bench == without_bench

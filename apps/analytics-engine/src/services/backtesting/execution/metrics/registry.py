"""Registry of extended metrics + aggregating helper.

These metrics are *additive* relative to the snapshot fixture: they are
exposed through :func:`compute_extended_metrics`, not folded into
``PerformanceMetricsCalculator.calculate_all_metrics()`` automatically.
That keeps the 500-day snapshot regression byte-stable while still letting
downstream callers (saved configs, attribution scripts) opt-in.
"""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics.base import (
    ReturnsMetric,
    ValuesMetric,
)
from src.services.backtesting.execution.metrics.distribution import (
    ExcessKurtosis,
    Skewness,
)
from src.services.backtesting.execution.metrics.omega import OmegaRatio
from src.services.backtesting.execution.metrics.pain_index import PainIndex
from src.services.backtesting.execution.metrics.recovery_time import (
    MaxDrawdownRecoveryTime,
)
from src.services.backtesting.execution.metrics.tail_ratio import TailRatio

EXTENDED_RETURNS_METRICS: tuple[ReturnsMetric, ...] = (
    OmegaRatio(),
    TailRatio(),
    Skewness(),
    ExcessKurtosis(),
)

EXTENDED_VALUES_METRICS: tuple[ValuesMetric, ...] = (
    PainIndex(),
    MaxDrawdownRecoveryTime(),
)

EXTENDED_METRIC_KEYS: frozenset[str] = frozenset(
    m.key for m in (*EXTENDED_RETURNS_METRICS, *EXTENDED_VALUES_METRICS)
)


def compute_extended_metrics(
    strategy_values: list[float] | np.ndarray,
    benchmark_prices: list[float] | np.ndarray | None = None,
) -> dict[str, float]:
    """Compute every registered extended metric.

    Mirrors the shape of ``PerformanceMetricsCalculator.calculate_all_metrics``
    so the two dicts can be merged at the call site if needed.

    Args:
        strategy_values: Daily portfolio values.
        benchmark_prices: Reserved for future relative metrics (currently
            unused by extended-metric registry; kept in signature for
            symmetry with the core calculator).

    Returns:
        ``{key: value}`` for every metric in ``EXTENDED_*_METRICS``. Each
        value is a finite ``float`` (``0.0`` when the input is too short or
        the metric is undefined).
    """
    del benchmark_prices  # Reserved for future relative extended metrics.

    values = np.asarray(strategy_values, dtype=float)
    if values.size < 2:
        return dict.fromkeys(EXTENDED_METRIC_KEYS, 0.0)

    returns = np.diff(values) / values[:-1]

    out: dict[str, float] = {}
    for metric in EXTENDED_RETURNS_METRICS:
        out[metric.key] = metric.compute(returns)
    for metric in EXTENDED_VALUES_METRICS:
        out[metric.key] = metric.compute(values)
    return out

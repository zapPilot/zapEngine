"""Pluggable performance-metric registry for backtesting.

Existing metrics in ``execution.performance_metrics.PerformanceMetricsCalculator``
remain the authoritative source for the snapshot regression gate. This package
provides a registry-based extension point for additional metrics
(Omega ratio, Tail ratio, Pain index, Recovery time, Skew/Kurt) without
disturbing the snapshot.
"""

from src.services.backtesting.execution.metrics.base import (
    ReturnsMetric,
    ValuesMetric,
)
from src.services.backtesting.execution.metrics.registry import (
    EXTENDED_METRIC_KEYS,
    EXTENDED_RETURNS_METRICS,
    EXTENDED_VALUES_METRICS,
    compute_extended_metrics,
)

__all__ = [
    "EXTENDED_METRIC_KEYS",
    "EXTENDED_RETURNS_METRICS",
    "EXTENDED_VALUES_METRICS",
    "ReturnsMetric",
    "ValuesMetric",
    "compute_extended_metrics",
]

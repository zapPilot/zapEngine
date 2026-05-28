"""Protocols for pluggable performance metrics.

Two flavours map to the two raw inputs a backtest already produces:

* :class:`ReturnsMetric` — operates on a 1D array of daily returns
* :class:`ValuesMetric`  — operates on a 1D array of daily portfolio values

Relative metrics (alpha, beta, information ratio) intentionally remain in the
core ``PerformanceMetricsCalculator`` for now; the registry only covers the
single-series metrics that have been requested as additions.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np


@runtime_checkable
class ReturnsMetric(Protocol):
    """Metric computed from a 1D array of daily returns."""

    @property
    def key(self) -> str:
        """Stable identifier emitted into the metric dict (snake_case)."""

    @property
    def description(self) -> str:
        """Short human-readable description for catalog / docs."""

    def compute(self, returns: np.ndarray) -> float:
        """Return the metric value. Must return ``0.0`` for insufficient data."""


@runtime_checkable
class ValuesMetric(Protocol):
    """Metric computed from a 1D array of daily portfolio values."""

    @property
    def key(self) -> str:
        """Stable identifier emitted into the metric dict (snake_case)."""

    @property
    def description(self) -> str:
        """Short human-readable description for catalog / docs."""

    def compute(self, values: np.ndarray) -> float:
        """Return the metric value. Must return ``0.0`` for insufficient data."""

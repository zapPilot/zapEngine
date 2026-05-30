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


class _BaseMetric(Protocol):
    """Shared ``key`` / ``description`` contract for all metric flavours."""

    @property
    def key(self) -> str: ...

    @property
    def description(self) -> str: ...


@runtime_checkable
class ReturnsMetric(_BaseMetric, Protocol):
    """Metric computed from a 1D array of daily returns."""

    def compute(self, returns: np.ndarray) -> float: ...


@runtime_checkable
class ValuesMetric(_BaseMetric, Protocol):
    """Metric computed from a 1D array of daily portfolio values."""

    def compute(self, values: np.ndarray) -> float: ...

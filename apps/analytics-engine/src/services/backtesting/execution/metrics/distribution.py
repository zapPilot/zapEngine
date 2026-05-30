"""Distribution-shape metrics: skewness and excess kurtosis.

Implemented directly in numpy to avoid pulling in scipy as a dependency.
Both use the biased (population-moment) estimator, matching the convention
used elsewhere in :mod:`performance_metrics` (which uses ``np.std`` /
``np.var`` defaults, i.e. ddof=0).

* **Skewness**:        ``E[(r-μ)^3] / σ^3``
* **Excess kurtosis**: ``E[(r-μ)^4] / σ^4 - 3``  (Fisher's definition;
  normal distribution → 0)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def _central_moment(returns: np.ndarray, order: int) -> float:
    centred = returns - float(np.mean(returns))
    return float(np.mean(centred**order))


def _standardised_moment(
    returns: np.ndarray, order: int, subtract: float = 0.0
) -> float:
    """Compute ``E[(r-μ)^n] / σ^n - subtract``, returning 0.0 for degenerate series."""
    if returns.size < 2 or float(np.ptp(returns)) == 0.0:
        return 0.0
    std = float(np.std(returns))
    if std <= 0.0:
        return 0.0
    return _central_moment(returns, order) / (std**order) - subtract


@dataclass(frozen=True)
class Skewness:
    """Skewness of the daily-return distribution (third standardised moment)."""

    key: str = "skewness"
    description: str = (
        "Skewness of daily returns. Positive = right tail heavier (occasional "
        "big wins); negative = left tail heavier (crash-prone)."
    )

    def compute(self, returns: np.ndarray) -> float:
        return _standardised_moment(returns, 3)


@dataclass(frozen=True)
class ExcessKurtosis:
    """Excess kurtosis (Fisher): normal distribution → 0, fat tails → positive."""

    key: str = "excess_kurtosis"
    description: str = (
        "Excess kurtosis (Fisher): fourth standardised moment minus 3. "
        "Positive = fat tails (more extreme moves than Gaussian)."
    )

    def compute(self, returns: np.ndarray) -> float:
        return _standardised_moment(returns, 4, subtract=3.0)

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


@dataclass(frozen=True)
class Skewness:
    """Skewness of the daily-return distribution (third standardised moment)."""

    key: str = "skewness"
    description: str = (
        "Skewness of daily returns. Positive = right tail heavier (occasional "
        "big wins); negative = left tail heavier (crash-prone)."
    )

    def compute(self, returns: np.ndarray) -> float:
        if returns.size < 2:
            return 0.0
        # Exact guard for constant series: ``np.std`` of ``np.full(...)`` is a
        # tiny FP-noise number, not zero, which would cause catastrophic
        # cancellation in the central-moment / std^3 ratio.
        if float(np.ptp(returns)) == 0.0:
            return 0.0

        std = float(np.std(returns))
        if std <= 0.0:
            return 0.0

        return _central_moment(returns, 3) / (std**3)


@dataclass(frozen=True)
class ExcessKurtosis:
    """Excess kurtosis (Fisher): normal distribution → 0, fat tails → positive."""

    key: str = "excess_kurtosis"
    description: str = (
        "Excess kurtosis (Fisher): fourth standardised moment minus 3. "
        "Positive = fat tails (more extreme moves than Gaussian)."
    )

    def compute(self, returns: np.ndarray) -> float:
        if returns.size < 2:
            return 0.0
        if float(np.ptp(returns)) == 0.0:
            return 0.0

        std = float(np.std(returns))
        if std <= 0.0:
            return 0.0

        return _central_moment(returns, 4) / (std**4) - 3.0

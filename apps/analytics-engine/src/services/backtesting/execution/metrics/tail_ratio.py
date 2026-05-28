"""Tail ratio.

``tail_ratio = |quantile(returns, upper)| / |quantile(returns, lower)|``

Measures the asymmetry between the right tail (big winning days) and the
left tail (big losing days). A tail ratio above 1.0 means winning tails
are larger than losing tails, which is a hallmark of positively-skewed
return streams.

Defaults to the 95th vs 5th percentile (``upper=0.95``, ``lower=0.05``).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class TailRatio:
    """Ratio of upper-tail magnitude to lower-tail magnitude."""

    upper: float = 0.95
    lower: float = 0.05
    key: str = "tail_ratio"
    description: str = (
        "Tail ratio: |quantile(95)| / |quantile(5)|. Asymmetry between big "
        "winning vs. big losing days. >1.0 indicates positive tail skew."
    )

    def compute(self, returns: np.ndarray) -> float:
        if returns.size < 1:
            return 0.0
        if not 0.0 < self.lower < self.upper < 1.0:
            return 0.0

        upper_q = float(np.quantile(returns, self.upper))
        lower_q = float(np.quantile(returns, self.lower))

        if lower_q == 0.0:
            return 0.0
        return abs(upper_q) / abs(lower_q)

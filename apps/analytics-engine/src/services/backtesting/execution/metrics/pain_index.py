"""Pain index.

``pain_index = mean(|drawdown_pct|)`` over the full series.

Complement to the existing Ulcer Index. Ulcer is the RMS of the drawdown
series (penalises depth quadratically); Pain index is the arithmetic mean
(linear). Together they characterise both the depth-bias and the average
of the drawdown experience.

Reference: Becker / Zephyr Associates pain ratio family.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class PainIndex:
    """Average magnitude of drawdowns expressed as a non-negative percentage."""

    key: str = "pain_index"
    description: str = (
        "Pain index: arithmetic mean of |drawdown%| over the full series. "
        "Linear complement to the (RMS-weighted) Ulcer Index."
    )

    def compute(self, values: np.ndarray) -> float:
        if values.size < 2:
            return 0.0

        running_max = np.maximum.accumulate(values)
        drawdown_pct = (
            np.divide(
                values - running_max,
                running_max,
                out=np.zeros_like(values, dtype=float),
                where=running_max != 0,
            )
            * 100.0
        )
        return float(np.mean(np.abs(drawdown_pct)))

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

from src.services.backtesting.execution import drawdown_fraction_series


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
        drawdown_pct = drawdown_fraction_series(values) * 100.0
        return float(np.mean(np.abs(drawdown_pct)))

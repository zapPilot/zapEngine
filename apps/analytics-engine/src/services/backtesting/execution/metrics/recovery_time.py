"""Maximum drawdown recovery time.

Days from the trough of the worst drawdown until the portfolio first regains
the prior peak. If recovery never happens within the series, the metric
returns the days from trough to the final bar (lower bound on recovery time).

Returns a ``float`` (number of bars) for uniformity with other metrics; cast
to ``int`` at the call site if integer days are required.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from src.services.backtesting.execution import drawdown_fraction_series


@dataclass(frozen=True)
class MaxDrawdownRecoveryTime:
    """Days from worst-drawdown trough back to the pre-drawdown peak."""

    key: str = "max_drawdown_recovery_days"
    description: str = (
        "Bars elapsed from the worst-drawdown trough until the portfolio "
        "first regains the prior peak (or end-of-series if never recovered)."
    )

    def compute(self, values: np.ndarray) -> float:
        if values.size < 2:
            return 0.0

        drawdown_pct = drawdown_fraction_series(values)

        # No drawdown at all.
        if float(np.min(drawdown_pct)) >= 0.0:
            return 0.0

        trough_idx = int(np.argmin(drawdown_pct))
        peak_value = float(np.max(values[: trough_idx + 1]))

        # First bar at or after the trough whose value >= the pre-drawdown peak.
        post_trough = values[trough_idx:]
        recovered = np.where(post_trough >= peak_value)[0]
        if recovered.size > 0:
            return float(recovered[0])

        # Never recovered within the window. Return remaining bars as a
        # lower bound on the true recovery time.
        return float(values.size - 1 - trough_idx)

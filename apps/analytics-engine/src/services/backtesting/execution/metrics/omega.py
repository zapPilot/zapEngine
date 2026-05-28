"""Omega ratio.

``omega(threshold) = sum(max(r - threshold, 0)) / sum(max(threshold - r, 0))``

The Omega ratio is the probability-weighted ratio of gains above the threshold
to losses below it. Unlike Sharpe, it uses the full return distribution
(no Gaussian assumption) and is sensitive to skew / fat tails.

Convention: a higher Omega is better. Omega above 1.0 means cumulative
excess gain exceeds cumulative excess loss at the chosen threshold.

References:
    Keating & Shadwick (2002), "A Universal Performance Measure".
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class OmegaRatio:
    """Omega ratio at a daily-return threshold (default 0.0)."""

    threshold: float = 0.0
    key: str = "omega_ratio"
    description: str = (
        "Omega ratio: ratio of expected gains above threshold to expected losses "
        "below threshold. Higher is better; >1.0 means net positive."
    )

    def compute(self, returns: np.ndarray) -> float:
        if returns.size < 1:
            return 0.0

        excess = returns - self.threshold
        gains = float(np.sum(np.maximum(excess, 0.0)))
        losses = float(np.sum(np.maximum(-excess, 0.0)))

        if losses <= 0.0:
            # Undefined when there are no losses below threshold. Match the
            # rest of the calculator (Sharpe, Calmar) by returning 0.0 — keeps
            # output JSON-safe and avoids divide-by-zero / inf propagation.
            return 0.0
        return gains / losses

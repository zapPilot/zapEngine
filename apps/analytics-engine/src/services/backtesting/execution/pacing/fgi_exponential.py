"""FGI exponential pacing policy.

This policy uses exponential (convex) mapping for FGI-based aggressiveness
and front-loaded geometric weights for the convergence ramp.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from src.services.backtesting.execution.pacing.base import (
    FgiPacingPolicyBase,
    RebalancePacingInputs,
    _normalized_fgi_distance_from_neutral,
)


@dataclass(frozen=True, slots=True)
class FgiExponentialPacingPolicy(FgiPacingPolicyBase):
    """FGI-only pacing with convex (exponential) aggressiveness and ramp weights.

    Convex mapping:
        t2 = (exp(k*t) - 1) / (exp(k) - 1)

    This maps the linear FGI distance t to a convex curve that stays low
    near neutral and rises sharply near extremes.

    Ramp weights:
        Front-loaded exponential weights so the strategy moves more aggressively
        early when FGI is far from neutral. Weight profile: w0 > w1 > ... > wN

    Attributes:
        min_steps: Minimum steps (at FGI extremes)
        max_steps: Maximum steps (at FGI neutral)
        min_interval_days: Minimum interval (at FGI extremes)
        max_interval_days: Maximum interval (at FGI neutral)
        k: Exponential curve steepness (higher = more convex)
        r_max: Maximum weight ratio for front-loading
    """

    k: float = 3.0
    r_max: float = 1.2
    name: str = "fgi_exponential"

    def _get_mapped_t(self, fgi_value: float | None) -> float:
        """Apply convex (exponential) mapping to FGI distance.

        Args:
            fgi_value: FGI value or None

        Returns:
            Convex-mapped t in [0, 1]
        """
        t = _normalized_fgi_distance_from_neutral(fgi_value)
        if self.k <= 0:
            return t
        denom = math.exp(self.k) - 1.0
        if denom <= 0:
            return t
        return (math.exp(self.k * t) - 1.0) / denom

    def step_weights(
        self, inputs: RebalancePacingInputs, step_count: int
    ) -> list[float]:
        """Generate front-loaded geometric weights.

        At neutral FGI: uniform weights (r=1.0)
        At extreme FGI: front-loaded weights (r up to r_max)

        The weight ratio r increases with FGI distance from neutral.
        Weights are computed as: w_i = r^(n-1-i) for i in [0, n-1]

        Args:
            inputs: Pacing inputs with fgi_value
            step_count: Number of steps

        Returns:
            List of front-loaded weights
        """
        n = max(1, int(step_count))
        t = _normalized_fgi_distance_from_neutral(inputs.fgi_value)

        r_max = max(1.0, float(self.r_max))
        r = 1.0 + t * (r_max - 1.0)

        # Front-loaded geometric weights: w0 > w1 > ... > w(n-1)
        return [r ** (n - 1 - i) for i in range(n)]

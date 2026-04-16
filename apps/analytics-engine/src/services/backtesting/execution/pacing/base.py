"""Base protocol and inputs for pacing policies.

This module defines the core abstractions that all pacing policies implement:
- RebalancePacingInputs: Context passed to policy methods
- RebalancePacingPolicy: Protocol defining the pacing interface
- Utility functions for FGI-based pacing calculations
- Base classes for common pacing logic
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True, slots=True)
class RebalancePacingInputs:
    """Inputs available to pacing policies.

    Attributes:
        current_regime: Current sentiment regime label (e.g. "fear", "neutral", "greed")
        fgi_value: Fear & Greed Index in [0, 100]. If None, policies should behave sensibly.
        price: Token price (optional; for future price-aware policies)
        market_cap: Token market cap (optional; for future market-cap-aware policies)
        realized_volatility: Annualized realized volatility (for volatility-scaled policies)

    Future extensibility:
        Additional market state inputs can be added here when a pacing policy
        needs more than regime, score, price, and volatility context.
    """

    current_regime: str
    fgi_value: float | None = None
    price: float | None = None
    market_cap: float | None = None
    realized_volatility: float | None = None
    decision_score: float | None = None
    decision_action: Literal["buy", "sell", "hold"] | None = None
    dma_distance: float | None = None
    fgi_slope: float | None = None
    buy_strength: float | None = None


# Utility functions for FGI-based pacing calculations
def _clamp_int(value: int, low: int, high: int) -> int:
    """Clamp integer value to range [low, high]."""
    return max(low, min(high, value))


def _clamp_float(value: float, low: float, high: float) -> float:
    """Clamp float value to range [low, high]."""
    return max(low, min(high, value))


def compute_dma_buy_strength(dma_distance: float | None) -> float:
    """Return buy-side pacing strength based on DMA deviation.

    Formula:
        buy_strength = clamp((-deviation - 0.10) / 0.25, 0, 1)

    This only applies to DMA buy paths. Sell paths ignore this strength.
    """
    if dma_distance is None:
        return 0.0
    deviation = float(dma_distance)
    return _clamp_float(((-deviation) - 0.10) / 0.25, 0.0, 1.0)


def apply_buy_strength(
    intensity: float,
    inputs: RebalancePacingInputs,
) -> float:
    """Dampen DMA buy-side pacing intensity with buy_strength.

    Non-buy paths are unchanged.
    """
    bounded = _clamp_float(float(intensity), 0.0, 1.0)
    if inputs.decision_action != "buy":
        return bounded
    strength = inputs.buy_strength
    if strength is None:
        return bounded
    return bounded * _clamp_float(float(strength), 0.0, 1.0)


def _interpolate_parameter(t: float, min_val: int, max_val: int) -> int:
    """Linearly interpolate from max to min as t goes from 0 to 1.

    When t=0 (neutral FGI), return max_val (slower).
    When t=1 (extreme FGI), return min_val (faster).
    """
    value = round(max_val - t * (max_val - min_val))
    return _clamp_int(int(value), min_val, max_val)


def _normalized_fgi_distance_from_neutral(fgi_value: float | None) -> float:
    """Return |fgi-50| normalized to [0, 1].

    Args:
        fgi_value: FGI in [0, 100] or None

    Returns:
        0.0 when FGI is 50 (neutral)
        1.0 when FGI is 0 or 100 (extremes)
    """
    fgi = 50.0 if fgi_value is None else float(fgi_value)
    fgi = max(0.0, min(100.0, fgi))
    return abs(fgi - 50.0) / 50.0


class RebalancePacingPolicy(Protocol):
    """Protocol for controlling rebalance timing and ramp shape.

    Pacing policies determine:
    1. interval_days: Minimum days between rebalance steps
    2. step_count: Number of steps to converge to target allocation
    3. step_weights: Per-step weights for shaping the convergence ramp

    The strategy allocates a fraction of remaining delta each step:
        fraction_i = weight_i / sum(weight_i..weight_end)

    Weight profiles:
    - Uniform weights → linear ramp in USD terms
    - Decreasing weights → front-loaded (aggressive early) ramp
    - Increasing weights → back-loaded (cautious early) ramp
    """

    @property
    def name(self) -> str:
        """Policy identifier (read-only)."""
        ...

    def interval_days(self, inputs: RebalancePacingInputs) -> int:
        """Return minimum days between rebalance steps.

        Args:
            inputs: Pacing inputs with regime, FGI, and volatility

        Returns:
            Number of days to wait between steps (minimum 1)
        """
        ...

    def step_count(self, inputs: RebalancePacingInputs) -> int:
        """Return number of steps to converge to the target allocation.

        Args:
            inputs: Pacing inputs with regime, FGI, and volatility

        Returns:
            Number of steps in the rebalance plan (minimum 1)
        """
        ...

    def step_weights(
        self, inputs: RebalancePacingInputs, step_count: int
    ) -> list[float]:
        """Return per-step weights used to shape the convergence ramp.

        Args:
            inputs: Pacing inputs with regime, FGI, and volatility
            step_count: Number of steps in the plan

        Returns:
            List of weights, one per step. All weights should be positive.
        """
        ...


@dataclass(frozen=True, slots=True)
class FgiPacingPolicyBase:
    """Base class for FGI-based pacing policies.

    Provides common logic for interval_days and step_count based on
    a mapped FGI distance value. Subclasses implement _get_mapped_t
    to define their specific mapping function (linear, exponential, etc.).

    Attributes:
        min_steps: Minimum steps (at FGI extremes)
        max_steps: Maximum steps (at FGI neutral)
        min_interval_days: Minimum interval (at FGI extremes)
        max_interval_days: Maximum interval (at FGI neutral)
    """

    min_steps: int = 5
    max_steps: int = 15
    min_interval_days: int = 2
    max_interval_days: int = 4

    def _get_mapped_t(self, fgi_value: float | None) -> float:
        """Map FGI value to [0, 1] using policy-specific transformation.

        Subclasses must implement this to define their mapping function.

        Args:
            fgi_value: FGI in [0, 100] or None

        Returns:
            Mapped value in [0, 1]
        """
        raise NotImplementedError

    def interval_days(self, inputs: RebalancePacingInputs) -> int:
        """Calculate interval based on mapped FGI distance.

        Args:
            inputs: Pacing inputs with fgi_value

        Returns:
            Interpolated interval days
        """
        t = apply_buy_strength(self._get_mapped_t(inputs.fgi_value), inputs)
        return _interpolate_parameter(t, self.min_interval_days, self.max_interval_days)

    def step_count(self, inputs: RebalancePacingInputs) -> int:
        """Calculate step count based on mapped FGI distance.

        Args:
            inputs: Pacing inputs with fgi_value

        Returns:
            Interpolated step count
        """
        t = apply_buy_strength(self._get_mapped_t(inputs.fgi_value), inputs)
        return _interpolate_parameter(t, self.min_steps, self.max_steps)

    def step_weights(
        self, inputs: RebalancePacingInputs, step_count: int
    ) -> list[float]:
        """Return uniform weights (linear ramp).

        Subclasses can override to provide custom weight profiles.

        Args:
            inputs: Pacing inputs (unused in base implementation)
            step_count: Number of steps

        Returns:
            List of 1.0 weights
        """
        return [1.0] * max(1, int(step_count))

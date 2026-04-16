"""Configuration for the DMA-gated FGI runtime with regime/ATH gating."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DmaGatedFgiConfig:
    """Cooldown configuration for DMA-gated FGI behavior.

    Attributes:
        cross_cooldown_days: Days to ignore the opposite DMA side after a cross.
        cross_on_touch: Treat touching DMA as a cross event.
    """

    cross_cooldown_days: int = 30
    cross_on_touch: bool = True

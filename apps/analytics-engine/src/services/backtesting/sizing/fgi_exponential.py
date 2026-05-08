"""FGI-adaptive exponential sizing strategy."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot


def fgi_exponential_intensity(fgi_value: float | None, *, k: float = 3.0) -> float:
    """Return convex FGI distance from neutral in [0, 1]."""
    fgi = 50.0 if fgi_value is None else float(fgi_value)
    fgi = max(0.0, min(100.0, fgi))
    t = abs(fgi - 50.0) / 50.0
    if k <= 0:
        return t
    denom = math.exp(k) - 1.0
    if denom <= 0:
        return t
    return (math.exp(k * t) - 1.0) / denom


@dataclass(frozen=True, slots=True)
class FgiExponentialSizing:
    """Scale rule steps up as FGI moves further from neutral."""

    k: float = 3.0
    max_multiplier: float = 1.5
    name: str = "fgi_exponential"

    def adjust_step(
        self,
        base_step: float,
        *,
        snapshot: PortfolioSnapshot,
        asset: str,
    ) -> float:
        from src.services.backtesting.portfolio_rules.base import (
            current_fgi_value_for_symbol,
        )

        base = max(0.0, float(base_step))
        multiplier_cap = max(1.0, float(self.max_multiplier))
        intensity = fgi_exponential_intensity(
            current_fgi_value_for_symbol(snapshot, asset),
            k=self.k,
        )
        return base * (1.0 + (intensity * (multiplier_cap - 1.0)))


__all__ = ["FgiExponentialSizing", "fgi_exponential_intensity"]

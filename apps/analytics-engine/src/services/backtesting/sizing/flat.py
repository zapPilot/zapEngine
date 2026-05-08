"""Flat sizing strategy."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot


@dataclass(frozen=True, slots=True)
class FlatSizing:
    """Sizing strategy that preserves the configured base step."""

    name: str = "flat"

    def adjust_step(
        self,
        base_step: float,
        *,
        snapshot: PortfolioSnapshot,
        asset: str,
    ) -> float:
        del snapshot, asset
        return max(0.0, float(base_step))


__all__ = ["FlatSizing"]

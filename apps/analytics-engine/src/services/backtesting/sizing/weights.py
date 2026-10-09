"""Sizing strategies that read how much of the portfolio an asset already is."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.services.backtesting.portfolio_rules.base import allocation_key_for_symbol

if TYPE_CHECKING:
    from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot


def _weight(snapshot: PortfolioSnapshot, asset: str) -> float:
    key = allocation_key_for_symbol(asset)
    return max(0.0, float(snapshot.current_asset_allocation.get(key, 0.0)))


@dataclass(frozen=True, slots=True)
class RelativeSizing:
    """A sale is a share of the position, and it never cuts into a core.

    The base step is the share of the asset's own weight to sell, so a 25% step
    sells a quarter of whatever is held. Whatever the share, the position is not
    taken below ``floor_weight`` of the portfolio.
    """

    floor_weight: float
    name: str = "relative"

    def adjust_step(
        self,
        base_step: float,
        *,
        snapshot: PortfolioSnapshot,
        asset: str,
    ) -> float:
        weight = _weight(snapshot, asset)
        return min(
            max(0.0, float(base_step)) * weight, max(0.0, weight - self.floor_weight)
        )


@dataclass(frozen=True, slots=True)
class HeadroomSizing:
    """A purchase never takes an asset above ``max_weight`` of the portfolio."""

    max_weight: float
    name: str = "headroom"

    def adjust_step(
        self,
        base_step: float,
        *,
        snapshot: PortfolioSnapshot,
        asset: str,
    ) -> float:
        headroom = max(0.0, self.max_weight - _weight(snapshot, asset))
        return min(max(0.0, float(base_step)), headroom)


__all__ = ["HeadroomSizing", "RelativeSizing"]

"""Sizing strategy contracts."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot


class SizingStrategy(Protocol):
    @property
    def name(self) -> str: ...

    def adjust_step(
        self,
        base_step: float,
        *,
        snapshot: PortfolioSnapshot,
        asset: str,
    ) -> float: ...


__all__ = ["SizingStrategy"]

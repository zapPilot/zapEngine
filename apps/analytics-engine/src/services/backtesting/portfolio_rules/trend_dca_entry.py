"""Enter an asset that is above its DMA in steps, out of stable."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    PortfolioSnapshot,
    above_dma_symbols,
    allocation_key_for_symbol,
    reentry_blocked,
)
from src.services.backtesting.sizing.base import SizingStrategy
from src.services.backtesting.sizing.weights import HeadroomSizing

_EPSILON = 1e-9


@dataclass(frozen=True, kw_only=True)
class TrendDcaEntryRule(DcaBuyRuleBase):
    """Buys ``buy_step`` of the portfolio into each asset the trend favors.

    An asset qualifies while it is above its DMA, the signal's cross cooldown
    does not bar it, and it holds less than ``max_weight`` of the portfolio. The
    cash comes from stable, and a purchase never takes the asset above
    ``max_weight``.
    """

    name: str
    priority: int
    cooldown_days: int
    buy_step: float
    max_weight: float
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Buy into assets above their DMA in steps until they reach their weight cap."
    )
    allocation_name: str = "portfolio_trend_dca_entry"
    reason: str = "portfolio_trend_dca_entry"
    sizing: SizingStrategy = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "sizing", HeadroomSizing(max_weight=self.max_weight))

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        # With no stable there is nothing to buy with, and a rule that matched
        # anyway would shadow every rule below it for nothing.
        if float(snapshot.current_asset_allocation.get("stable", 0.0)) <= _EPSILON:
            return []
        return [
            symbol
            for symbol in above_dma_symbols(snapshot)
            if not reentry_blocked(snapshot, symbol)
            and self._has_headroom(snapshot, symbol)
        ]

    def _has_headroom(self, snapshot: PortfolioSnapshot, symbol: str) -> bool:
        key = allocation_key_for_symbol(symbol)
        weight = float(snapshot.current_asset_allocation.get(key, 0.0))
        return weight < self.max_weight - _EPSILON


__all__ = ["TrendDcaEntryRule"]

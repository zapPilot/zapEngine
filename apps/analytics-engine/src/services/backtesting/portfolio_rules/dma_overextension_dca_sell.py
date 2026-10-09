"""Portfolio rule 30: DCA sell assets overextended above DMA."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaSellRuleBase,
    FgiRegime,
    PortfolioSnapshot,
    ProceedsRouting,
    ProceedsRoutingMixin,
    above_dma_symbols,
    current_fgi_regime_for_symbol,
    normalize_symbol,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True, kw_only=True)
class DmaOverextensionDcaSellRule(ProceedsRoutingMixin, DcaSellRuleBase):
    name: str
    priority: int
    cooldown_days: int
    sell_step: float
    proceeds: ProceedsRouting
    # How far above its DMA each asset may run before it is sold into.
    dma_overextension_thresholds: dict[str, float]
    # The threshold shrinks in greed, so the sale starts earlier at the top.
    fgi_threshold_multipliers: dict[FgiRegime, float]
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets that are above DMA and beyond asset-specific extension thresholds."
    allocation_name: str = "portfolio_dma_overextension_dca_sell"
    reason: str = "portfolio_dma_overextension_dca_sell"
    sizing: SizingStrategy = field(default_factory=FlatSizing)

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in above_dma_symbols(snapshot)
            if snapshot.assets[symbol].dma_distance
            > _threshold(symbol, rule=self, snapshot=snapshot)
        ]


def _threshold(
    symbol: str,
    *,
    rule: DmaOverextensionDcaSellRule,
    snapshot: PortfolioSnapshot,
) -> float:
    base = float(rule.dma_overextension_thresholds[normalize_symbol(symbol)])
    regime = current_fgi_regime_for_symbol(snapshot, symbol)
    if regime is None:
        return base
    return base * rule.fgi_threshold_multipliers[regime]


__all__ = ["DmaOverextensionDcaSellRule"]

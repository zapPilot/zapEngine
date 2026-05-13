"""Portfolio rule 30: DCA sell assets overextended above DMA."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaSellRuleBase,
    PortfolioSnapshot,
    add_split_proceeds,
    normalize_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True)
class DmaOverextensionDcaSellRule(DcaSellRuleBase):
    name: str = "dma_overextension_dca_sell"
    priority: int = 30
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets that are above DMA and beyond asset-specific extension thresholds."
    allocation_name: str = "portfolio_dma_overextension_dca_sell"
    reason: str = "portfolio_dma_overextension_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    spy_share: float = 0.5
    default_dma_overextension_threshold: float = 0.30
    dma_overextension_thresholds: dict[str, float] = field(
        default_factory=lambda: {"BTC": 0.20, "ETH": 0.50, "SPY": 0.10}
    )

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in symbols_for_snapshot(snapshot)
            if snapshot.assets[symbol].zone == "above"
            and snapshot.assets[symbol].dma_distance > _threshold(symbol, rule=self)
        ]

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(
            target,
            sold,
            spy_share=self.spy_share,
        )


def _threshold(symbol: str, *, rule: DmaOverextensionDcaSellRule) -> float:
    return float(
        rule.dma_overextension_thresholds.get(
            normalize_symbol(symbol),
            rule.default_dma_overextension_threshold,
        )
    )


__all__ = ["DmaOverextensionDcaSellRule"]

"""Portfolio rule 30: DCA sell assets overextended above DMA."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_split_proceeds,
    build_dca_sell_intent,
    normalize_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True)
class DmaOverextensionDcaSellRule:
    name: str = "dma_overextension_dca_sell"
    priority: int = 30
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets that are above DMA and beyond asset-specific extension thresholds."
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    spy_share: float = 0.5
    default_dma_overextension_threshold: float = 0.30
    dma_overextension_thresholds: dict[str, float] = field(
        default_factory=lambda: {"BTC": 0.20, "ETH": 0.50, "SPY": 0.10}
    )

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(_matching_symbols(snapshot, rule=self))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = _matching_symbols(snapshot, rule=self)
        return build_dca_sell_intent(
            snapshot=snapshot,
            matching_symbols=matching_symbols,
            sizing=self.sizing,
            sell_step=self.sell_step,
            proceeds_handler=lambda target, sold: add_split_proceeds(
                target,
                sold,
                spy_share=self.spy_share,
            ),
            allocation_name="portfolio_dma_overextension_dca_sell",
            reason="portfolio_dma_overextension_dca_sell",
            rule_group=self.rule_group,
            emit_signals_consulted=config.emit_signals_consulted,
        )


def _matching_symbols(
    snapshot: PortfolioSnapshot,
    *,
    rule: DmaOverextensionDcaSellRule,
) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "above"
        and snapshot.assets[symbol].dma_distance > _threshold(symbol, rule=rule)
    ]


def _threshold(symbol: str, *, rule: DmaOverextensionDcaSellRule) -> float:
    return float(
        rule.dma_overextension_thresholds.get(
            normalize_symbol(symbol),
            rule.default_dma_overextension_threshold,
        )
    )


__all__ = ["DmaOverextensionDcaSellRule"]

"""Portfolio rule 30: DCA sell assets overextended above DMA."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_split_proceeds,
    allocation_key_for_symbol,
    combine_sizing_meta,
    current_target,
    normalize_symbol,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    sizing_meta_for_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing
from src.services.backtesting.target_allocation import normalize_target_allocation

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
        target = current_target(snapshot)
        sizing_meta_by_symbol: dict[str, dict[str, object]] = {}
        for symbol in matching_symbols:
            sell_step = max(
                0.0,
                float(
                    self.sizing.adjust_step(
                        self.sell_step,
                        snapshot=snapshot,
                        asset=symbol,
                    )
                ),
            )
            sizing_meta_by_symbol[symbol] = sizing_meta_for_symbol(
                sizing=self.sizing,
                base_step=self.sell_step,
                adjusted_step=sell_step,
                snapshot=snapshot,
                asset=symbol,
            )
            key = allocation_key_for_symbol(symbol)
            sold = min(sell_step, max(0.0, float(target.get(key, 0.0))))
            target[key] = max(0.0, float(target.get(key, 0.0)) - sold)
            add_split_proceeds(
                target,
                sold,
                spy_share=self.spy_share,
            )
        return portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_dma_overextension_dca_sell",
            reason="portfolio_dma_overextension_dca_sell",
            rule_group=self.rule_group,
            assets=matching_symbols,
            signals_consulted=signals_consulted_for_symbols(
                snapshot,
                tuple(matching_symbols),
            )
            if config.emit_signals_consulted
            else None,
            sizing_meta=combine_sizing_meta(sizing_meta_by_symbol),
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

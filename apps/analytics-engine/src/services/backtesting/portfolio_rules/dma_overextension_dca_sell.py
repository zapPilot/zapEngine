"""Portfolio rule 30: DCA sell assets overextended above DMA."""

from __future__ import annotations

from dataclasses import dataclass

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
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class DmaOverextensionDcaSellRule:
    name: str = "dma_overextension_dca_sell"
    priority: int = 30
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets that are above DMA and beyond asset-specific extension thresholds."

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        return bool(_matching_symbols(snapshot, config=config))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = _matching_symbols(snapshot, config=config)
        target = current_target(snapshot)
        sizing_meta_by_symbol: dict[str, dict[str, object]] = {}
        for symbol in matching_symbols:
            sell_step = max(
                0.0,
                float(
                    config.overextension_sell_sizing.adjust_step(
                        config.overextension_sell_step,
                        snapshot=snapshot,
                        asset=symbol,
                    )
                ),
            )
            sizing_meta_by_symbol[symbol] = sizing_meta_for_symbol(
                sizing=config.overextension_sell_sizing,
                base_step=config.overextension_sell_step,
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
                spy_share=config.overextension_sell_spy_share,
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
    config: PortfolioRuleConfig,
) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "above"
        and snapshot.assets[symbol].dma_distance > _threshold(symbol, config=config)
    ]


def _threshold(symbol: str, *, config: PortfolioRuleConfig) -> float:
    return float(
        config.dma_overextension_thresholds.get(
            normalize_symbol(symbol),
            config.default_dma_overextension_threshold,
        )
    )


__all__ = ["DmaOverextensionDcaSellRule"]

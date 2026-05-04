"""Portfolio rule 2: DCA buy below-DMA assets during extreme fear."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    allocation_key_for_symbol,
    current_fgi_regime_for_symbol,
    current_target,
    portfolio_target_intent,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class ExtremeFearDcaBuyRule:
    name: str = "extreme_fear_dca_buy"
    priority: int = 30
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "DCA buy below-DMA assets when their relevant FGI is extreme fear."
    )

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(_matching_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = _matching_symbols(snapshot)
        target = current_target(snapshot)
        stable_available = max(0.0, float(target.get("stable", 0.0)))
        if matching_symbols and stable_available > 0.0:
            per_asset_buy = min(
                max(0.0, float(config.extreme_fear_buy_step)),
                stable_available / len(matching_symbols),
            )
            for symbol in matching_symbols:
                key = allocation_key_for_symbol(symbol)
                target[key] = max(0.0, float(target.get(key, 0.0))) + per_asset_buy
            target["stable"] = max(
                0.0,
                stable_available - (per_asset_buy * len(matching_symbols)),
            )
        return portfolio_target_intent(
            action="buy",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_extreme_fear_dca_buy",
            reason="portfolio_extreme_fear_dca_buy",
            rule_group=self.rule_group,
            assets=matching_symbols,
        )


def _matching_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "below"
        and current_fgi_regime_for_symbol(snapshot, symbol) == "extreme_fear"
    ]


__all__ = ["ExtremeFearDcaBuyRule"]

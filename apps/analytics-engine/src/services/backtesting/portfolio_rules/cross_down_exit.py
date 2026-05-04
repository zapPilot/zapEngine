"""Portfolio rule 1: exit assets that cross down through DMA."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_stable,
    allocation_key_for_symbol,
    current_target,
    portfolio_target_intent,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class CrossDownExitRule:
    name: str = "cross_down_exit"
    priority: int = 10
    rule_group: RuleGroup = "cross"
    description: str = "Exit any asset that crosses below DMA; proceeds remain stable."

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(_cross_down_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del config
        matching_symbols = _cross_down_symbols(snapshot)
        target = current_target(snapshot)
        for symbol in matching_symbols:
            key = allocation_key_for_symbol(symbol)
            released = max(0.0, float(target.get(key, 0.0)))
            target[key] = 0.0
            add_stable(target, released)
        return portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_cross_down_exit",
            reason="portfolio_cross_down_exit",
            rule_group=self.rule_group,
            assets=matching_symbols,
            immediate=True,
        )


def _cross_down_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].cross_event == "cross_down"
    ]


__all__ = ["CrossDownExitRule"]

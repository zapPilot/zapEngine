"""Portfolio rule 5: equal-weight eligible assets on DMA cross-up."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    ALLOCATION_KEY_BY_SYMBOL,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    allocation_key_for_symbol,
    portfolio_target_intent,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class CrossUpEqualWeightRule:
    name: str = "cross_up_equal_weight"
    priority: int = 20
    rule_group: RuleGroup = "cross"
    description: str = "Equal-weight all currently above-DMA risk assets on a cross-up."

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return _has_cross_up(snapshot) and bool(_eligible_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del config
        eligible_symbols = _eligible_symbols(snapshot)
        per_asset = 0.0 if not eligible_symbols else 1.0 / len(eligible_symbols)
        target = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
        for symbol in eligible_symbols:
            target[allocation_key_for_symbol(symbol)] = per_asset
        return portfolio_target_intent(
            action="buy",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_cross_up_equal_weight",
            reason="portfolio_cross_up_equal_weight",
            rule_group=self.rule_group,
            assets=eligible_symbols,
            immediate=True,
        )


def _has_cross_up(snapshot: PortfolioSnapshot) -> bool:
    return any(
        snapshot.assets[symbol].actionable_cross_event == "cross_up"
        for symbol in symbols_for_snapshot(snapshot)
    )


def _eligible_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "above"
        and symbol in ALLOCATION_KEY_BY_SYMBOL
    ]


__all__ = ["CrossUpEqualWeightRule"]

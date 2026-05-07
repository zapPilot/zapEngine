"""Portfolio rule 1: exit assets that cross down through DMA."""

from __future__ import annotations

from dataclasses import dataclass, replace

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

_ASSET_CLASS_PEERS: dict[str, tuple[str, ...]] = {
    "BTC": ("BTC", "ETH"),
    "ETH": ("BTC", "ETH"),
    "SPY": ("SPY",),
}


@dataclass(frozen=True)
class CrossDownExitRule:
    name: str = "cross_down_exit"
    priority: int = 1
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
        exit_symbols = _exit_symbols_for_cross_down(matching_symbols)
        target = current_target(snapshot)
        liquidated_symbols: list[str] = []
        for symbol in exit_symbols:
            key = allocation_key_for_symbol(symbol)
            released = max(0.0, float(target.get(key, 0.0)))
            target[key] = 0.0
            add_stable(target, released)
            if released > 0.0:
                liquidated_symbols.append(symbol)
        intent = portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_cross_down_exit",
            reason="portfolio_cross_down_exit",
            rule_group=self.rule_group,
            assets=liquidated_symbols,
            immediate=True,
        )
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["portfolio_rule_trigger_assets"] = matching_symbols
        return replace(intent, diagnostics=diagnostics)


def _cross_down_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].actionable_cross_event == "cross_down"
    ]


def _exit_symbols_for_cross_down(symbols: list[str]) -> list[str]:
    exit_symbols: list[str] = []
    for symbol in symbols:
        for peer in _ASSET_CLASS_PEERS.get(symbol, (symbol,)):
            if peer not in exit_symbols:
                exit_symbols.append(peer)
    return exit_symbols


__all__ = ["CrossDownExitRule"]

"""Portfolio rule 10: exit assets that cross down through DMA."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_stable,
    allocation_key_for_symbol,
    cross_down_cooldown_days_for,
    current_target,
    portfolio_target_intent,
    signals_consulted_for_symbols,
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
    priority: int = 10
    cooldown_days: int = 30
    rule_group: RuleGroup = "cross"
    description: str = "Exit any asset that crosses below DMA; proceeds remain stable."
    cross_down_cooldown_days_per_symbol: dict[str, int] = field(
        default_factory=lambda: {"BTC": 30, "ETH": 30, "SPY": 14}
    )
    default_cross_down_cooldown_days: int = 30

    def cooldown_days_for(self, symbol: str) -> int:
        return cross_down_cooldown_days_for(
            symbol,
            per_symbol=self.cross_down_cooldown_days_per_symbol,
            default=self.default_cross_down_cooldown_days,
        )

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
            signals_consulted=signals_consulted_for_symbols(
                snapshot,
                tuple(matching_symbols),
            )
            if config.emit_signals_consulted
            else None,
        )
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["portfolio_rule_trigger_assets"] = matching_symbols
        diagnostics["portfolio_rule_exit_assets"] = exit_symbols
        diagnostics["portfolio_rule_cooldown_assets"] = exit_symbols
        diagnostics["portfolio_rule_forced_cross_events"] = dict.fromkeys(
            exit_symbols,
            "cross_down",
        )
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

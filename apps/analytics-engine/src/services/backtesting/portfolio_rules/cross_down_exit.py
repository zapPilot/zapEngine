"""Portfolio rule 10: exit assets that cross down through DMA."""

from __future__ import annotations

from dataclasses import dataclass, replace

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    ProceedsRouting,
    allocation_key_for_symbol,
    current_target,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True, kw_only=True)
class CrossDownExitRule:
    name: str
    priority: int
    cooldown_days: int
    # Assets that exit together when any one of them crosses down.
    peer_groups: tuple[tuple[str, ...], ...]
    proceeds: ProceedsRouting
    # One cooldown per asset that crossed, instead of one for the whole rule: an
    # exit then never waits for another asset's cooldown.
    cooldown_keyed_by_trigger_symbol: bool
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
        matching_symbols = _cross_down_symbols(snapshot)
        exit_symbols = _exit_symbols_for_cross_down(matching_symbols, rule=self)
        target = current_target(snapshot)
        liquidated_symbols: list[str] = []
        for symbol in exit_symbols:
            key = allocation_key_for_symbol(symbol)
            released = max(0.0, float(target.get(key, 0.0)))
            target[key] = 0.0
            self.proceeds.apply(target, released)
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
        diagnostics[DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS] = matching_symbols
        diagnostics["portfolio_rule_exit_assets"] = exit_symbols
        diagnostics["portfolio_rule_cooldown_assets"] = exit_symbols
        diagnostics["portfolio_rule_forced_cross_events"] = dict.fromkeys(
            exit_symbols,
            "cross_down",
        )
        return replace(intent, diagnostics=diagnostics)

    def trigger_symbols_for_cooldown(self, snapshot: PortfolioSnapshot) -> list[str]:
        return _cross_down_symbols(snapshot)


def _cross_down_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].actionable_cross_event == "cross_down"
    ]


def _exit_symbols_for_cross_down(
    symbols: list[str],
    *,
    rule: CrossDownExitRule,
) -> list[str]:
    exit_symbols: list[str] = []
    for symbol in symbols:
        for peer in _peers_of(symbol, rule=rule):
            if peer not in exit_symbols:
                exit_symbols.append(peer)
    return exit_symbols


def _peers_of(symbol: str, *, rule: CrossDownExitRule) -> tuple[str, ...]:
    for group in rule.peer_groups:
        if symbol in group:
            return group
    return (symbol,)


__all__ = ["CrossDownExitRule"]

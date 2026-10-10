"""Portfolio rule 20: equal-weight eligible assets on DMA cross-up."""

from __future__ import annotations

from dataclasses import dataclass, replace

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    ALLOCATION_KEY_BY_SYMBOL,
    DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    portfolio_target_intent,
    reentry_blocked,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True, kw_only=True)
class CrossUpEqualWeightRule:
    name: str
    priority: int
    cooldown_days: int
    # False re-weights the whole portfolio equally across the assets above their
    # DMA; True keeps every holding and splits only the stable between them.
    deploy_stable_only: bool
    # What the kind means (the cooldown follows the asset that crossed), not a
    # knob a spec states.
    cooldown_keyed_by_trigger_symbol: bool = True
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
        eligible_symbols = _eligible_symbols(snapshot)
        trigger_symbols = [
            symbol
            for symbol in eligible_symbols
            if _is_cross_up_signal(snapshot, symbol)
        ]
        target = (
            _stable_deployed(snapshot, eligible_symbols)
            if self.deploy_stable_only
            else _equal_weights(eligible_symbols)
        )
        intent = portfolio_target_intent(
            action="buy",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_cross_up_equal_weight",
            reason="portfolio_cross_up_equal_weight",
            rule_group=self.rule_group,
            assets=eligible_symbols,
            immediate=True,
            signals_consulted=signals_consulted_for_symbols(
                snapshot,
                tuple(eligible_symbols),
            )
            if config.emit_signals_consulted
            else None,
        )
        diagnostics = dict(intent.diagnostics or {})
        diagnostics[DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS] = trigger_symbols
        return replace(intent, diagnostics=diagnostics)

    def trigger_symbols_for_cooldown(
        self,
        snapshot: PortfolioSnapshot,
    ) -> list[str]:
        return [
            symbol
            for symbol in symbols_for_snapshot(snapshot)
            if _is_cross_up_signal(snapshot, symbol)
            and snapshot.assets[symbol].zone == "above"
        ]


def _equal_weights(symbols: list[str]) -> dict[str, float]:
    target = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    for symbol in symbols:
        target[ALLOCATION_KEY_BY_SYMBOL[symbol]] = 1.0 / len(symbols)
    return target


def _stable_deployed(
    snapshot: PortfolioSnapshot, symbols: list[str]
) -> dict[str, float]:
    """The current holdings, with the stable split equally across ``symbols``."""
    target = current_target(snapshot)
    stable = max(0.0, float(target["stable"]))
    target["stable"] = 0.0
    for symbol in symbols:
        key = ALLOCATION_KEY_BY_SYMBOL[symbol]
        target[key] = max(0.0, float(target[key])) + stable / len(symbols)
    return target


def _has_cross_up(snapshot: PortfolioSnapshot) -> bool:
    return any(
        _is_cross_up_signal(snapshot, symbol) for symbol in _eligible_symbols(snapshot)
    )


def _eligible_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "above"
        and symbol in ALLOCATION_KEY_BY_SYMBOL
        and (
            _is_cross_up_signal(snapshot, symbol)
            or not reentry_blocked(snapshot, symbol)
        )
    ]


def _is_cross_up_signal(snapshot: PortfolioSnapshot, symbol: str) -> bool:
    return snapshot.assets[symbol].actionable_cross_event == "cross_up"


__all__ = ["CrossUpEqualWeightRule"]

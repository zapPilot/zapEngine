"""Portfolio rule 20: equal-weight eligible assets on DMA cross-up."""

from __future__ import annotations

from dataclasses import dataclass, replace

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    ALLOCATION_KEY_BY_SYMBOL,
    DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    allocation_key_for_symbol,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class CrossUpEqualWeightRule:
    name: str = "cross_up_equal_weight"
    priority: int = 20
    cooldown_days: int = 30
    cooldown_keyed_by_trigger_symbol: bool = True
    rule_group: RuleGroup = "cross"
    description: str = "Equal-weight all currently above-DMA risk assets on a cross-up."
    applicable_symbols: frozenset[str] | None = None
    fgi_slope_min: float | None = None
    drawdown_amplifier_alpha: float | None = None
    drawdown_amplifier_threshold: float = 0.20

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return _has_cross_up(snapshot, rule=self) and bool(
            _eligible_symbols(snapshot, rule=self)
        )

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        eligible_symbols = _eligible_symbols(snapshot, rule=self)
        trigger_symbols = [
            symbol
            for symbol in eligible_symbols
            if _is_cross_up_signal(snapshot, symbol, rule=self)
        ]
        target = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
        target.update(
            _target_weights_for_eligible_symbols(snapshot, eligible_symbols, self)
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
            if _is_cross_up_signal(snapshot, symbol, rule=self)
            and snapshot.assets[symbol].zone == "above"
        ]


def _has_cross_up(
    snapshot: PortfolioSnapshot,
    *,
    rule: CrossUpEqualWeightRule,
) -> bool:
    return any(
        _is_cross_up_signal(snapshot, symbol, rule=rule)
        for symbol in _eligible_symbols(snapshot, rule=rule)
    )


def _eligible_symbols(
    snapshot: PortfolioSnapshot,
    *,
    rule: CrossUpEqualWeightRule,
) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "above"
        and (rule.applicable_symbols is None or symbol in rule.applicable_symbols)
        and symbol in ALLOCATION_KEY_BY_SYMBOL
        and (
            _is_cross_up_signal(snapshot, symbol, rule=rule)
            or not _is_reentry_cooldown_active(snapshot, symbol)
        )
    ]


def _is_cross_up_signal(
    snapshot: PortfolioSnapshot,
    symbol: str,
    *,
    rule: CrossUpEqualWeightRule,
) -> bool:
    return snapshot.assets[
        symbol
    ].actionable_cross_event == "cross_up" and _passes_fgi_slope_filter(
        snapshot, symbol, rule=rule
    )


def _passes_fgi_slope_filter(
    snapshot: PortfolioSnapshot,
    symbol: str,
    *,
    rule: CrossUpEqualWeightRule,
) -> bool:
    if rule.fgi_slope_min is None:
        return True
    return snapshot.assets[symbol].fgi_slope >= rule.fgi_slope_min


def _target_weights_for_eligible_symbols(
    snapshot: PortfolioSnapshot,
    eligible_symbols: list[str],
    rule: CrossUpEqualWeightRule,
) -> dict[str, float]:
    if not eligible_symbols:
        return {}
    if rule.drawdown_amplifier_alpha is None:
        per_asset = 1.0 / len(eligible_symbols)
        return {
            allocation_key_for_symbol(symbol): per_asset for symbol in eligible_symbols
        }

    raw_weights = {
        symbol: _drawdown_amplified_weight(snapshot, symbol, rule=rule)
        for symbol in eligible_symbols
    }
    total = sum(raw_weights.values())
    return {
        allocation_key_for_symbol(symbol): weight / total
        for symbol, weight in raw_weights.items()
    }


def _drawdown_amplified_weight(
    snapshot: PortfolioSnapshot,
    symbol: str,
    *,
    rule: CrossUpEqualWeightRule,
) -> float:
    weight = 1.0
    peak_distance = snapshot.assets[symbol].peak_distance_60d
    if (
        peak_distance is not None
        and peak_distance < -rule.drawdown_amplifier_threshold
        and rule.drawdown_amplifier_alpha is not None
    ):
        excess = -peak_distance - rule.drawdown_amplifier_threshold
        weight *= 1.0 + rule.drawdown_amplifier_alpha * excess
    return weight


def _is_reentry_cooldown_active(snapshot: PortfolioSnapshot, symbol: str) -> bool:
    cooldown = snapshot.assets[symbol].cooldown_state
    return cooldown.active and cooldown.blocked_zone == "above"


__all__ = ["CrossUpEqualWeightRule"]

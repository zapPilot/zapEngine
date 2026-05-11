"""Portfolio rule 24: route below-DMA fear crypto exposure to stable."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_stable,
    allocation_key_for_symbol,
    current_fgi_regime_for_symbol,
    current_target,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class DmaStableGatingRule:
    name: str = "dma_stable_gating"
    priority: int = 24
    cooldown_days: int = 30
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Move crypto exposure to stable when crypto is below DMA in fear."
    )
    applicable_symbols: frozenset[str] | None = None

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
        for symbol in matching_symbols:
            key = allocation_key_for_symbol(symbol)
            released = max(0.0, float(target.get(key, 0.0)))
            target[key] = 0.0
            add_stable(target, released)
        return portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_dma_stable_gating",
            reason="portfolio_dma_stable_gating",
            rule_group=self.rule_group,
            assets=matching_symbols,
            signals_consulted=signals_consulted_for_symbols(
                snapshot,
                tuple(matching_symbols),
            )
            if config.emit_signals_consulted
            else None,
        )


def _matching_symbols(
    snapshot: PortfolioSnapshot,
    *,
    rule: DmaStableGatingRule,
) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if symbol in {"BTC", "ETH"}
        and (rule.applicable_symbols is None or symbol in rule.applicable_symbols)
        and snapshot.assets[symbol].zone == "below"
        and current_fgi_regime_for_symbol(snapshot, symbol) == "fear"
    ]


__all__ = ["DmaStableGatingRule"]

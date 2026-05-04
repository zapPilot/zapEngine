"""Portfolio rule 4: DCA sell when FGI downshifts from greed."""

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
    normalize_regime,
    portfolio_target_intent,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation

_GREED_REGIMES = frozenset({"greed", "extreme_greed"})
_DEFENSIVE_REGIMES = frozenset({"neutral", "fear", "extreme_fear"})


@dataclass(frozen=True)
class FgiDownshiftDcaSellRule:
    name: str = "fgi_downshift_dca_sell"
    priority: int = 6
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets when relevant FGI transitions out of greed."

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
        sell_step = max(0.0, float(config.fgi_downshift_sell_step))
        for symbol in matching_symbols:
            key = allocation_key_for_symbol(symbol)
            sold = min(sell_step, max(0.0, float(target.get(key, 0.0))))
            target[key] = max(0.0, float(target.get(key, 0.0)) - sold)
            add_stable(target, sold)
        return portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_fgi_downshift_dca_sell",
            reason="portfolio_fgi_downshift_dca_sell",
            rule_group=self.rule_group,
            assets=matching_symbols,
        )


def _matching_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if _is_downshift(
            previous=normalize_regime(snapshot.previous_fgi_regime.get(symbol)),
            current=current_fgi_regime_for_symbol(snapshot, symbol),
        )
    ]


def _is_downshift(*, previous: str | None, current: str | None) -> bool:
    return previous in _GREED_REGIMES and current in _DEFENSIVE_REGIMES


__all__ = ["FgiDownshiftDcaSellRule"]

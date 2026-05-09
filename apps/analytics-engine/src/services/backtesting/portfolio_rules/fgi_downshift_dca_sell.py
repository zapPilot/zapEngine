"""Portfolio rule 50: DCA sell when FGI downshifts from greed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_stable,
    build_dca_sell_intent,
    current_fgi_regime_for_symbol,
    normalize_regime,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy

_GREED_REGIMES = frozenset({"greed", "extreme_greed"})
_DEFENSIVE_REGIMES = frozenset({"neutral", "fear", "extreme_fear"})


@dataclass(frozen=True)
class FgiDownshiftDcaSellRule:
    name: str = "fgi_downshift_dca_sell"
    priority: int = 50
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets when relevant FGI transitions out of greed."
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(_downshifted_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = _downshifted_symbols(snapshot)
        return build_dca_sell_intent(
            snapshot=snapshot,
            matching_symbols=matching_symbols,
            sizing=self.sizing,
            sell_step=self.sell_step,
            proceeds_handler=add_stable,
            allocation_name="portfolio_fgi_downshift_dca_sell",
            reason="portfolio_fgi_downshift_dca_sell",
            rule_group=self.rule_group,
            emit_signals_consulted=config.emit_signals_consulted,
        )


def _downshifted_symbols(snapshot: PortfolioSnapshot) -> list[str]:
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

"""Portfolio rule 50: DCA sell when FGI downshifts from greed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaSellRuleBase,
    FgiRegime,
    PortfolioSnapshot,
    add_stable,
    current_fgi_regime_for_symbol,
    normalize_regime,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy

_GREED_REGIMES = frozenset({FgiRegime.GREED, FgiRegime.EXTREME_GREED})
_DEFENSIVE_REGIMES = frozenset(
    {FgiRegime.NEUTRAL, FgiRegime.FEAR, FgiRegime.EXTREME_FEAR}
)


@dataclass(frozen=True)
class FgiDownshiftDcaSellRule(DcaSellRuleBase):
    name: str = "fgi_downshift_dca_sell"
    priority: int = 50
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets when relevant FGI transitions out of greed."
    allocation_name: str = "portfolio_fgi_downshift_dca_sell"
    reason: str = "portfolio_fgi_downshift_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in symbols_for_snapshot(snapshot)
            if _is_downshift(
                previous=normalize_regime(snapshot.previous_fgi_regime.get(symbol)),
                current=current_fgi_regime_for_symbol(snapshot, symbol),
            )
        ]

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_stable(target, sold)


def _is_downshift(
    *,
    previous: FgiRegime | None,
    current: FgiRegime | None,
) -> bool:
    return previous in _GREED_REGIMES and current in _DEFENSIVE_REGIMES


__all__ = ["FgiDownshiftDcaSellRule"]

"""Portfolio rule 50: DCA sell when FGI downshifts from greed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaSellRuleBase,
    FgiRegime,
    PortfolioSnapshot,
    ProceedsRouting,
    ProceedsRoutingMixin,
    current_fgi_regime_for_symbol,
    normalize_regime,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True, kw_only=True)
class FgiDownshiftDcaSellRule(ProceedsRoutingMixin, DcaSellRuleBase):
    name: str
    priority: int
    cooldown_days: int
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets when relevant FGI transitions out of greed."
    allocation_name: str = "portfolio_fgi_downshift_dca_sell"
    reason: str = "portfolio_fgi_downshift_dca_sell"
    sell_step: float
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    # A downshift is the previous regime being in ``from_regimes`` and the
    # current one in ``to_regimes``.
    from_regimes: frozenset[FgiRegime]
    to_regimes: frozenset[FgiRegime]
    proceeds: ProceedsRouting

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in symbols_for_snapshot(snapshot)
            if self._is_downshift(
                previous=normalize_regime(snapshot.previous_fgi_regime.get(symbol)),
                current=current_fgi_regime_for_symbol(snapshot, symbol),
            )
        ]

    def _is_downshift(
        self,
        *,
        previous: FgiRegime | None,
        current: FgiRegime | None,
    ) -> bool:
        return previous in self.from_regimes and current in self.to_regimes


__all__ = ["FgiDownshiftDcaSellRule"]

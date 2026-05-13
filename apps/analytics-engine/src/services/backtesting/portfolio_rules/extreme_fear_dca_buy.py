"""Portfolio rule 40: DCA buy assets during extreme fear regardless of DMA zone."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    FgiRegime,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True)
class ExtremeFearDcaBuyRule(DcaBuyRuleBase):
    name: str = "extreme_fear_dca_buy"
    priority: int = 40
    cooldown_days: int = 14
    min_consecutive_extreme_fear_days: int = 0
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA buy assets when their relevant FGI is extreme fear."
    allocation_name: str = "portfolio_extreme_fear_dca_buy"
    reason: str = "portfolio_extreme_fear_dca_buy"
    buy_step: float = 0.01
    applicable_symbols: frozenset[str] | None = None
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    _detection_dates: dict[str, date] = field(
        default_factory=dict,
        init=False,
        compare=False,
        repr=False,
    )

    def reset(self) -> None:
        """Clear per-symbol detection state at backtest start."""
        self._detection_dates.clear()

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        """Track continuous extreme-fear windows for delayed buys."""
        del config
        if self.min_consecutive_extreme_fear_days <= 0 or snapshot.current_date is None:
            return
        extreme_fear_today = set(_extreme_fear_symbols(snapshot, rule=self))
        for symbol in list(self._detection_dates):
            if symbol not in extreme_fear_today:
                self._detection_dates.pop(symbol, None)
                continue
            if not snapshot.cycle_open_per_symbol.get(symbol, False):
                self._detection_dates.pop(symbol, None)
        for symbol in extreme_fear_today:
            self._detection_dates.setdefault(symbol, snapshot.current_date)

    def record_intent(self, intent: AllocationIntent) -> None:
        """Clear detection state for delayed buys that survived risk guards."""
        if self.min_consecutive_extreme_fear_days <= 0:
            return
        if intent.action == "hold":
            return
        if intent.reason != self.reason:
            return
        diagnostics = intent.diagnostics or {}
        for symbol in diagnostics.get("portfolio_rule_assets", ()):
            self._detection_dates.pop(str(symbol).upper(), None)

    def _delay_eligible_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        if snapshot.current_date is None:
            return []
        eligible: list[str] = []
        for symbol, detection in self._detection_dates.items():
            if not snapshot.cycle_open_per_symbol.get(symbol, False):
                continue
            if (
                snapshot.current_date - detection
            ).days >= self.min_consecutive_extreme_fear_days:
                eligible.append(symbol)
        return eligible

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        if self.min_consecutive_extreme_fear_days <= 0:
            return _extreme_fear_symbols(snapshot, rule=self)
        return self._delay_eligible_symbols(snapshot)


def _extreme_fear_symbols(
    snapshot: PortfolioSnapshot,
    *,
    rule: ExtremeFearDcaBuyRule,
) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if (rule.applicable_symbols is None or symbol in rule.applicable_symbols)
        if current_fgi_regime_for_symbol(snapshot, symbol) is FgiRegime.EXTREME_FEAR
        and snapshot.cycle_open_per_symbol.get(symbol, False)
    ]


__all__ = ["ExtremeFearDcaBuyRule"]

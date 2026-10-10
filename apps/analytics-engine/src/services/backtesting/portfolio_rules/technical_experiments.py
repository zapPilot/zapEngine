"""Technical-indicator research rules: trim or add when a technical trigger fires.

A strategy spec writes these as the ``technical_trim`` and ``technical_add``
kinds; the trigger is one of the conditions in
``portfolio_rules/technical_triggers.py``. Every rule differs from its siblings
only in that trigger, so there are two shared buy/sell shapes rather than one
class per indicator. Each intent attaches a ``technical_signals`` diagnostic for
the assets that triggered it.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    DcaSellRuleBase,
    PortfolioSnapshot,
    ProceedsRouting,
    ProceedsRoutingMixin,
    above_dma_symbols,
)
from src.services.backtesting.portfolio_rules.technical_triggers import (
    TechnicalTrigger,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True, kw_only=True)
class _TechnicalRuleFields:
    """Identity, asset matching, and diagnostics shared by every experiment."""

    name: str
    priority: int
    description: str
    predicate: TechnicalTrigger
    cooldown_days: int
    rule_group: RuleGroup = "dma_fgi"
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    allocation_name: str = field(init=False)
    reason: str = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "allocation_name", f"portfolio_{self.name}")
        object.__setattr__(self, "reason", f"portfolio_{self.name}")

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in above_dma_symbols(snapshot)
            if self.predicate(symbol, snapshot.assets[symbol].technical)
        ]

    def _decorate_intent(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> AllocationIntent:
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["technical_signals"] = {
            symbol: asdict(snapshot.assets[symbol].technical)
            for symbol in self._matching_symbols(snapshot)
        }
        return replace(intent, diagnostics=diagnostics)


@dataclass(frozen=True, kw_only=True)
class TechnicalDcaSellRule(_TechnicalRuleFields, ProceedsRoutingMixin, DcaSellRuleBase):
    """Trim matching assets and route the proceeds."""

    sell_step: float
    proceeds: ProceedsRouting


@dataclass(frozen=True, kw_only=True)
class TechnicalDcaBuyRule(_TechnicalRuleFields, DcaBuyRuleBase):
    """Buy matching assets out of the stable sleeve."""

    buy_step: float


__all__ = [
    "TechnicalDcaBuyRule",
    "TechnicalDcaSellRule",
]

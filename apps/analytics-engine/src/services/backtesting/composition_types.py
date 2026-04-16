"""Protocols and dataclasses for composable strategy components."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import SignalObservation
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategies.base import StrategyContext


class StatefulSignalComponent(Protocol):
    """Stateful signal component used by composed strategies."""

    signal_id: str
    market_data_requirements: MarketDataRequirements
    warmup_lookback_days: int

    def reset(self) -> None: ...

    def initialize(self, context: StrategyContext) -> None: ...

    def warmup(self, context: StrategyContext) -> None: ...

    def observe(self, context: StrategyContext) -> Any: ...

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: Any,
        intent: AllocationIntent,
    ) -> Any: ...

    def build_signal_observation(
        self,
        *,
        snapshot: Any,
        intent: AllocationIntent,
    ) -> SignalObservation: ...

    def build_execution_hints(
        self,
        *,
        snapshot: Any,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints: ...


class DecisionPolicy(Protocol):
    """Decision policy that maps a signal snapshot to an allocation intent."""

    decision_policy_id: str

    def decide(self, snapshot: Any) -> AllocationIntent: ...


@dataclass(frozen=True)
class ResolvedComposedComponents:
    signal_component: StatefulSignalComponent
    decision_policy: DecisionPolicy
    pacing_policy: Any
    plugins: tuple[Any, ...]


__all__ = [
    "DecisionPolicy",
    "ResolvedComposedComponents",
    "StatefulSignalComponent",
]

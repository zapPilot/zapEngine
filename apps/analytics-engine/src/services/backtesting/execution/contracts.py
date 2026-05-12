"""Contracts shared by backtesting execution components."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

from src.services.backtesting.decision import AllocationIntent, DecisionAction

if TYPE_CHECKING:  # pragma: no cover
    from src.services.backtesting.strategies.base import StrategyContext


@dataclass(frozen=True, slots=True)
class ExecutionHints:
    """Execution-facing hints derived from signal and policy outputs."""

    signal_id: str
    current_regime: str
    signal_value: float | None
    signal_confidence: float
    decision_score: float
    decision_action: DecisionAction
    dma_distance: float | None = None
    fgi_slope: float | None = None
    buy_strength: float | None = None
    enable_buy_gate: bool = False
    reset_buy_gate: bool = False


class AllocationExecutor(Protocol):
    """Execution component for allocation intents."""

    def reset(self) -> None: ...

    def observe(self, hints: ExecutionHints) -> None: ...

    def execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
    ) -> Any: ...

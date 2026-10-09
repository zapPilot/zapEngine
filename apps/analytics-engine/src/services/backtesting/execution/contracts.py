"""Contracts shared by backtesting execution components."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

from src.services.backtesting.decision import AllocationIntent

if TYPE_CHECKING:  # pragma: no cover -- type-only import, never executed
    from src.services.backtesting.strategies.base import StrategyContext


class AllocationExecutor(Protocol):
    """Execution component for allocation intents."""

    def reset(self) -> None: ...

    def execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
    ) -> Any: ...

"""Plugin contracts for shared allocation execution."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol, runtime_checkable

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionPluginDiagnostic
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.strategies.base import StrategyContext, TransferIntent


@dataclass(frozen=True, slots=True)
class ExecutionPluginResult:
    """Plugin contribution for a single execution phase."""

    allowed: bool = True
    blocked_reason: str | None = None
    step_plan: dict[str, float] | None = None
    clear_plan: bool = False
    diagnostics: tuple[ExecutionPluginDiagnostic, ...] = ()


@dataclass(frozen=True, slots=True)
class PluginInvocation:
    """Shared plugin invocation context."""

    context: StrategyContext
    intent: AllocationIntent
    hints: ExecutionHints


@runtime_checkable
class ExecutionPlugin(Protocol):
    """Extensible execution plugin interface used by AllocationIntentExecutor."""

    def reset(self) -> None: ...

    def observe(self, hints: ExecutionHints) -> None: ...

    def precheck(self, invocation: PluginInvocation) -> ExecutionPluginResult: ...

    def adjust_step_plan(
        self,
        invocation: PluginInvocation,
        step_plan: dict[str, float],
    ) -> ExecutionPluginResult: ...

    def after_execution(
        self,
        invocation: PluginInvocation,
        transfers: list[TransferIntent],
    ) -> ExecutionPluginResult: ...


@runtime_checkable
class TradeHistoryAwareExecutionPlugin(Protocol):
    """Optional protocol for plugins that rely on persisted historical trades."""

    @property
    def history_lookback_days(self) -> int:
        """Return the minimum history window the plugin needs to enforce its rules."""
        ...

    def load_trade_dates(self, trade_dates: list[date]) -> None:
        """Seed plugin state from persisted trade history before execution begins."""
        ...


def merge_plugin_results(
    *results: ExecutionPluginResult,
) -> ExecutionPluginResult:
    diagnostics: list[ExecutionPluginDiagnostic] = []
    step_plan: dict[str, float] | None = None
    allowed = True
    blocked_reason: str | None = None
    clear_plan = False
    for result in results:
        diagnostics.extend(result.diagnostics)
        if result.step_plan is not None:
            step_plan = dict(result.step_plan)
        if not result.allowed:
            allowed = False
            blocked_reason = result.blocked_reason
        if result.clear_plan:
            clear_plan = True
    return ExecutionPluginResult(
        allowed=allowed,
        blocked_reason=blocked_reason,
        step_plan=step_plan,
        clear_plan=clear_plan,
        diagnostics=tuple(diagnostics),
    )

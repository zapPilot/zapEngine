"""Generic signal-driven strategy composed from runtime components."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.execution.contracts import AllocationExecutor
from src.services.backtesting.portfolio_rules.base import DecisionPolicy
from src.services.backtesting.signals.contracts import StatefulSignalComponent
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
    StrategyResult,
)


@dataclass
class ComposedSignalStrategy(BaseStrategy):
    """Strategy that wires signal, decision, and execution components."""

    total_capital: float
    signal_component: StatefulSignalComponent
    decision_policy: DecisionPolicy
    execution_engine: AllocationExecutor
    public_params: dict[str, Any] = field(default_factory=dict)
    signal_id: str = ""
    summary_signal_id: str | None = None
    strategy_id: str = "composed_signal"
    display_name: str = "Composed Signal Strategy"
    canonical_strategy_id: str = "composed_signal"
    daily_data: list[dict[str, Any]] = field(default_factory=list)

    def initialize(self, portfolio: Any, config: Any, context: StrategyContext) -> None:
        del portfolio, config
        self.daily_data = []
        self.signal_component.reset()
        self.signal_component.initialize(context)
        self.execution_engine.reset()

    def warmup_day(self, context: StrategyContext) -> None:
        self.signal_component.warmup(context)

    def on_day(self, context: StrategyContext) -> StrategyAction:
        market_state = self.signal_component.observe(context)
        decision = self.decision_policy.decide(market_state)
        committed_state = self.signal_component.apply_intent(
            current_date=context.date,
            snapshot=market_state,
            intent=decision,
        )
        signal_observation = self.signal_component.build_signal_observation(
            snapshot=committed_state,
            intent=decision,
        )
        execution = self._execute(context=context, intent=decision)
        record_execution = getattr(self.decision_policy, "record_execution", None)
        if callable(record_execution):
            record_execution(
                context=context,
                intent=decision,
                execution=execution,
            )
        snapshot = StrategySnapshot(
            signal=signal_observation,
            decision=AllocationIntent(
                action=decision.action,
                target_allocation=(
                    None
                    if decision.target_allocation is None
                    else dict(decision.target_allocation)
                ),
                allocation_name=decision.allocation_name,
                immediate=decision.immediate,
                reason=decision.reason,
                rule_group=decision.rule_group,
                decision_score=decision.decision_score,
                diagnostics=(
                    None if decision.diagnostics is None else dict(decision.diagnostics)
                ),
            ),
            execution=execution,
        )
        return StrategyAction(
            snapshot=snapshot,
            transfers=list(execution.transfers) or None,
        )

    def record_day(
        self,
        context: StrategyContext,
        action: StrategyAction,
        yield_breakdown: dict[str, float],
        trade_executed: bool,
    ) -> None:
        del yield_breakdown, trade_executed
        snapshot = action.snapshot
        self.daily_data.append(
            {
                "date": context.date,
                "spot_balance": context.portfolio.spot_balance,
                "stable_balance": context.portfolio.stable_balance,
                "total_value": context.portfolio.total_value(context.portfolio_price),
                "signal_id": None
                if snapshot.signal is None
                else snapshot.signal.signal_id,
                "decision_reason": snapshot.decision.reason,
            }
        )

    def finalize(self) -> StrategyResult:
        return StrategyResult(metrics={})

    def _execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
    ) -> ExecutionOutcome:
        if intent.action == "hold" and intent.target_allocation is None:
            return ExecutionOutcome(event=None, transfers=[])
        execution = self.execution_engine.execute(context=context, intent=intent)
        return self._to_execution_outcome(execution)

    @staticmethod
    def _to_execution_outcome(
        execution: Any,
    ) -> ExecutionOutcome:
        return ExecutionOutcome(
            event=execution.event,
            transfers=[] if execution.transfers is None else list(execution.transfers),
            blocked_reason=execution.block_reason,
        )


__all__ = ["ComposedSignalStrategy"]

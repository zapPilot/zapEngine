from __future__ import annotations

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.domain import (
    ExecutionOutcome,
    SignalObservation,
    StrategySnapshot,
)
from src.services.backtesting.strategies.base import TransferIntent


def make_strategy_snapshot(
    *,
    action: DecisionAction = "hold",
    reason: str = "hold",
    rule_group: RuleGroup = "none",
    target_allocation: dict[str, float] | None = None,
    allocation_name: str | None = None,
    decision_score: float = 0.0,
    immediate: bool = False,
    signal: SignalObservation | None = None,
    event: str | None = None,
    transfers: list[TransferIntent] | None = None,
    blocked_reason: str | None = None,
    step_count: int = 0,
    steps_remaining: int = 0,
    interval_days: int = 0,
) -> StrategySnapshot:
    return StrategySnapshot(
        signal=signal,
        decision=AllocationIntent(
            action=action,
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            immediate=immediate,
            reason=reason,
            rule_group=rule_group,
            decision_score=decision_score,
        ),
        execution=ExecutionOutcome(
            event=event,
            transfers=[] if transfers is None else list(transfers),
            blocked_reason=blocked_reason,
            step_count=step_count,
            steps_remaining=steps_remaining,
            interval_days=interval_days,
        ),
    )


__all__ = ["make_strategy_snapshot"]

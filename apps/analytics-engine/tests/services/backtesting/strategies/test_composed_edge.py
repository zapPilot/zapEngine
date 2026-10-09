"""Edge-case tests for ComposedSignalStrategy execution helpers."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategies.composed import ComposedSignalStrategy


def _build_minimal_strategy() -> ComposedSignalStrategy:
    signal_component = Mock()
    signal_component.market_data_requirements = MarketDataRequirements(
        requires_sentiment=False,
    )
    decision_policy = Mock()
    execution_engine = Mock()
    return ComposedSignalStrategy(
        total_capital=10_000.0,
        signal_component=signal_component,
        decision_policy=decision_policy,
        execution_engine=execution_engine,
    )


def test_execute_returns_noop_for_hold_without_target() -> None:
    strategy = _build_minimal_strategy()
    context = Mock()
    intent = AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
    )

    outcome = strategy._execute(context=context, intent=intent)

    assert outcome == ExecutionOutcome(event=None, transfers=[])
    strategy.execution_engine.execute.assert_not_called()


def test_to_execution_outcome_copies_none_transfers_and_the_block_reason() -> None:
    outcome = ComposedSignalStrategy._to_execution_outcome(
        SimpleNamespace(event="rebalance", transfers=None, block_reason="blocked")
    )

    assert outcome.event == "rebalance"
    assert outcome.transfers == []
    assert outcome.blocked_reason == "blocked"

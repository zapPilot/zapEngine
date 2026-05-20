"""Edge-case tests for ComposedSignalStrategy._resolve_current_sentiment."""

from __future__ import annotations

from datetime import date
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


def test_resolve_sentiment_no_sentiment_required_returns_none() -> None:
    strategy = _build_minimal_strategy()
    input_data = Mock()
    input_data.current_sentiment = None
    input_data.current_date = date(2025, 1, 15)
    input_data.fallback_regime = "Neutral"
    input_data.fallback_sentiment_value = 50

    result = strategy._resolve_current_sentiment(
        input_data=input_data,
        history_by_date={},
    )
    assert result is None


def test_resolve_sentiment_requires_sentiment_returns_fallback() -> None:
    signal_component = Mock()
    signal_component.market_data_requirements = MarketDataRequirements(
        requires_sentiment=True,
    )
    strategy = ComposedSignalStrategy(
        total_capital=10_000.0,
        signal_component=signal_component,
        decision_policy=Mock(),
        execution_engine=Mock(),
    )
    input_data = Mock()
    input_data.current_sentiment = None
    input_data.current_date = date(2025, 1, 15)
    input_data.fallback_regime = "Greed"
    input_data.fallback_sentiment_value = 70

    result = strategy._resolve_current_sentiment(
        input_data=input_data,
        history_by_date={},
    )
    assert result is not None
    assert result["label"].lower() == "greed"


def test_extract_sentiment_history_entries_skips_bad_dates_and_bad_values() -> None:
    entries = ComposedSignalStrategy._extract_sentiment_history_entries(
        [
            {"label": "fear"},
            {"snapshot_date": "not-a-date", "label": "greed"},
            {
                "snapshot_date": "2025-01-02",
                "primary_classification": "Fear",
                "avg_sentiment": object(),
            },
            {"date": date(2025, 1, 1), "avg_label": "Greed", "value": 72},
        ]
    )

    assert [(entry.entry_date, entry.label, entry.value) for entry in entries] == [
        (date(2025, 1, 1), "greed", 72),
        (date(2025, 1, 2), "fear", None),
    ]


def test_resolve_current_sentiment_prefers_history_for_current_date() -> None:
    strategy = _build_minimal_strategy()
    input_data = Mock()
    input_data.current_sentiment = None
    input_data.current_date = date(2025, 1, 15)
    input_data.fallback_regime = "Fear"
    input_data.fallback_sentiment_value = 20

    result = strategy._resolve_current_sentiment(
        input_data=input_data,
        history_by_date={date(2025, 1, 15): {"label": "greed", "value": 71}},
    )

    assert result == {"label": "greed", "value": 71}


def test_regime_history_returns_copy_from_signal_component() -> None:
    strategy = _build_minimal_strategy()
    strategy.signal_component._regime_history = ["fear", "greed"]

    history = strategy.regime_history
    history.append("neutral")

    assert strategy.regime_history == ["fear", "greed"]


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

    outcome = strategy._execute(context=context, intent=intent, hints=Mock())

    assert outcome == ExecutionOutcome(event=None, transfers=[])
    strategy.execution_engine.execute.assert_not_called()


def test_to_execution_outcome_copies_none_transfers_and_plugin_metadata() -> None:
    outcome = ComposedSignalStrategy._to_execution_outcome(
        SimpleNamespace(
            event="rebalance",
            transfers=None,
            block_reason="blocked",
            step_count=2,
            steps_remaining=1,
            interval_days=3,
            plugin_diagnostics=("diag",),
        )
    )

    assert outcome.event == "rebalance"
    assert outcome.transfers == []
    assert outcome.blocked_reason == "blocked"
    assert outcome.step_count == 2
    assert outcome.steps_remaining == 1
    assert outcome.interval_days == 3
    assert outcome.plugin_diagnostics == ("diag",)

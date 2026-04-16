"""Edge-case tests for ComposedSignalStrategy._resolve_current_sentiment."""

from __future__ import annotations

from datetime import date
from unittest.mock import Mock

from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy


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

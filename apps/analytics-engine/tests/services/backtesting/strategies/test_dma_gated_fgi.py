from __future__ import annotations

from datetime import date, datetime

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.signals.dma_gated_fgi.errors import SignalDataError
from src.services.backtesting.strategies.base import (
    DailyRecommendationInput,
    StrategyAction,
    StrategyContext,
)
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiStrategy,
)
from tests.services.backtesting.support import make_strategy_snapshot


def _portfolio() -> Portfolio:
    return Portfolio(spot_balance=0.0, stable_balance=10_000.0)


def _input(
    *,
    current_date: date,
    sentiment_aggregates: list[dict[str, object]],
    current_sentiment: dict[str, object] | None = None,
    fallback_regime: str | None = None,
    fallback_sentiment_value: int | None = None,
    extra_data: dict[str, object] | None = None,
    warmup_extra_data_by_date: dict[date, dict[str, object]] | None = None,
    warmup_price_by_date: dict[date, float] | None = None,
) -> DailyRecommendationInput:
    return DailyRecommendationInput(
        current_date=current_date,
        price=100.0,
        portfolio=_portfolio(),
        price_history=[95.0, 100.0],
        sentiment_aggregates=sentiment_aggregates,
        current_sentiment=current_sentiment,
        fallback_regime=fallback_regime,
        fallback_sentiment_value=fallback_sentiment_value,
        extra_data={} if extra_data is None else extra_data,
        warmup_extra_data_by_date={}
        if warmup_extra_data_by_date is None
        else warmup_extra_data_by_date,
        warmup_price_by_date={}
        if warmup_price_by_date is None
        else warmup_price_by_date,
    )


def test_extract_sentiment_history_entries_parses_and_sorts_supported_formats() -> None:
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)

    entries = strategy._extract_sentiment_history_entries(
        [
            {
                "snapshot_date": datetime(2025, 1, 3, 10, 30),
                "primary_classification": "Extreme Fear",
                "avg_sentiment": "10",
            },
            {
                "date": date(2025, 1, 1),
                "avg_label": "Greed",
                "avg_sentiment": 70,
            },
            {
                "date": "2025-01-02T08:00:00Z",
                "label": "Neutral",
                "value": "bad",
            },
            {"date": "not-a-date", "label": "Fear", "value": 30},
            {"label": "Fear", "value": 20},
            {"date": object(), "label": "Fear", "value": 20},
        ]
    )

    assert [(entry.entry_date, entry.label, entry.value) for entry in entries] == [
        (date(2025, 1, 1), "greed", 70),
        (date(2025, 1, 2), "neutral", None),
        (date(2025, 1, 3), "extreme_fear", 10),
    ]


def test_get_daily_recommendation_prefers_current_sentiment_and_replays_warmups(
    monkeypatch,
) -> None:
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)
    warmup_contexts: list[StrategyContext] = []
    captured_today: dict[str, StrategyContext] = {}
    original_warmup = strategy.warmup_day

    def warmup_spy(context: StrategyContext) -> None:
        warmup_contexts.append(context)
        original_warmup(context)

    def on_day_spy(context: StrategyContext) -> StrategyAction:
        captured_today["context"] = context
        return StrategyAction(snapshot=make_strategy_snapshot(reason="captured"))

    monkeypatch.setattr(strategy, "warmup_day", warmup_spy)
    monkeypatch.setattr(strategy, "on_day", on_day_spy)

    action = strategy.get_daily_recommendation(
        _input(
            current_date=date(2025, 1, 3),
            sentiment_aggregates=[
                {"date": date(2025, 1, 1), "label": "Fear", "value": 20},
                {"date": date(2025, 1, 2), "label": "Greed", "value": 70},
                {"date": date(2025, 1, 3), "label": "Neutral", "value": 50},
            ],
            current_sentiment={"label": "Extreme Greed", "value": 88},
            fallback_regime="fear",
            fallback_sentiment_value=15,
            extra_data={"dma_200": 99.0},
            warmup_extra_data_by_date={date(2025, 1, 1): {"dma_200": 80.0}},
            warmup_price_by_date={date(2025, 1, 1): 90.0},
        )
    )

    assert action.snapshot.decision.reason == "captured"
    assert [context.date for context in warmup_contexts] == [
        date(2025, 1, 1),
        date(2025, 1, 2),
    ]
    assert warmup_contexts[0].price == 90.0
    assert warmup_contexts[0].extra_data == {"dma_200": 80.0}
    assert warmup_contexts[1].price == 100.0
    assert captured_today["context"].sentiment == {
        "label": "Extreme Greed",
        "value": 88,
    }
    assert captured_today["context"].extra_data == {"dma_200": 99.0}
    assert strategy.regime_history == ["fear", "greed"]


def test_get_daily_recommendation_uses_today_history_when_current_sentiment_missing(
    monkeypatch,
) -> None:
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)
    captured_today: dict[str, StrategyContext] = {}

    def on_day_spy(context: StrategyContext) -> StrategyAction:
        captured_today["context"] = context
        return StrategyAction(snapshot=make_strategy_snapshot(reason="history_today"))

    monkeypatch.setattr(strategy, "on_day", on_day_spy)

    strategy.get_daily_recommendation(
        _input(
            current_date=date(2025, 1, 3),
            sentiment_aggregates=[
                {"date": date(2025, 1, 3), "label": "Greed", "value": None}
            ],
        )
    )

    assert captured_today["context"].sentiment == {"label": "greed", "value": 50}


def test_get_daily_recommendation_uses_fallback_when_today_sentiment_is_missing(
    monkeypatch,
) -> None:
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)
    captured_today: dict[str, StrategyContext] = {}

    def on_day_spy(context: StrategyContext) -> StrategyAction:
        captured_today["context"] = context
        return StrategyAction(snapshot=make_strategy_snapshot(reason="fallback"))

    monkeypatch.setattr(strategy, "on_day", on_day_spy)

    strategy.get_daily_recommendation(
        _input(
            current_date=date(2025, 1, 3),
            sentiment_aggregates=[],
            fallback_regime="fear",
            fallback_sentiment_value=22,
        )
    )

    assert captured_today["context"].sentiment == {"label": "fear", "value": 22}


def test_strategy_requires_dma_200_for_runtime_decision() -> None:
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)
    context = StrategyContext(
        date=date(2025, 1, 3),
        price=123.0,
        sentiment={"label": "fear", "value": 30},
        price_history=[120.0, 123.0],
        portfolio=_portfolio(),
        extra_data={},
    )
    strategy.initialize(context.portfolio, None, context)

    with pytest.raises(
        SignalDataError, match=r"Missing required extra_data\['dma_200'\]"
    ):
        strategy.on_day(context)


def test_strategy_on_day_emits_snapshot_and_execution_from_direct_runtime() -> None:
    strategy = DmaGatedFgiStrategy(total_capital=10_000.0)
    warmup_context = StrategyContext(
        date=date(2025, 1, 2),
        price=95.0,
        sentiment={"label": "fear", "value": 20},
        price_history=[95.0],
        portfolio=_portfolio(),
        extra_data={"dma_200": 100.0},
    )
    live_context = StrategyContext(
        date=date(2025, 1, 3),
        price=105.0,
        sentiment={"label": "greed", "value": 72},
        price_history=[95.0, 105.0],
        portfolio=_portfolio(),
        extra_data={"dma_200": 100.0},
    )

    strategy.initialize(warmup_context.portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    action = strategy.on_day(live_context)

    assert action.snapshot is not None
    assert action.snapshot.signal is not None
    assert action.snapshot.signal.signal_id == "dma_gated_fgi"
    assert action.snapshot.decision.reason == "dma_cross_up"
    assert action.snapshot.decision.rule_group == "cross"
    assert action.snapshot.execution.event == "rebalance"
    assert action.transfers is not None
    assert action.transfers[0].from_bucket == "stable"
    assert action.transfers[0].to_bucket == "btc"

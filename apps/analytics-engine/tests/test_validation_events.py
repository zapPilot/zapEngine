from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import pytest

from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.validation.event_runner import (
    ValidationEvent,
    evaluate_event,
    load_validation_events,
)
from tests.services.backtesting.support.event_histories import synthetic_event_history

FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures/hierarchical_validation_events.json"
)
KEPT_STRATEGIES = (STRATEGY_DMA_FGI_PORTFOLIO_RULES,)
EVENTS = load_validation_events(FIXTURE_PATH)
EVENT_STRATEGY_PAIRS = [
    (event, strategy_id)
    for event in EVENTS
    for strategy_id in (event.applicable_strategies or KEPT_STRATEGIES)
]


@pytest.fixture(scope="session")
def validation_timelines_by_event() -> dict[str, dict[str, list[dict[str, Any]]]]:
    timelines_by_event: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for event in EVENTS:
        prices, sentiments, start, end = synthetic_event_history(event)
        strategy_ids = event.applicable_strategies or KEPT_STRATEGIES
        payload = _run_validation_compare(
            prices=prices,
            sentiments=sentiments,
            start=start,
            end=end,
            strategy_ids=strategy_ids,
        )
        timelines_by_event[event.id] = {
            strategy_id: _normalized_strategy_timeline(payload, strategy_id)
            for strategy_id in strategy_ids
        }
    return timelines_by_event


def _run_validation_compare(
    *,
    prices: list[dict[str, Any]],
    sentiments: dict[date, dict[str, Any]],
    start: date,
    end: date,
    strategy_ids: tuple[str, ...],
) -> dict[str, Any]:
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=end,
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id=strategy_id,
                strategy_id=strategy_id,
                params={},
            )
            for strategy_id in strategy_ids
        ],
    )
    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=start,
    )
    return result.model_dump(mode="json")


@pytest.mark.parametrize(
    ("event", "strategy_id"),
    EVENT_STRATEGY_PAIRS,
    ids=lambda value: value.id if isinstance(value, ValidationEvent) else value,
)
def test_validation_event(
    event: ValidationEvent,
    strategy_id: str,
    validation_timelines_by_event: dict[str, dict[str, list[dict[str, Any]]]],
) -> None:
    result = evaluate_event(
        event,
        validation_timelines_by_event[event.id][strategy_id],
    )
    assert result.passed, result.failure_message


def _normalized_strategy_timeline(
    payload: dict[str, Any],
    strategy_id: str,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for point in payload["timeline"]:
        market = point["market"]
        strategy_state = point["strategies"][strategy_id]
        normalized.append({"date": market["date"], "market": market, **strategy_state})
    return normalized

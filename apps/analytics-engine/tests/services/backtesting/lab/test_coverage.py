from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest

from src.services.backtesting.lab.coverage import (
    HOLDOUT_DAYS,
    MAX_ROW_GAP_DAYS,
    MIN_IN_SAMPLE_DAYS,
    OOS_BLOCK_DAYS,
    CompleteWindow,
    coverage_of,
    recommend_split,
)
from src.services.backtesting.lab.synthetic import synthetic_market

START = date(2025, 1, 1)


def _row(day: date, **missing: bool) -> dict[str, Any]:
    """A complete row; name a series in ``missing`` to drop it."""
    extra = {
        "dma_200": 90.0,
        "eth_dma_200": 90.0,
        "spy_dma_200": 90.0,
        "eth_btc_ratio": 0.05,
        "eth_btc_ratio_dma_200": 0.05,
        "macro_fear_greed": {"label": "neutral", "score": 50},
    }
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    for name in missing:
        extra.pop(name, None)
        prices.pop(name, None)
    return {"date": day, "price": 100.0, "prices": prices, "extra_data": extra}


def _days(count: int, *, start: date = START) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(count)]


def test_a_complete_history_has_no_gaps_and_one_window() -> None:
    market = synthetic_market(seed=1, days=300)

    coverage = coverage_of(market.prices, market.sentiments)

    assert coverage.rows == len(market.prices)
    assert coverage.first_row == market.prices[0]["date"]
    assert coverage.last_row == market.prices[-1]["date"]
    assert coverage.complete_window == CompleteWindow(
        market.prices[0]["date"], market.prices[-1]["date"], len(market.prices)
    )
    assert all(item.missing_days == 0 for item in coverage.series.values())
    assert coverage.series["btc"].count == len(market.prices)


def test_an_empty_history_has_no_window() -> None:
    coverage = coverage_of([], {})

    assert (coverage.rows, coverage.first_row, coverage.last_row) == (0, None, None)
    assert coverage.complete_window is None
    assert coverage.series["btc"].first is None
    assert coverage.series["sentiment"].count == 0
    assert coverage.recommendation.reason == "No stretch has every series."
    assert coverage.as_dict()["complete_window"] is None
    assert coverage.as_dict()["recommendation"]["development"] is None


def test_a_series_reports_where_it_starts_ends_and_breaks() -> None:
    rows = [
        _row(day, **({"spy": True} if day in (_days(10)[3], _days(10)[4]) else {}))
        for day in _days(10)
    ]

    coverage = coverage_of(rows, {})

    spy = coverage.series["spy"]
    assert (spy.first, spy.last) == (START, START + timedelta(days=9))
    assert (spy.count, spy.missing_days, spy.longest_gap_days) == (8, 2, 2)
    assert coverage.series["btc"].missing_days == 0
    assert coverage.rows == 10


@pytest.mark.parametrize(
    ("value", "present"),
    [(100.0, True), (0.0, False), (-1.0, False), (None, False), (True, False)],
)
def test_a_price_counts_only_when_it_is_a_positive_number(
    value: Any, present: bool
) -> None:
    row = _row(START)
    row["prices"]["btc"] = value

    assert (coverage_of([row], {}).series["btc"].count == 1) is present


def test_macro_fear_greed_counts_only_when_it_has_content() -> None:
    empty = _row(START)
    empty["extra_data"]["macro_fear_greed"] = {}
    wrong_type = _row(START + timedelta(days=1))
    wrong_type["extra_data"]["macro_fear_greed"] = "fear"

    assert coverage_of([empty, wrong_type], {}).series["macro_fear_greed"].count == 0


def test_a_short_gap_does_not_end_the_window() -> None:
    days = _days(10)
    rows = [_row(day) for index, day in enumerate(days) if index not in (4, 5)]

    window = coverage_of(rows, {}).complete_window

    assert MAX_ROW_GAP_DAYS >= 3
    assert window == CompleteWindow(days[0], days[-1], 8)


def test_a_long_gap_ends_the_window_and_the_longer_side_wins() -> None:
    first = _days(5)
    second = _days(9, start=START + timedelta(days=5 + MAX_ROW_GAP_DAYS + 1))
    rows = [_row(day) for day in (*first, *second)]

    window = coverage_of(rows, {}).complete_window

    assert window == CompleteWindow(second[0], second[-1], 9)


def test_equal_runs_keep_the_earlier_one() -> None:
    first = _days(5)
    second = _days(5, start=START + timedelta(days=5 + MAX_ROW_GAP_DAYS + 1))

    window = coverage_of([_row(day) for day in (*first, *second)], {}).complete_window

    assert window == CompleteWindow(first[0], first[-1], 5)


def test_a_missing_series_breaks_the_window_like_a_missing_row() -> None:
    days = _days(12)
    rows = [
        _row(day, **({"eth_btc_ratio": True} if 3 <= index <= 8 else {}))
        for index, day in enumerate(days)
    ]

    window = coverage_of(rows, {}).complete_window

    assert window is not None
    assert window.days <= 3


def test_sentiment_gaps_are_reported_but_never_end_a_window() -> None:
    days = _days(20)
    sentiments = {day: {"label": "neutral"} for day in days if day.day % 2}

    coverage = coverage_of([_row(day) for day in days], sentiments)

    assert coverage.series["sentiment"].missing_days > 0
    assert coverage.complete_window == CompleteWindow(days[0], days[-1], 20)


def test_a_null_sentiment_is_not_a_sentiment() -> None:
    coverage = coverage_of([_row(START)], {START: None})

    assert coverage.series["sentiment"].count == 0


def test_rows_may_arrive_in_any_order() -> None:
    rows = [_row(day) for day in reversed(_days(5))]

    coverage = coverage_of(rows, {})

    assert coverage.first_row == START
    assert coverage.complete_window == CompleteWindow(START, _days(5)[-1], 5)


def _window(days: int) -> CompleteWindow:
    return CompleteWindow(START, START + timedelta(days=days - 1), days)


def test_a_window_has_a_length_in_days() -> None:
    assert _window(10).days == 10
    assert _window(10).as_dict() == {
        "start": "2025-01-01",
        "end": "2025-01-10",
        "days": 10,
        "rows": 10,
    }


def test_no_window_means_nothing_to_split() -> None:
    recommendation = recommend_split(None)

    assert (recommendation.development, recommendation.holdout) == (None, None)
    assert recommendation.folds == 0


def test_a_short_window_is_descriptive_only() -> None:
    needed = MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS

    recommendation = recommend_split(_window(needed - 1))

    assert recommendation.folds == 0
    assert recommendation.holdout is None
    assert recommendation.development == (START, _window(needed - 1).end)
    assert "descriptive" in recommendation.reason


def test_a_window_with_one_block_but_no_holdout_is_walk_forward_only() -> None:
    needed = MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS

    exact = recommend_split(_window(needed))
    longer = recommend_split(_window(needed + HOLDOUT_DAYS - 1))

    assert (exact.folds, exact.holdout) == (1, None)
    assert longer.folds == (needed + HOLDOUT_DAYS - 1 - MIN_IN_SAMPLE_DAYS) // (
        OOS_BLOCK_DAYS
    )
    assert longer.holdout is None
    assert "walk-forward only" in longer.reason


def test_a_long_window_holds_out_its_last_days() -> None:
    days = MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS + HOLDOUT_DAYS
    window = _window(days)

    recommendation = recommend_split(window)

    assert recommendation.holdout is not None
    holdout_start, holdout_end = recommendation.holdout
    assert holdout_end == window.end
    assert (holdout_end - holdout_start).days + 1 == HOLDOUT_DAYS
    assert recommendation.development == (
        window.start,
        holdout_start - timedelta(days=1),
    )
    assert recommendation.folds == 1
    assert recommendation.as_dict()["holdout"] == {
        "start": holdout_start.isoformat(),
        "end": holdout_end.isoformat(),
    }

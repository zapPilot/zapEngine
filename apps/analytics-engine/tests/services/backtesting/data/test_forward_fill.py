from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.data.forward_fill import (
    _forward_fill_sorted_targets,
    forward_fill_daily,
    forward_fill_for_date,
)


def test_forward_fill_sorted_targets_returns_empty_for_empty_source() -> None:
    assert _forward_fill_sorted_targets({}, [date(2025, 1, 1)]) == {}


def test_forward_fill_daily_returns_empty_for_invalid_window() -> None:
    assert (
        forward_fill_daily(
            {date(2025, 1, 2): 102.0},
            start_date=date(2025, 1, 3),
            end_date=date(2025, 1, 2),
        )
        == {}
    )


def test_forward_fill_sorted_targets_fills_bracketed_target_dates() -> None:
    filled = _forward_fill_sorted_targets(
        {
            date(2025, 1, 1): 100.0,
            date(2025, 1, 3): 103.0,
        },
        [
            date(2025, 1, 1),
            date(2025, 1, 2),
            date(2025, 1, 3),
            date(2025, 1, 4),
        ],
    )

    assert filled == {
        date(2025, 1, 1): 100.0,
        date(2025, 1, 2): 100.0,
        date(2025, 1, 3): 103.0,
        date(2025, 1, 4): 103.0,
    }


def test_forward_fill_sorted_targets_omits_dates_before_first_source() -> None:
    filled = _forward_fill_sorted_targets(
        {date(2025, 1, 3): 103.0},
        [date(2025, 1, 1), date(2025, 1, 2)],
    )

    assert filled == {}


def test_forward_fill_for_date_reports_stale_feature_metadata() -> None:
    result = forward_fill_for_date(
        {
            "dma_200": {date(2025, 1, 1): 95.0},
            "macro_fear_greed": {date(2025, 1, 2): {"score": 20.0}},
        },
        target_date=date(2025, 1, 3),
        asset="BTC",
        max_lag_days=3,
    )

    assert result is not None
    assert result.values == {
        "dma_200": 95.0,
        "macro_fear_greed": {"score": 20.0},
    }
    assert result.max_lag_days == 2
    assert [feature.feature_name for feature in result.stale_features] == [
        "dma_200",
        "macro_fear_greed",
    ]


def test_forward_fill_for_date_returns_none_when_feature_is_too_stale() -> None:
    assert (
        forward_fill_for_date(
            {"dma_200": {date(2025, 1, 1): 95.0}},
            target_date=date(2025, 1, 10),
            asset="BTC",
            max_lag_days=3,
        )
        is None
    )


def test_forward_fill_for_date_skips_future_sources() -> None:
    result = forward_fill_for_date(
        {
            "dma_200": {
                date(2025, 1, 2): 95.0,
                date(2025, 1, 4): 99.0,
            }
        },
        target_date=date(2025, 1, 3),
        asset="BTC",
        max_lag_days=3,
    )

    assert result is not None
    assert result.values["dma_200"] == pytest.approx(95.0)

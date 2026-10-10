from __future__ import annotations

from datetime import date

from src.services.backtesting.data.forward_fill import (
    _forward_fill_sorted_targets,
    forward_fill_daily,
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

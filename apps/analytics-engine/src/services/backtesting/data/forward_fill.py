"""Pure forward-fill helpers for stale market data — no I/O, easy to unit-test."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta
from typing import TypeVar

T = TypeVar("T")


def forward_fill_daily(
    sparse: dict[date, T],
    *,
    start_date: date,
    end_date: date,
) -> dict[date, T]:
    """Fill gaps across a dense inclusive date range."""
    day_count = (end_date - start_date).days + 1
    if day_count <= 0:
        return {}
    target_dates = (start_date + timedelta(days=offset) for offset in range(day_count))
    return _forward_fill_sorted_targets(sparse, target_dates)


def forward_fill_on_dates(
    sparse: dict[date, T],
    target_dates: Iterable[date],
) -> dict[date, T]:
    """Fill values only for the requested target dates."""
    return _forward_fill_sorted_targets(sparse, sorted(target_dates))


def _forward_fill_sorted_targets(
    sparse: dict[date, T],
    target_dates: Iterable[date],
) -> dict[date, T]:
    if not sparse:
        return {}

    sorted_source_dates = sorted(sparse)
    filled: dict[date, T] = {}
    last_value: T | None = None
    source_idx = 0

    for current_date in target_dates:
        while (
            source_idx < len(sorted_source_dates)
            and sorted_source_dates[source_idx] <= current_date
        ):
            last_value = sparse[sorted_source_dates[source_idx]]
            source_idx += 1
        if last_value is not None:
            filled[current_date] = last_value

    return filled

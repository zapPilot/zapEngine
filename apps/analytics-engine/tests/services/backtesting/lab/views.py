"""Hand-built days for the lab checks."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from src.services.backtesting.lab.days import DayView

START = date(2025, 1, 1)


def day(
    offset: int = 0,
    *,
    btc: float = 0.0,
    eth: float = 0.0,
    spy: float = 0.0,
    stable: float | None = None,
    transfers: tuple[tuple[str, str, float], ...] = (),
    details: dict[str, Any] | None = None,
    zones: dict[str, str | None] | None = None,
) -> DayView:
    """A day with the given weights (stable fills the rest) and market zones."""
    resolved_stable = 1.0 - btc - eth - spy if stable is None else stable
    return DayView(
        date=START + timedelta(days=offset),
        weights={
            "btc": btc,
            "eth": eth,
            "spy": spy,
            "stable": resolved_stable,
            "alt": 0.0,
        },
        transfers=transfers,
        details=details or {},
        zones={"spy": "above", "btc": "above", "eth": "above", **(zones or {})},
    )


def run(
    count: int,
    *,
    start: int = 0,
    **kwargs: Any,
) -> list[DayView]:
    return [day(start + offset, **kwargs) for offset in range(count)]

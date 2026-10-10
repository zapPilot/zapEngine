"""One strategy's days, seen next to the market it traded in.

The checks the lab runs (invariants, attribution) read a day's end-of-day
weights, the transfers it recorded, the decision's diagnostics and whether each
asset was above or below its 200-day average. This module builds that view from
an engine response and the bundle rows, so the checks themselves are plain
functions over data and can be tested without running an engine.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from src.models.backtesting import BacktestResponse
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)

RISK_ASSETS = ("spy", "btc", "eth")
_DMA_FEATURE = {
    "spy": SPY_DMA_200_FEATURE,
    "btc": DMA_200_FEATURE,
    "eth": ETH_DMA_200_FEATURE,
}


@dataclass(frozen=True)
class DayView:
    date: date
    # End-of-day weights after the day's fills: btc, eth, spy, stable, alt.
    weights: Mapping[str, float]
    # (from, to, amount_usd) the strategy recorded on this day (its decision).
    transfers: tuple[tuple[str, str, float], ...]
    # The decision's diagnostics (rule trace, cooldown skips, adjustments).
    details: Mapping[str, Any]
    # "above", "below" or "at" per risk asset; None when the market data lacks it.
    zones: Mapping[str, str | None]


def zones_for(row: Mapping[str, Any]) -> dict[str, str | None]:
    """Where each risk asset's price stood against its 200-day average."""
    prices = row.get("prices") or {}
    extra = row.get("extra_data") or {}
    zones: dict[str, str | None] = {}
    for asset in RISK_ASSETS:
        price = _positive(
            prices.get(asset, row.get("price") if asset == "btc" else None)
        )
        dma = _positive(extra.get(_DMA_FEATURE[asset]))
        if price is None or dma is None:
            zones[asset] = None
        elif price > dma:
            zones[asset] = "above"
        elif price < dma:
            zones[asset] = "below"
        else:
            zones[asset] = "at"
    return zones


def day_views(
    response: BacktestResponse,
    strategy_id: str,
    rows: Sequence[Mapping[str, Any]],
) -> list[DayView]:
    """Every recorded day of ``strategy_id``, joined to its market row."""
    rows_by_date = {row["date"]: row for row in rows}
    views: list[DayView] = []
    for point in response.timeline:
        state = point.strategies[strategy_id]
        row = rows_by_date.get(point.market.date, {})
        views.append(
            DayView(
                date=point.market.date,
                weights=state.portfolio.asset_allocation.model_dump(),
                transfers=tuple(
                    (item.from_bucket, item.to_bucket, item.amount_usd)
                    for item in state.execution.transfers
                ),
                details=state.decision.details,
                zones=zones_for(row),
            )
        )
    return views


def _positive(value: Any) -> float | None:
    """The value as a float when it is a positive number, else ``None``."""
    if isinstance(value, int | float) and not isinstance(value, bool) and value > 0:
        return float(value)
    return None


__all__ = ["DayView", "RISK_ASSETS", "day_views", "zones_for"]

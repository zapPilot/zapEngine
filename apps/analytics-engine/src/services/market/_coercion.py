"""Shared coercion utilities for market data services."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, cast


def coerce_dma_snapshot_date(raw_date: object) -> date:
    """Convert raw DMA row date into ``date``."""
    if isinstance(raw_date, datetime):
        return raw_date.date()
    if isinstance(raw_date, date):
        return raw_date
    if isinstance(raw_date, str):
        return date.fromisoformat(raw_date)
    raise ValueError(f"Invalid snapshot_date in DMA row: {raw_date!r}")


def coerce_positive_float(
    raw_value: object, snapshot_date: date, field_name: str
) -> float:
    """Convert a numeric field into a validated positive finite float."""
    try:
        numeric_value = float(cast(Any, raw_value))
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Invalid {field_name} value for {snapshot_date}: {raw_value!r}"
        ) from exc
    if numeric_value <= 0 or not numeric_value < float("inf"):
        raise ValueError(
            f"{field_name} must be positive for {snapshot_date}: {numeric_value}"
        )
    return numeric_value

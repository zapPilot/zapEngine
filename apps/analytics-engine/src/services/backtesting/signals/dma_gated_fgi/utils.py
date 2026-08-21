"""Shared helpers for DMA signal runtime implementations."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from src.services.backtesting.signals.dma_gated_fgi.types import (
    BlockedZone,
    CrossEvent,
    Zone,
)


def _try_parse_float(raw_value: Any) -> float | None:
    """Parse a raw value to float, returning None on failure or invalid values."""
    if raw_value is None:
        return None
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    return value


def extract_non_negative_numeric(
    extra_data: Mapping[str, Any], key: str
) -> float | None:
    """Extract and sanitize a non-negative numeric value from extra data."""
    value = _try_parse_float(extra_data.get(key))
    if value is None:
        return None
    return max(0.0, value)


def extract_fgi_value(sentiment: Mapping[str, Any] | None) -> float | None:
    """Extract and sanitize Fear & Greed Index value to [0, 100]."""
    value = _try_parse_float(sentiment.get("value") if sentiment else None)
    if value is None:
        return None
    return max(0.0, min(100.0, value))


def zone_entered_by(cross_event: CrossEvent) -> BlockedZone:
    """Return the zone entered by a directional cross."""
    return "below" if cross_event == "cross_down" else "above"


def zone_exited_by(cross_event: CrossEvent) -> BlockedZone:
    """Return the zone exited by a directional cross."""
    return "above" if cross_event == "cross_down" else "below"


def detect_zone_cross(
    *,
    previous_zone: Zone | None,
    current_zone: Zone | None,
    cross_on_touch: bool = True,
) -> CrossEvent | None:
    """Detect a directional transition between DMA zones."""
    if previous_zone is None or current_zone is None:
        return None
    down_zones = {"at", "below"} if cross_on_touch else {"below"}
    up_zones = {"at", "above"} if cross_on_touch else {"above"}
    if previous_zone == "above" and current_zone in down_zones:
        return "cross_down"
    if previous_zone == "below" and current_zone in up_zones:
        return "cross_up"
    return None

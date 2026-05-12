"""Shared helpers for DMA signal runtime implementations."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from src.services.backtesting.signals.dma_gated_fgi.types import BlockedZone, CrossEvent


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


def _cross_target_zone(cross_event: CrossEvent) -> BlockedZone:
    """Return target zone based on cross event direction."""
    return "below" if cross_event == "cross_down" else "above"

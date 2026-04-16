"""Shared helpers for DMA signal runtime implementations."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from src.services.backtesting.signals.dma_gated_fgi.types import BlockedZone, CrossEvent


def extract_non_negative_numeric(
    extra_data: Mapping[str, Any], key: str
) -> float | None:
    """Extract and sanitize a non-negative numeric value from extra data."""
    raw_value = extra_data.get(key)
    if raw_value is None:
        return None

    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None

    if math.isnan(value) or math.isinf(value):
        return None

    return max(0.0, value)


def extract_fgi_value(sentiment: Mapping[str, Any] | None) -> float | None:
    """Extract and sanitize Fear & Greed Index value to [0, 100]."""
    if sentiment is None:
        return None

    raw_value = sentiment.get("value")
    if raw_value is None:
        return None

    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None

    if math.isnan(value) or math.isinf(value):
        return None

    return max(0.0, min(100.0, value))


def _cross_target_zone(cross_event: CrossEvent) -> BlockedZone:
    """Return target zone based on cross event direction."""
    return "below" if cross_event == "cross_down" else "above"

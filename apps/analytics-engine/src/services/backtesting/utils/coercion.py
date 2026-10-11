"""Shared type coercion and normalization utilities for the backtesting module."""

from __future__ import annotations

from datetime import date

from src.core.utils import normalize_date


def coerce_to_date(raw: object) -> date | None:
    """Coerce a datetime, date, or ISO-8601 string to a date object."""
    value = raw[:10] if isinstance(raw, str) else raw
    return normalize_date(value, nullable=True)

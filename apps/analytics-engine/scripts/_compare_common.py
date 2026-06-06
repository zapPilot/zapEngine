"""Shared constants and leaf helpers for compare-v3 diagnostics tooling."""

from __future__ import annotations

import math
from datetime import date
from typing import Any

ASSET_KEYS = frozenset({"btc", "eth", "spy", "stable", "alt"})
CONSTRAINT_EPSILON = 1e-6


class VerificationError(ValueError):
    """Raised when compare-payload tooling encounters invalid data."""


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise VerificationError(
            f"Invalid date '{value}'. Expected YYYY-MM-DD."
        ) from exc


def _format_float(value: Any, digits: int = 6) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "n/a"


def _format_pct(value: Any, digits: int = 2) -> str:
    try:
        return f"{float(value) * 100.0:.{digits}f}%"
    except (TypeError, ValueError):
        return "n/a"


def _safe_float(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(numeric) or math.isinf(numeric):
        return None
    return numeric


def _safe_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}

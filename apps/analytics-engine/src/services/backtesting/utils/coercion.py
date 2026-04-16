"""Shared type coercion and normalization utilities for the backtesting module."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any, Protocol


class Coercer(Protocol):
    """A coercion function: (value, *, field_name) -> coerced."""

    def __call__(self, value: Any, *, field_name: str) -> Any: ...


def normalize_regime_label(label: str) -> str:
    """Normalize a sentiment regime label to snake_case."""
    return label.lower().strip().replace(" ", "_")


def coerce_to_date(raw: object) -> date | None:
    """Coerce a datetime, date, or ISO-8601 string to a date object."""
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    if isinstance(raw, str):
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None
    return None


def coerce_int(value: Any, *, field_name: str) -> int:
    """Coerce a value to int, rejecting booleans and non-integer floats."""
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raise ValueError(f"{field_name} must be an integer")


def coerce_float(value: Any, *, field_name: str) -> float:
    """Coerce a value to float, rejecting booleans and non-numeric types."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"{field_name} must be a number")
    return float(value)


def coerce_bool(value: Any, *, field_name: str) -> bool:
    """Validate a value is a boolean."""
    if not isinstance(value, bool):
        raise ValueError(f"{field_name} must be a boolean")
    return value


def coerce_float_list(value: Any, *, field_name: str) -> list[float]:
    """Coerce a list of values to a list of floats."""
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be an array of numbers")
    return [coerce_float(item, field_name=field_name) for item in value]


def coerce_params(
    raw: Mapping[str, Any],
    spec: Mapping[str, Coercer],
    *,
    prefix: str = "",
) -> dict[str, Any]:
    """Coerce present keys in *raw* according to a {field_name: coercer} spec.

    Only keys that exist in *raw* are coerced; missing keys are skipped.
    *prefix* is prepended to the field_name passed to each coercer for
    error messages (e.g. ``"signal."``).
    """
    result: dict[str, Any] = {}
    for key, coercer in spec.items():
        if key in raw:
            result[key] = coercer(raw[key], field_name=f"{prefix}{key}")
    return result


def coerce_nullable_int(value: Any, *, field_name: str) -> int | None:
    """Coerce a value to int, allowing None pass-through."""
    if value is None:
        return None
    return coerce_int(value, field_name=field_name)

"""Shared helpers for attribution scripts."""

from __future__ import annotations

from typing import Any, overload

MetricValue = float | int


class _Missing:
    pass


_MISSING = _Missing()


@overload
def _metric(
    summary: dict[str, Any],
    key: str,
    *,
    round_digits: int | None = None,
    integer_keys: tuple[str, ...] = (),
) -> MetricValue: ...


@overload
def _metric(
    summary: dict[str, Any],
    key: str,
    *,
    default: MetricValue | None,
    round_digits: int | None = None,
    integer_keys: tuple[str, ...] = (),
) -> MetricValue | None: ...


def _metric(
    summary: dict[str, Any],
    key: str,
    *,
    default: MetricValue | None | _Missing = _MISSING,
    round_digits: int | None = None,
    integer_keys: tuple[str, ...] = (),
) -> MetricValue | None:
    value = summary.get(key)
    if not isinstance(value, int | float):
        if default is _MISSING:
            raise ValueError(f"Strategy summary missing numeric metric '{key}'")
        return default
    if key in integer_keys:
        return int(value)
    if round_digits is not None:
        return round(float(value), round_digits)
    return value


def _first_metric(
    summary: dict[str, Any],
    keys: tuple[str, ...],
) -> MetricValue | None:
    for key in keys:
        value = _metric(summary, key, default=None)
        if value is not None:
            return value
    return None


__all__ = ["_first_metric", "_metric"]

"""Canonical target-allocation helpers for backtesting execution."""

from __future__ import annotations

from collections.abc import Mapping
from math import isfinite

TARGET_ASSET_KEYS = ("btc", "eth", "spy", "stable", "alt")
TRADEABLE_TARGET_KEYS = ("btc", "eth", "spy", "stable")
_TARGET_KEY_SET = frozenset(TARGET_ASSET_KEYS)
_EPSILON = 1e-12


def _coerce_non_negative(raw: Mapping[str, float], key: str) -> float:
    value = float(raw.get(key, 0.0))
    if not isfinite(value):
        raise ValueError("target allocation must contain finite weights")
    return max(0.0, value)


def _normalize_tradeable(values: Mapping[str, float]) -> dict[str, float]:
    cleaned = {key: _coerce_non_negative(values, key) for key in TRADEABLE_TARGET_KEYS}
    scale = max(cleaned.values())
    if scale <= 0.0:
        return {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    # Scale first so finite inputs cannot overflow when their weights are summed.
    scaled = {key: cleaned[key] / scale for key in TRADEABLE_TARGET_KEYS}
    total = sum(scaled.values())
    normalized = {key: scaled[key] / total for key in TRADEABLE_TARGET_KEYS}
    for key, value in tuple(normalized.items()):
        if abs(value) < _EPSILON:
            normalized[key] = 0.0
    # Four normalized weights sum to one, so at least one is >= 0.25.
    # Removing weights below 1e-12 cannot erase every tradeable weight.
    total = sum(normalized.values())
    return {
        "btc": normalized["btc"] / total,
        "eth": normalized["eth"] / total,
        "spy": normalized["spy"] / total,
        "stable": normalized["stable"] / total,
        "alt": 0.0,
    }


def normalize_target_allocation(
    raw: Mapping[str, float] | None,
) -> dict[str, float]:
    """Normalize a canonical tradeable target.

    Targets are intentionally narrower than display allocations: ``alt`` may be
    present only as zero, and legacy ``spot`` is rejected instead of inferred.
    """

    if raw is None:
        return {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    unknown_keys = set(raw) - _TARGET_KEY_SET
    if unknown_keys:
        raise ValueError(
            "target allocation contains unsupported buckets: "
            + ", ".join(sorted(unknown_keys))
        )
    alt = _coerce_non_negative(raw, "alt")
    if alt > _EPSILON:
        raise ValueError("target allocation cannot allocate to alt")
    return _normalize_tradeable(raw)


def target_from_current_allocation(
    raw: Mapping[str, float] | None,
) -> dict[str, float]:
    """Build a target-safe allocation from current/display asset allocation."""

    if raw is None:
        return normalize_target_allocation(None)
    cleaned = {key: _coerce_non_negative(raw, key) for key in TARGET_ASSET_KEYS}
    scale = max(cleaned.values())
    if scale > 0.0:
        cleaned = {key: value / scale for key, value in cleaned.items()}
    return _normalize_tradeable(
        {
            "btc": cleaned["btc"],
            "eth": cleaned["eth"],
            "spy": cleaned["spy"],
            "stable": cleaned["stable"] + cleaned["alt"],
        }
    )


__all__ = [
    "TARGET_ASSET_KEYS",
    "TRADEABLE_TARGET_KEYS",
    "normalize_target_allocation",
    "target_from_current_allocation",
]

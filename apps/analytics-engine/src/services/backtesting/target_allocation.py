"""Canonical target-allocation helpers for backtesting execution."""

from __future__ import annotations

from collections.abc import Mapping

TARGET_ASSET_KEYS = ("btc", "eth", "spy", "stable", "alt")
TRADEABLE_TARGET_KEYS = ("btc", "eth", "spy", "stable")
_TARGET_KEY_SET = frozenset(TARGET_ASSET_KEYS)
_EPSILON = 1e-12


def _coerce_non_negative(raw: Mapping[str, float], key: str) -> float:
    return max(0.0, float(raw.get(key, 0.0)))


def _normalize_tradeable(values: Mapping[str, float]) -> dict[str, float]:
    cleaned = {key: _coerce_non_negative(values, key) for key in TRADEABLE_TARGET_KEYS}
    total = sum(cleaned.values())
    if total <= 0.0:
        return {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    normalized = {key: cleaned[key] / total for key in TRADEABLE_TARGET_KEYS}
    for key, value in tuple(normalized.items()):
        if abs(value) < _EPSILON:
            normalized[key] = 0.0
    total = sum(normalized.values())
    if total <= 0.0:
        return {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
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
    stable_with_alt = _coerce_non_negative(raw, "stable") + _coerce_non_negative(
        raw, "alt"
    )
    return _normalize_tradeable(
        {
            "btc": _coerce_non_negative(raw, "btc"),
            "eth": _coerce_non_negative(raw, "eth"),
            "spy": _coerce_non_negative(raw, "spy"),
            "stable": stable_with_alt,
        }
    )


__all__ = [
    "TARGET_ASSET_KEYS",
    "TRADEABLE_TARGET_KEYS",
    "normalize_target_allocation",
    "target_from_current_allocation",
]

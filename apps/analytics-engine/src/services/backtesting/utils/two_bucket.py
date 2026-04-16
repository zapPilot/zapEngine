"""Helpers for the current two-bucket backtesting runtime."""

from __future__ import annotations

_RUNTIME_DEFAULT: dict[str, float] = {"spot": 0.0, "stable": 1.0}
_RUNTIME_EPSILON = 1e-12


def normalize_runtime_allocation(raw: dict[str, float]) -> dict[str, float]:
    """Normalize a runtime two-bucket allocation into spot/stable weights."""
    spot = max(0.0, float(raw.get("spot", 0.0)))
    stable = max(0.0, float(raw.get("stable", 0.0)))
    total = spot + stable
    if total <= 0.0:
        return dict(_RUNTIME_DEFAULT)
    return {
        "spot": spot / total,
        "stable": stable / total,
    }


def sanitize_runtime_allocation(raw: dict[str, float]) -> dict[str, float]:
    """Clamp tiny or negative runtime allocation residue before normalization."""
    spot = float(raw.get("spot", 0.0))
    stable = float(raw.get("stable", 0.0))

    if abs(spot) < _RUNTIME_EPSILON:
        spot = 0.0
    if abs(stable) < _RUNTIME_EPSILON:
        stable = 0.0

    if spot < 0.0:
        spot = 0.0
    if stable < 0.0:
        stable = 0.0

    return normalize_runtime_allocation({"spot": spot, "stable": stable})


def calculate_runtime_allocation(
    *,
    spot_value: float,
    stable_value: float,
) -> dict[str, float]:
    """Calculate a normalized runtime allocation from valued balances."""
    return sanitize_runtime_allocation(
        {"spot": float(spot_value), "stable": float(stable_value)}
    )

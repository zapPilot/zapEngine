"""Shared asset-allocation serialization helpers for backtesting surfaces."""

from __future__ import annotations

from collections.abc import Mapping

from src.models.backtesting import AssetAllocation

_DEFAULT_ASSET_ALLOCATION = {
    "btc": 0.0,
    "eth": 0.0,
    "spy": 0.0,
    "stable": 1.0,
    "alt": 0.0,
}


def serialize_asset_allocation(raw: Mapping[str, float] | None) -> AssetAllocation:
    values = _DEFAULT_ASSET_ALLOCATION if raw is None else raw
    return AssetAllocation(
        btc=float(values.get("btc", 0.0)),
        eth=float(values.get("eth", 0.0)),
        spy=float(values.get("spy", 0.0)),
        stable=float(values.get("stable", 0.0)),
        alt=float(values.get("alt", 0.0)),
    )


__all__ = [
    "serialize_asset_allocation",
]

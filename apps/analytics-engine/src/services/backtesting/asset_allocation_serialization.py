"""Shared asset-allocation serialization helpers for backtesting surfaces."""

from __future__ import annotations

from collections.abc import Mapping

from src.models.backtesting import AssetAllocation, SpotAssetType

_DEFAULT_ASSET_ALLOCATION = {
    "btc": 0.0,
    "eth": 0.0,
    "stable": 1.0,
    "alt": 0.0,
}

_EXPLICIT_ASSET_KEYS = frozenset({"btc", "eth", "alt"})


def normalize_spot_asset(asset: str | None) -> SpotAssetType:
    normalized = str(asset or "").strip().upper()
    return "ETH" if normalized == "ETH" else "BTC"


def serialize_asset_allocation(raw: Mapping[str, float] | None) -> AssetAllocation:
    values = _DEFAULT_ASSET_ALLOCATION if raw is None else raw
    return AssetAllocation(
        btc=float(values.get("btc", 0.0)),
        eth=float(values.get("eth", 0.0)),
        stable=float(values.get("stable", 0.0)),
        alt=float(values.get("alt", 0.0)),
    )


def aggregate_to_asset_allocation(
    *,
    spot: float,
    stable: float,
    primary_asset: str | None,
) -> AssetAllocation:
    normalized_primary_asset = normalize_spot_asset(primary_asset)
    bucket = "eth" if normalized_primary_asset == "ETH" else "btc"
    asset_allocation = {
        "btc": 0.0,
        "eth": 0.0,
        "stable": max(0.0, float(stable)),
        "alt": 0.0,
    }
    asset_allocation[bucket] = max(0.0, float(spot))
    total = sum(asset_allocation.values())
    if total <= 0.0:
        return serialize_asset_allocation(None)
    return serialize_asset_allocation(
        {key: value / total for key, value in asset_allocation.items()}
    )


def serialize_target_asset_allocation(
    raw: Mapping[str, float] | None,
    *,
    target_spot_asset: str | None,
) -> AssetAllocation:
    if raw is None:
        return serialize_asset_allocation(None)

    raw_keys = set(raw)
    if "spot" not in raw_keys or raw_keys & _EXPLICIT_ASSET_KEYS:
        return serialize_asset_allocation(raw)

    return aggregate_to_asset_allocation(
        spot=float(raw.get("spot", 0.0)),
        stable=float(raw.get("stable", 0.0)),
        primary_asset=target_spot_asset,
    )


__all__ = [
    "aggregate_to_asset_allocation",
    "normalize_spot_asset",
    "serialize_asset_allocation",
    "serialize_target_asset_allocation",
]

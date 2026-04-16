"""Edge-case tests for shared asset-allocation serialization."""

from __future__ import annotations

from src.services.backtesting.asset_allocation_serialization import (
    aggregate_to_asset_allocation,
    normalize_spot_asset,
    serialize_asset_allocation,
    serialize_target_asset_allocation,
)


def test_serialize_asset_allocation_none_defaults_to_all_stable() -> None:
    result = serialize_asset_allocation(None)
    assert result.btc == 0.0
    assert result.eth == 0.0
    assert result.stable == 1.0
    assert result.alt == 0.0


def test_serialize_asset_allocation_with_data() -> None:
    result = serialize_asset_allocation(
        {"btc": 0.5, "eth": 0.3, "stable": 0.2, "alt": 0.0}
    )
    assert result.btc == 0.5
    assert result.eth == 0.3
    assert result.stable == 0.2
    assert result.alt == 0.0


def test_aggregate_to_asset_allocation_maps_btc_target() -> None:
    result = aggregate_to_asset_allocation(
        spot=0.6,
        stable=0.4,
        primary_asset="BTC",
    )
    assert result.btc == 0.6
    assert result.eth == 0.0
    assert result.stable == 0.4
    assert result.alt == 0.0


def test_aggregate_to_asset_allocation_maps_eth_target() -> None:
    result = aggregate_to_asset_allocation(
        spot=0.6,
        stable=0.4,
        primary_asset="ETH",
    )
    assert result.btc == 0.0
    assert result.eth == 0.6
    assert result.stable == 0.4
    assert result.alt == 0.0


def test_aggregate_to_asset_allocation_zero_total_defaults_to_all_stable() -> None:
    result = aggregate_to_asset_allocation(
        spot=0.0,
        stable=0.0,
        primary_asset="BTC",
    )
    assert result.btc == 0.0
    assert result.eth == 0.0
    assert result.stable == 1.0
    assert result.alt == 0.0


def test_serialize_target_asset_allocation_preserves_explicit_asset_map() -> None:
    result = serialize_target_asset_allocation(
        {"btc": 0.2, "eth": 0.3, "stable": 0.4, "alt": 0.1},
        target_spot_asset="BTC",
    )
    assert result.btc == 0.2
    assert result.eth == 0.3
    assert result.stable == 0.4
    assert result.alt == 0.1


def test_serialize_target_asset_allocation_maps_aggregate_spot_to_target_asset() -> (
    None
):
    result = serialize_target_asset_allocation(
        {"spot": 0.6, "stable": 0.4},
        target_spot_asset="ETH",
    )
    assert result.btc == 0.0
    assert result.eth == 0.6
    assert result.stable == 0.4
    assert result.alt == 0.0


def test_normalize_spot_asset_defaults_unknown_values_to_btc() -> None:
    assert normalize_spot_asset("eth") == "ETH"
    assert normalize_spot_asset("doge") == "BTC"
    assert normalize_spot_asset(None) == "BTC"

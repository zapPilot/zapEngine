"""Edge-case tests for shared asset-allocation serialization."""

from __future__ import annotations

from src.services.backtesting.asset_allocation_serialization import (
    serialize_asset_allocation,
)


def test_serialize_asset_allocation_none_defaults_to_all_stable() -> None:
    result = serialize_asset_allocation(None)
    assert result.btc == 0.0
    assert result.eth == 0.0
    assert result.spy == 0.0
    assert result.stable == 1.0
    assert result.alt == 0.0


def test_serialize_asset_allocation_with_data() -> None:
    result = serialize_asset_allocation(
        {"btc": 0.5, "eth": 0.3, "stable": 0.2, "alt": 0.0}
    )
    assert result.btc == 0.5
    assert result.eth == 0.3
    assert result.spy == 0.0
    assert result.stable == 0.2
    assert result.alt == 0.0


def test_serialize_asset_allocation_passes_spy_through() -> None:
    result = serialize_asset_allocation(
        {"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0}
    )
    assert result.btc == 0.0
    assert result.eth == 0.0
    assert result.spy == 1.0
    assert result.stable == 0.0
    assert result.alt == 0.0


def test_serialize_asset_allocation_spy_and_alt_are_independent() -> None:
    result = serialize_asset_allocation(
        {"btc": 0.4, "eth": 0.0, "spy": 0.3, "stable": 0.2, "alt": 0.1}
    )
    assert result.btc == 0.4
    assert result.eth == 0.0
    assert result.spy == 0.3
    assert result.stable == 0.2
    assert result.alt == 0.1

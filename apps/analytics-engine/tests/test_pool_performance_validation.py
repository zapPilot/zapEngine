"""Integration tests for pool performance validation.

Tests that Pydantic validators correctly catch data integrity issues:
- UUID format validation (snapshot_id only - protocol_id is a name string)
- Array uniqueness validation (snapshot_ids, pool_symbols)
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.models.portfolio import PoolDetail


class TestPoolDetailUUIDValidation:
    """Test UUID format validation for pool detail identifiers."""

    def test_valid_uuid_format_passes(self) -> None:
        """Valid UUID format for snapshot_id should pass validation."""
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            protocol_id="aave-v3",  # protocol_id is a name string, not UUID
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            contribution_to_portfolio=50.0,
        )
        assert pool.snapshot_id is not None
        assert pool.protocol_id == "aave-v3"

    def test_invalid_snapshot_id_format_fails(self) -> None:
        """Invalid UUID format in snapshot_id should raise ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            PoolDetail(
                wallet="0xtest",
                snapshot_id="not-a-uuid",  # Invalid UUID format
                protocol_id=str(uuid4()),
                chain="ethereum",
                protocol="aave-v3",
                protocol_name="Aave V3",
                asset_usd_value=1000.0,
                contribution_to_portfolio=50.0,
            )

        error_msg = str(exc_info.value)
        assert "Invalid UUID format" in error_msg
        assert "not-a-uuid" in error_msg

    def test_protocol_id_accepts_name_strings(self) -> None:
        """protocol_id accepts protocol name strings (not UUID validated).

        Protocol IDs are human-readable names like 'aave v3', 'morpho', 'merkl'
        etc. - they are NOT UUIDs. This was fixed because production data uses
        protocol names as identifiers.
        """
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            protocol_id="aave v3",  # Protocol name, NOT UUID
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            contribution_to_portfolio=50.0,
        )
        # Verify protocol_id accepts any string
        assert pool.protocol_id == "aave v3"

    def test_invalid_snapshot_id_with_valid_protocol_name_fails(self) -> None:
        """Invalid snapshot_id UUID should fail even with valid protocol name."""
        with pytest.raises(ValidationError) as exc_info:
            PoolDetail(
                wallet="0xtest",
                snapshot_id="bad-snapshot",  # Invalid UUID
                protocol_id="morpho",  # Valid protocol name string
                chain="ethereum",
                protocol="aave-v3",
                protocol_name="Aave V3",
                asset_usd_value=1000.0,
                contribution_to_portfolio=50.0,
            )

        error_msg = str(exc_info.value)
        assert "Invalid UUID format" in error_msg
        # Should fail on snapshot_id (only field with UUID validation)
        assert "bad-snapshot" in error_msg


class TestPoolDetailArrayUniquenessValidation:
    """Test array uniqueness validation for snapshot_ids and pool_symbols."""

    def test_unique_snapshot_ids_passes(self) -> None:
        """Unique snapshot_ids array should pass validation."""
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            snapshot_ids=[str(uuid4()), str(uuid4()), str(uuid4())],
            protocol_id="compound",  # Protocol name string
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            pool_symbols=["USDC", "WETH"],
            contribution_to_portfolio=50.0,
        )
        assert len(pool.snapshot_ids) == 3
        assert len(set(pool.snapshot_ids)) == 3

    def test_duplicate_snapshot_ids_fails(self) -> None:
        """Duplicate snapshot_ids should raise ValidationError."""
        duplicate_id = str(uuid4())
        with pytest.raises(ValidationError) as exc_info:
            PoolDetail(
                wallet="0xtest",
                snapshot_id=str(uuid4()),
                snapshot_ids=[duplicate_id, str(uuid4()), duplicate_id],  # Duplicate
                protocol_id="merkl",  # Protocol name string
                chain="ethereum",
                protocol="aave-v3",
                protocol_name="Aave V3",
                asset_usd_value=1000.0,
                contribution_to_portfolio=50.0,
            )

        error_msg = str(exc_info.value)
        assert "snapshot_ids must be unique" in error_msg
        assert duplicate_id in error_msg

    def test_unique_pool_symbols_passes(self) -> None:
        """Unique pool_symbols array should pass validation."""
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            protocol_id="gmx v2",  # Protocol name string
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            pool_symbols=["USDC", "WETH", "WBTC"],
            contribution_to_portfolio=50.0,
        )
        assert len(pool.pool_symbols) == 3
        assert len(set(pool.pool_symbols)) == 3

    def test_duplicate_pool_symbols_fails(self) -> None:
        """Duplicate pool_symbols should raise ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            PoolDetail(
                wallet="0xtest",
                snapshot_id=str(uuid4()),
                protocol_id="pendle v2",  # Protocol name string
                chain="ethereum",
                protocol="aave-v3",
                protocol_name="Aave V3",
                asset_usd_value=1000.0,
                pool_symbols=["USDC", "WETH", "USDC"],  # Duplicate USDC
                contribution_to_portfolio=50.0,
            )

        error_msg = str(exc_info.value)
        assert "pool_symbols must be unique" in error_msg
        assert "USDC" in error_msg

    def test_empty_snapshot_ids_passes(self) -> None:
        """Empty snapshot_ids array should pass (edge case)."""
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            snapshot_ids=[],  # Empty array
            protocol_id="radiant capital v2",  # Protocol name string
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            contribution_to_portfolio=50.0,
        )
        assert pool.snapshot_ids == []

    def test_empty_pool_symbols_passes(self) -> None:
        """Empty pool_symbols array should pass (edge case)."""
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            protocol_id="ether.fi",  # Protocol name string
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            pool_symbols=[],  # Empty array
            contribution_to_portfolio=50.0,
        )
        assert pool.pool_symbols == []

    def test_single_element_arrays_pass(self) -> None:
        """Single-element arrays should pass (no duplicates possible)."""
        pool = PoolDetail(
            wallet="0xtest",
            snapshot_id=str(uuid4()),
            snapshot_ids=[str(uuid4())],  # Single element
            protocol_id="balancer v2",  # Protocol name string
            chain="ethereum",
            protocol="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=1000.0,
            pool_symbols=["USDC"],  # Single element
            contribution_to_portfolio=50.0,
        )
        assert len(pool.snapshot_ids) == 1
        assert len(pool.pool_symbols) == 1

    def test_large_array_with_duplicates_fails(self) -> None:
        """Large arrays with duplicates should fail efficiently."""
        # Create large array with duplicate in the middle
        large_ids = [str(uuid4()) for _ in range(50)]
        duplicate_id = large_ids[25]
        large_ids.append(duplicate_id)  # Add duplicate at end

        with pytest.raises(ValidationError) as exc_info:
            PoolDetail(
                wallet="0xtest",
                snapshot_id=str(uuid4()),
                snapshot_ids=large_ids,
                protocol_id="hyperliquid",  # Protocol name string
                chain="ethereum",
                protocol="aave-v3",
                protocol_name="Aave V3",
                asset_usd_value=1000.0,
                contribution_to_portfolio=50.0,
            )

        error_msg = str(exc_info.value)
        assert "snapshot_ids must be unique" in error_msg
        assert duplicate_id in error_msg

"""
Pool Performance Aggregator - Cross-Wallet Pool Aggregation

Centralizes pool aggregation logic for cross-wallet position consolidation,
following the specialized service architecture pattern.

This aggregator consolidates pool positions from multiple wallets by grouping
on (protocol, chain, pool_symbols) and tracking contribution metrics.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class PoolPositionData:
    """
    Immutable value object representing a pool position from query results.

    Attributes:
        protocol_id: Normalized protocol identifier
        protocol_name: Display name for the protocol
        chain: Blockchain network name
        wallet: Wallet address holding this position
        asset_usd_value: USD value of assets in this position
        contribution_to_portfolio: Percentage contribution to total portfolio
        pool_symbols: List of token symbols in this pool
        snapshot_id: Primary snapshot identifier
        snapshot_ids: List of all snapshot IDs for this position
    """

    protocol_id: str
    protocol_name: str
    chain: str
    wallet: str
    asset_usd_value: float
    contribution_to_portfolio: float
    pool_symbols: list[str]
    snapshot_id: str | None
    snapshot_ids: list[str] | None

    @property
    def pool_symbols_key(self) -> tuple[str, ...]:
        """Normalized pool symbols key for grouping (sorted tuple)."""
        return tuple(sorted(self.pool_symbols))

    @property
    def grouping_key(self) -> tuple[str, str, tuple[str, ...]]:
        """
        Aggregation key for cross-wallet grouping.

        Returns:
            Tuple of (protocol_id.lower(), chain.lower(), sorted_pool_symbols)
        """
        return (
            self.protocol_id.lower(),
            self.chain.lower(),
            self.pool_symbols_key,
        )


@dataclass
class AggregatedPoolPosition:
    """
    Mutable accumulator for pool position aggregation.

    Accumulates multiple positions for the same pool across wallets,
    tracking values and metadata.

    Attributes:
        protocol_id: Protocol identifier
        protocol_name: Protocol display name
        chain: Blockchain network
        pool_symbols_key: Sorted tuple of pool symbols
        wallets: List of contributing wallet addresses
        primary_wallet: First wallet (for compatibility)
        asset_usd_value: Aggregated USD value
        contribution_to_portfolio: Aggregated portfolio contribution
        snapshot_id: Primary snapshot identifier
        snapshot_ids: Consolidated list of snapshot IDs
        snapshot_ids_present: Whether snapshot_ids field was in source data
    """

    protocol_id: str
    protocol_name: str
    chain: str
    pool_symbols_key: tuple[str, ...]

    # Wallet tracking
    wallets: list[str] = field(default_factory=list)
    primary_wallet: str | None = None

    # Value aggregation
    asset_usd_value: float = 0.0
    contribution_to_portfolio: float = 0.0

    # Snapshot tracking
    snapshot_id: str | None = None
    snapshot_ids: list[str] = field(default_factory=list)
    snapshot_ids_present: bool = False

    def add_position(self, position: PoolPositionData) -> None:
        """
        Add a position to this aggregated pool.

        Updates all accumulator fields including wallets, values, weighted APR
        components, and snapshot IDs.

        Args:
            position: Pool position to add to aggregation
        """
        # Track wallets
        if position.wallet not in self.wallets:
            self.wallets.append(position.wallet)
        if self.primary_wallet is None:
            self.primary_wallet = position.wallet

        # Aggregate values
        self.asset_usd_value += position.asset_usd_value
        self.contribution_to_portfolio += position.contribution_to_portfolio

        # Aggregate snapshot IDs
        self._aggregate_snapshots(position)

    def _aggregate_snapshots(self, position: PoolPositionData) -> None:
        """
        Aggregate snapshot IDs from position.

        Handles both snapshot_id (singular) and snapshot_ids (list) fields,
        maintaining backward compatibility with different query formats.

        Args:
            position: Pool position with snapshot data
        """
        if position.snapshot_ids is not None:
            self.snapshot_ids_present = True
            for sid in position.snapshot_ids:
                if sid and sid not in self.snapshot_ids:
                    self.snapshot_ids.append(sid)

            # Set primary snapshot_id if not set
            if self.snapshot_id is None and position.snapshot_ids:
                self.snapshot_id = position.snapshot_ids[0]
            elif self.snapshot_id is None and position.snapshot_id:
                self.snapshot_id = position.snapshot_id  # pragma: no cover
        elif self.snapshot_id is None and position.snapshot_id:
            self.snapshot_id = position.snapshot_id

        # Preserve snapshot IDs even with singular snapshot_id column
        if (
            position.snapshot_ids is None
            and position.snapshot_id
            and position.snapshot_id not in self.snapshot_ids
            and self.snapshot_ids_present
        ):
            self.snapshot_ids.append(position.snapshot_id)  # pragma: no cover

    def to_dict(self) -> dict[str, Any]:
        """
        Convert to dictionary for API response.

        Returns:
            Dictionary matching PoolDetail API contract with all required fields
        """
        return {
            "wallet": self.primary_wallet,
            "protocol_id": self.protocol_id,
            "protocol": self.protocol_id,
            "protocol_name": self.protocol_name,
            "chain": self.chain,
            "asset_usd_value": self.asset_usd_value,
            "pool_symbols": list(self.pool_symbols_key),
            "contribution_to_portfolio": self.contribution_to_portfolio,
            "snapshot_id": self.snapshot_id,
            "snapshot_ids": (
                list(self.snapshot_ids) if self.snapshot_ids_present else None
            ),
        }


class PoolPerformanceAggregator:
    """
    Aggregator for pool performance data across wallets.

    Consolidates pool positions from multiple wallets by grouping on
    (protocol, chain, pool_symbols) and summing contribution metrics.

    Follows immutable data patterns with value objects for input data
    and mutable accumulators for aggregation state.

    Example:
        >>> aggregator = PoolPerformanceAggregator()
        >>> raw_results = query_service.execute_query(db, "get_pool_performance")
        >>> aggregated = aggregator.aggregate_positions(raw_results)
        >>> # Returns list of dicts ready for API response and caching
    """

    @staticmethod
    def parse_position(row: dict[str, Any]) -> PoolPositionData:
        """
        Parse raw query row into immutable PoolPositionData value object.

        Normalizes snapshot IDs, pool symbols, and handles null values.

        Args:
            row: Raw query result dictionary from SQL query

        Returns:
            PoolPositionData value object with normalized fields

        Raises:
            KeyError: If required fields are missing
            ValueError: If data types cannot be coerced

        Example:
            >>> row = {
            ...     "protocol_id": "aave-v3",
            ...     "protocol_name": "Aave V3",
            ...     "chain": "ethereum",
            ...     "wallet": "0x123...",
            ...     "asset_usd_value": 1000.0,
            ...     "pool_symbols": ["USDC"],
            ...     "snapshot_id": "snap_001",
            ...     "snapshot_ids": ["snap_001"],
            ...     "contribution_to_portfolio": 10.0,
            ... }
            >>> position = PoolPerformanceAggregator.parse_position(row)
            >>> position.protocol_id
            'aave-v3'
        """
        snapshot_id_value = row.get("snapshot_id")
        normalized_snapshot_id = (
            str(snapshot_id_value) if snapshot_id_value is not None else None
        )

        snapshot_ids_field = row.get("snapshot_ids")
        normalized_snapshot_ids = (
            [str(sid) for sid in snapshot_ids_field if sid is not None]
            if snapshot_ids_field is not None
            else None
        )

        pool_symbols = [str(symbol) for symbol in row.get("pool_symbols") or []]

        return PoolPositionData(
            protocol_id=str(row["protocol_id"]),
            protocol_name=row["protocol_name"],
            chain=str(row["chain"]),
            wallet=str(row["wallet"]),
            asset_usd_value=float(row["asset_usd_value"]),
            contribution_to_portfolio=float(row.get("contribution_to_portfolio", 0.0)),
            pool_symbols=pool_symbols,
            snapshot_id=normalized_snapshot_id,
            snapshot_ids=normalized_snapshot_ids,
        )

    @classmethod
    def aggregate_positions(
        cls, positions: Iterable[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Aggregate pool positions across wallets.

        Groups positions by (protocol, chain, pool_symbols) and computes:
        - Aggregated USD values and contributions
        - Wallet tracking for each pool
        - Snapshot ID consolidation

        Args:
            positions: Iterable of raw query result dictionaries

        Returns:
            List of aggregated pool position dictionaries ready for API response

        Example:
            >>> raw_results = [
            ...     {"protocol_id": "compound", "chain": "ethereum",
            ...      "wallet": "0x1", "asset_usd_value": 500.0,
            ...      "pool_symbols": ["DAI"], ...},
            ...     {"protocol_id": "compound", "chain": "ethereum",
            ...      "wallet": "0x2", "asset_usd_value": 1000.0,
            ...      "pool_symbols": ["DAI"], ...},
            ... ]
            >>> aggregated = PoolPerformanceAggregator.aggregate_positions(raw_results)
            >>> len(aggregated)  # Two positions merged into one
            1
            >>> aggregated[0]["asset_usd_value"]  # 500 + 1000
            1500.0
        """
        # Parse all positions into value objects
        parsed_positions = [cls.parse_position(row) for row in positions]

        # Group by (protocol, chain, pool_symbols)
        pool_groups: dict[tuple[str, str, tuple[str, ...]], AggregatedPoolPosition] = {}

        for position in parsed_positions:
            key = position.grouping_key

            if key not in pool_groups:
                pool_groups[key] = AggregatedPoolPosition(
                    protocol_id=position.protocol_id,
                    protocol_name=position.protocol_name,
                    chain=position.chain,
                    pool_symbols_key=position.pool_symbols_key,
                )

            pool_groups[key].add_position(position)

        # Convert to dictionaries
        return [pool_position.to_dict() for pool_position in pool_groups.values()]

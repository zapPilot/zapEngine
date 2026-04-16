"""
Yield Return Aggregator - Snapshot Aggregation Logic

Encapsulates logic for aggregating daily portfolio snapshots into consolidated
positions for yield return calculations. Separates token-based aggregation (DeBank)
from USD-balance aggregation (Hyperliquid).
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Any, ClassVar
from uuid import UUID


class YieldReturnAggregator:
    """Aggregator for yield return snapshots."""

    DELTA_POSITION_TYPES: ClassVar[set[str]] = {
        "Yield",
        "Lending",
        "Locked",
        "Deposit",
        "Rewards",
        "Farming",
        "Staked",
        "Liquidity Pool",
        "Hyperliquidity Provider (HLP)",
    }

    TOKEN_LIST_KEYS: ClassVar[tuple[str, ...]] = (
        "borrow_tokens",
        "supply_tokens",
        "reward_tokens",
        "borrow_token_list",
        "supply_token_list",
        "reward_token_list",
    )

    @staticmethod
    def _safe_json_loads(
        value: Any, default: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Safely parse JSON or return default dict."""
        if isinstance(value, dict):
            return value
        if not isinstance(value, str):
            return default or {}
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return default or {}

        return default or {}

    @classmethod
    def aggregate_snapshots(
        cls,
        user_id: UUID,
        rows: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """
        Route snapshots to appropriate aggregation based on protocol_type.
        Returns (token_aggregated, usd_aggregated).
        """
        token_rows = [r for r in rows if r.get("protocol_type") == "token_based"]
        usd_rows = [r for r in rows if r.get("protocol_type") == "usd_balance"]

        logger = logging.getLogger(__name__)
        logger.debug(
            "Routing snapshots: %d token-based, %d usd-balance",
            len(token_rows),
            len(usd_rows),
        )

        token_agg = cls.aggregate_token_snapshots(user_id, token_rows)
        usd_agg = cls.aggregate_usd_balance_snapshots(user_id, usd_rows)

        return token_agg, usd_agg

    @classmethod
    def aggregate_token_snapshots(
        cls,
        user_id: UUID,
        rows: list[dict[str, Any]],
        position_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Aggregate token amounts by (chain, protocol, date) for token-based protocols."""
        if position_types is None:
            position_types = cls.DELTA_POSITION_TYPES

        aggregated_snapshots: dict[tuple[str, str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "user_id": str(user_id),
                "protocol_name": None,
                "chain": None,
                "snapshot_at": None,
                "token_amounts": defaultdict(lambda: {"amount": 0.0, "price": 0.0}),
                "name_item": None,
            }
        )

        for row in rows:
            name_item = row.get("name_item")
            if not cls._is_included_position(name_item, position_types):
                continue

            protocol_data = cls._safe_json_loads(
                row.get("protocol_data") or row.get("detail")
            )

            snapshot_at = row.get("snapshot_at")
            if snapshot_at is None:
                continue

            snapshot_key = cls._snapshot_identity(row, snapshot_at)
            chain, protocol_name, date_str = snapshot_key
            aggregated_snapshot = aggregated_snapshots[snapshot_key]
            cls._apply_row_snapshot_fields(
                aggregated_snapshot,
                row,
                protocol_name=protocol_name,
                date_str=date_str,
                name_item=name_item,
            )

            for token_list_key in cls.TOKEN_LIST_KEYS:
                tokens = protocol_data.get(token_list_key, []) or []
                if not isinstance(tokens, list):
                    continue
                cls._accumulate_token_list(aggregated_snapshot, token_list_key, tokens)

        return cls._finalize_token_aggregates(aggregated_snapshots)

    @staticmethod
    def _is_included_position(name_item: Any, position_types: set[str]) -> bool:
        """Check whether a position should be included in delta aggregation."""
        return name_item in position_types

    @staticmethod
    def _snapshot_identity(
        row: dict[str, Any], snapshot_at: Any
    ) -> tuple[str, str, str]:
        """Build canonical aggregation key (chain, protocol_name, date_str)."""
        date_str = snapshot_at.strftime("%Y-%m-%d")
        chain = row.get("chain") or ""
        protocol_name = row.get("protocol_name") or row.get("name") or ""
        return chain, protocol_name, date_str

    @staticmethod
    def _apply_row_snapshot_fields(
        aggregated_snapshot: dict[str, Any],
        row: dict[str, Any],
        *,
        protocol_name: str,
        date_str: str,
        name_item: Any,
    ) -> None:
        """Populate per-row snapshot metadata on aggregate bucket."""
        aggregated_snapshot["protocol_name"] = protocol_name
        aggregated_snapshot["chain"] = row.get("chain")
        aggregated_snapshot["snapshot_at"] = date_str
        aggregated_snapshot["name_item"] = name_item

    @staticmethod
    def _accumulate_token_list(
        aggregated_snapshot: dict[str, Any],
        token_list_key: str,
        tokens: list[Any],
    ) -> None:
        """Accumulate token list values into aggregate token buckets."""
        for token in tokens:
            symbol = token.get("optimized_symbol") or token.get("symbol")
            if not symbol:
                continue
            amount = float(token.get("amount") or 0.0)
            price = float(token.get("price") or 0.0)
            if "borrow" in token_list_key:
                amount *= -1

            token_bucket = aggregated_snapshot["token_amounts"][symbol]
            token_bucket["amount"] += amount
            token_bucket["price"] = price

    @staticmethod
    def _finalize_token_aggregates(
        aggregated_snapshots: dict[tuple[str, str, str], dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Convert internal token aggregates to sorted output payload."""
        return sorted(
            (
                {
                    "user_id": snapshot["user_id"],
                    "protocol_name": snapshot["protocol_name"],
                    "chain": snapshot["chain"],
                    "snapshot_at": snapshot["snapshot_at"],
                    "token_amounts": dict(snapshot["token_amounts"]),
                    "name_item": snapshot["name_item"],
                }
                for snapshot in aggregated_snapshots.values()
            ),
            key=lambda item: item["snapshot_at"],
        )

    @classmethod
    def aggregate_usd_balance_snapshots(
        cls,
        user_id: UUID,
        rows: list[dict[str, Any]],
        position_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Aggregate USD balance snapshots for protocols like Hyperliquid."""
        if position_types is None:
            position_types = cls.DELTA_POSITION_TYPES

        aggregated: dict[tuple[str, str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "user_id": str(user_id),
                "protocol_name": None,
                "chain": None,
                "snapshot_at": None,
                "usd_balance": 0.0,
                "name_item": None,
            }
        )

        for row in rows:
            name_item = row.get("name_item")
            if name_item not in position_types:
                continue

            raw_protocol_data = row.get("protocol_data") or {}
            protocol_data = cls._safe_json_loads(raw_protocol_data)

            if isinstance(raw_protocol_data, str) and not protocol_data:
                logging.getLogger(__name__).warning(
                    "Failed to parse protocol_data for %s/%s",
                    row.get("protocol_name"),
                    row.get("chain"),
                )
                continue

            usd_value = float(protocol_data.get("usd_value", 0.0))

            snapshot_at = row.get("snapshot_at")
            if snapshot_at is None:
                continue

            date_str = snapshot_at.strftime("%Y-%m-%d")
            chain = row.get("chain") or ""
            protocol_name = row.get("protocol_name") or ""
            key = (chain, protocol_name, date_str)

            aggregated[key]["usd_balance"] = usd_value
            aggregated[key]["protocol_name"] = protocol_name
            aggregated[key]["chain"] = chain
            aggregated[key]["snapshot_at"] = date_str
            aggregated[key]["name_item"] = name_item

        return sorted(aggregated.values(), key=lambda item: item["snapshot_at"])

    @staticmethod
    def calculate_usd_balance_deltas(
        aggregated_snapshots: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Calculate day-over-day USD balance changes for protocols like Hyperliquid.

        This method computes simple delta: current_balance - previous_balance
        for protocols that provide direct USD values rather than token breakdowns.
        """
        deltas: list[dict[str, Any]] = []
        tracking: dict[str, dict[str, Any]] = {}

        for snapshot in aggregated_snapshots:
            chain = snapshot["chain"]
            protocol = snapshot["protocol_name"]
            key = f"{protocol}-{chain}"

            prev = tracking.get(key)
            if prev is None:
                tracking[key] = snapshot
                continue

            current_balance = snapshot["usd_balance"]
            prev_balance = prev["usd_balance"]
            yield_usd = current_balance - prev_balance

            deltas.append(
                {
                    "user_id": snapshot["user_id"],
                    "snapshot_at": snapshot["snapshot_at"],
                    "protocol_name": protocol,
                    "chain": chain,
                    "token_yield_usd": yield_usd,
                    "current_usd": current_balance,
                    "previous_usd": prev_balance,
                    "current_amounts": {},  # Empty for USD balance protocols
                    "previous_amounts": {},  # Empty for USD balance protocols
                    "name_item": snapshot["name_item"],
                }
            )

            tracking[key] = snapshot

        return deltas

    @staticmethod
    def calculate_snapshot_deltas(
        aggregated_snapshots: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Calculate day-over-day Yield Return deltas for token-based protocols."""
        payload_list: list[dict[str, Any]] = []
        position_tracking: dict[str, dict[str, Any]] = {}

        for snapshot in aggregated_snapshots:
            token_symbols = sorted(snapshot["token_amounts"].keys())
            pool_token_symbols_key = "-".join(token_symbols)
            tracking_key = f"{snapshot['protocol_name']}-{snapshot['chain']}-{pool_token_symbols_key}"

            previous_snapshot = position_tracking.get(tracking_key)
            if previous_snapshot is None:
                position_tracking[tracking_key] = {
                    "snapshot_at": snapshot["snapshot_at"],
                    "token_amounts": snapshot["token_amounts"],
                }
                continue

            token_yield_usd = 0.0
            for symbol, current_token_data in snapshot["token_amounts"].items():
                current_amount = current_token_data.get("amount", 0.0)
                current_price = current_token_data.get("price", 0.0)
                previous_amount = (
                    previous_snapshot["token_amounts"]
                    .get(symbol, {})
                    .get("amount", 0.0)
                )
                amount_diff = current_amount - previous_amount
                token_yield_usd += amount_diff * current_price

            current_usd = sum(
                (token_data.get("amount", 0.0) * token_data.get("price", 0.0))
                for token_data in snapshot["token_amounts"].values()
            )
            previous_usd = sum(
                (token_data.get("amount", 0.0) * token_data.get("price", 0.0))
                for token_data in previous_snapshot["token_amounts"].values()
            )

            payload_list.append(
                {
                    "user_id": snapshot["user_id"],
                    "snapshot_at": snapshot["snapshot_at"],
                    "protocol_name": snapshot["protocol_name"],
                    "chain": snapshot["chain"],
                    "pool_token_symbols_key": pool_token_symbols_key,
                    "token_yield_usd": token_yield_usd,
                    "current_usd": current_usd,
                    "previous_usd": previous_usd,
                    "current_amounts": snapshot["token_amounts"],
                    "previous_amounts": previous_snapshot["token_amounts"],
                    "name_item": snapshot.get("name_item"),
                }
            )

            position_tracking[tracking_key] = {
                "snapshot_at": snapshot["snapshot_at"],
                "token_amounts": snapshot["token_amounts"],
            }

        return payload_list

    @staticmethod
    def filter_significant_deltas(
        deltas: list[dict[str, Any]], min_threshold: float = 0.0
    ) -> list[dict[str, Any]]:
        """Filter out delta rows below the noise threshold."""
        if min_threshold <= 0:
            return deltas
        return [
            delta
            for delta in deltas
            if abs(delta.get("token_yield_usd", 0.0)) >= min_threshold
        ]

"""Unit tests for YieldReturnAggregator."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from src.services.aggregators.yield_return_aggregator import YieldReturnAggregator


def _build_snapshot(
    user_id: UUID,
    name: str,
    snapshot_at: datetime,
    *,
    chain: str = "ethereum",
    name_item: str = "Lending",
    supply_amount: float = 0.0,
    borrow_amount: float = 0.0,
    reward_amount: float = 0.0,
    price: float = 1.0,
) -> dict[str, Any]:
    """Helper to craft portfolio snapshot rows."""

    def _token(symbol: str, amount: float, token_price: float):
        return {"optimized_symbol": symbol, "amount": amount, "price": token_price}

    supply_tokens = [_token(f"{name.upper()}-SUP", supply_amount, price)]
    borrow_tokens = [_token(f"{name.upper()}-BOR", borrow_amount, price)]
    reward_tokens = [_token(f"{name.upper()}-REW", reward_amount, price * 2)]

    # Legacy detail field for backward compatibility
    detail = {
        "supply_token_list": supply_tokens,
        "borrow_token_list": borrow_tokens,
        "reward_token_list": reward_tokens,
    }

    # New protocol_data field for SQL-preprocessed format
    protocol_data = {
        "supply_tokens": supply_tokens,
        "borrow_tokens": borrow_tokens,
        "reward_tokens": reward_tokens,
    }

    return {
        "user_id": str(user_id),
        "chain": chain,
        "protocol_name": name,
        "name": name,  # Legacy field
        "snapshot_at": snapshot_at,
        "detail": detail,  # Legacy field
        "protocol_type": "token_based",  # New field from SQL
        "protocol_data": protocol_data,  # New field from SQL
        "name_item": name_item,
    }


def _build_usd_balance_snapshot(
    user_id: UUID,
    protocol_name: str,
    snapshot_at: datetime,
    *,
    chain: str = "arbitrum",
    name_item: str = "Yield",
    usd_value: float = 0.0,
) -> dict[str, Any]:
    """Helper to craft USD balance snapshot rows for Hyperliquid-style protocols."""
    return {
        "user_id": str(user_id),
        "chain": chain,
        "protocol_name": protocol_name,
        "snapshot_at": snapshot_at,
        "protocol_type": "usd_balance",
        "protocol_data": {"usd_value": usd_value},
        "name_item": name_item,
    }


def test_aggregate_usd_balance_snapshots():
    """USD balance snapshots are aggregated by (protocol, chain, date)."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)
    day2 = datetime(2024, 1, 2, tzinfo=UTC)

    rows = [
        _build_usd_balance_snapshot(user_id, "hyperliquid", day1, usd_value=1000.0),
        _build_usd_balance_snapshot(user_id, "hyperliquid", day2, usd_value=1050.0),
    ]

    aggregated = YieldReturnAggregator.aggregate_usd_balance_snapshots(user_id, rows)

    assert len(aggregated) == 2
    assert aggregated[0]["usd_balance"] == 1000.0
    assert aggregated[1]["usd_balance"] == 1050.0
    assert aggregated[0]["protocol_name"] == "hyperliquid"
    assert aggregated[0]["chain"] == "arbitrum"


def test_aggregate_usd_balance_snapshots_filters_position_types():
    """USD balance snapshots respect position type filtering."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)

    rows = [
        _build_usd_balance_snapshot(
            user_id, "hyperliquid", day1, name_item="Yield", usd_value=1000.0
        ),
        _build_usd_balance_snapshot(
            user_id, "hyperliquid", day1, name_item="Invalid", usd_value=999.0
        ),
    ]

    aggregated = YieldReturnAggregator.aggregate_usd_balance_snapshots(user_id, rows)

    # Only Yield position type should be included (Invalid filtered out)
    assert len(aggregated) == 1
    assert aggregated[0]["usd_balance"] == 1000.0
    assert aggregated[0]["name_item"] == "Yield"


def test_calculate_usd_balance_deltas():
    """USD balance deltas compute simple day-over-day differences."""
    user_id = uuid4()

    aggregated = [
        {
            "user_id": str(user_id),
            "protocol_name": "hyperliquid",
            "chain": "arbitrum",
            "snapshot_at": "2024-01-01",
            "usd_balance": 1000.0,
            "name_item": "Yield",
        },
        {
            "user_id": str(user_id),
            "protocol_name": "hyperliquid",
            "chain": "arbitrum",
            "snapshot_at": "2024-01-02",
            "usd_balance": 1050.0,
            "name_item": "Yield",
        },
        {
            "user_id": str(user_id),
            "protocol_name": "hyperliquid",
            "chain": "arbitrum",
            "snapshot_at": "2024-01-03",
            "usd_balance": 1020.0,
            "name_item": "Yield",
        },
    ]

    deltas = YieldReturnAggregator.calculate_usd_balance_deltas(aggregated)

    assert len(deltas) == 2
    # Day 2: 1050 - 1000 = +50
    assert deltas[0]["token_yield_usd"] == pytest.approx(50.0)
    assert deltas[0]["current_usd"] == 1050.0
    assert deltas[0]["previous_usd"] == 1000.0
    assert deltas[0]["current_amounts"] == {}  # Empty for USD balance
    assert deltas[0]["previous_amounts"] == {}

    # Day 3: 1020 - 1050 = -30
    assert deltas[1]["token_yield_usd"] == pytest.approx(-30.0)
    assert deltas[1]["current_usd"] == 1020.0
    assert deltas[1]["previous_usd"] == 1050.0


def test_calculate_usd_balance_deltas_skips_initial_snapshot():
    """First snapshot has no previous data, so no delta is generated."""
    user_id = uuid4()

    aggregated = [
        {
            "user_id": str(user_id),
            "protocol_name": "hyperliquid",
            "chain": "arbitrum",
            "snapshot_at": "2024-01-01",
            "usd_balance": 1000.0,
            "name_item": "Yield",
        },
    ]

    deltas = YieldReturnAggregator.calculate_usd_balance_deltas(aggregated)

    assert len(deltas) == 0  # No delta for initial snapshot


def test_aggregate_snapshots_routes_by_protocol_type():
    """Routing method separates token-based and USD balance protocols."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)

    rows = [
        # Token-based protocol (DeBank)
        {
            **_build_snapshot(user_id, "Aave", day1, supply_amount=100),
            "protocol_type": "token_based",
            "protocol_data": {"supply_tokens": []},
        },
        # USD balance protocol (Hyperliquid)
        _build_usd_balance_snapshot(user_id, "hyperliquid", day1, usd_value=1000.0),
    ]

    token_agg, usd_agg = YieldReturnAggregator.aggregate_snapshots(user_id, rows)

    assert len(token_agg) == 1
    assert len(usd_agg) == 1
    assert token_agg[0]["protocol_name"] == "Aave"
    assert usd_agg[0]["protocol_name"] == "hyperliquid"


def test_aggregate_usd_balance_handles_malformed_protocol_data():
    """USD balance aggregation logs and skips malformed protocol_data."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)

    rows = [
        {
            "user_id": str(user_id),
            "chain": "arbitrum",
            "protocol_name": "hyperliquid",
            "snapshot_at": day1,
            "protocol_type": "usd_balance",
            "protocol_data": "invalid-json-string-[[[",  # Malformed JSON
            "name_item": "Yield",
        },
        _build_usd_balance_snapshot(user_id, "hyperliquid", day1, usd_value=1000.0),
    ]

    aggregated = YieldReturnAggregator.aggregate_usd_balance_snapshots(user_id, rows)

    # Only the valid snapshot is aggregated
    assert len(aggregated) == 1
    assert aggregated[0]["usd_balance"] == 1000.0


def test_aggregate_usd_balance_handles_missing_snapshot_at():
    """USD balance aggregation skips rows with missing snapshot_at."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)

    rows = [
        {
            "user_id": str(user_id),
            "chain": "arbitrum",
            "protocol_name": "hyperliquid",
            "snapshot_at": None,  # Missing
            "protocol_type": "usd_balance",
            "protocol_data": {"usd_value": 999.0},
            "name_item": "Yield",
        },
        _build_usd_balance_snapshot(user_id, "hyperliquid", day1, usd_value=1000.0),
    ]

    aggregated = YieldReturnAggregator.aggregate_usd_balance_snapshots(user_id, rows)

    assert len(aggregated) == 1
    assert aggregated[0]["usd_balance"] == 1000.0


def test_aggregate_usd_balance_handles_zero_usd_value():
    """USD balance aggregation correctly handles zero balances."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)
    day2 = datetime(2024, 1, 2, tzinfo=UTC)

    rows = [
        _build_usd_balance_snapshot(user_id, "hyperliquid", day1, usd_value=1000.0),
        _build_usd_balance_snapshot(user_id, "hyperliquid", day2, usd_value=0.0),
    ]

    aggregated = YieldReturnAggregator.aggregate_usd_balance_snapshots(user_id, rows)
    deltas = YieldReturnAggregator.calculate_usd_balance_deltas(aggregated)

    assert len(deltas) == 1
    assert deltas[0]["token_yield_usd"] == pytest.approx(-1000.0)  # Full withdrawal


def test_aggregate_usd_balance_hyperliquidity_provider_name_item():
    """USD balance aggregation handles real Hyperliquid name_item value."""
    user_id = uuid4()
    day1 = datetime(2024, 1, 1, tzinfo=UTC)
    day2 = datetime(2024, 1, 2, tzinfo=UTC)

    # Use actual name_item from production database
    rows = [
        _build_usd_balance_snapshot(
            user_id,
            "hyperliquid",
            day1,
            name_item="Hyperliquidity Provider (HLP)",
            usd_value=19856.31,
        ),
        _build_usd_balance_snapshot(
            user_id,
            "hyperliquid",
            day2,
            name_item="Hyperliquidity Provider (HLP)",
            usd_value=19858.45,
        ),
    ]

    aggregated = YieldReturnAggregator.aggregate_usd_balance_snapshots(user_id, rows)
    deltas = YieldReturnAggregator.calculate_usd_balance_deltas(aggregated)

    assert len(aggregated) == 2
    assert len(deltas) == 1
    assert deltas[0]["token_yield_usd"] == pytest.approx(2.14)


def test_safe_json_loads_edge_cases():
    """Test _safe_json_loads handles various input types and errors."""
    # Dict input returns as-is
    assert YieldReturnAggregator._safe_json_loads({"a": 1}) == {"a": 1}

    # Non-string, non-dict input returns default
    assert YieldReturnAggregator._safe_json_loads(123) == {}
    assert YieldReturnAggregator._safe_json_loads(None, default={"x": 1}) == {"x": 1}

    # Invalid JSON string returns default
    assert YieldReturnAggregator._safe_json_loads("{invalid", default={}) == {}


def test_aggregate_token_snapshots_skips_filtered_items():
    """Test filtering by position type."""
    user_id = uuid4()
    row = _build_snapshot(user_id, "Aave", datetime.now(UTC), name_item="InvalidType")

    # Pass a set that excludes "InvalidType"
    agg = YieldReturnAggregator.aggregate_token_snapshots(
        user_id, [row], position_types={"Yield"}
    )
    assert len(agg) == 0


def test_aggregate_token_snapshots_skips_missing_date():
    """Test skipping rows with no snapshot_at."""
    user_id = uuid4()
    row = _build_snapshot(user_id, "Aave", datetime.now(UTC))
    row["snapshot_at"] = None

    agg = YieldReturnAggregator.aggregate_token_snapshots(user_id, [row])
    assert len(agg) == 0


def test_aggregate_token_snapshots_handles_malformed_token_lists():
    """Test handling of invalid token list structures."""
    user_id = uuid4()
    row = _build_snapshot(user_id, "Aave", datetime.now(UTC))

    # Malformed: supply_tokens is not a list
    row["protocol_data"]["supply_tokens"] = "not-a-list"

    # Malformed: token missing symbol
    row["protocol_data"]["borrow_tokens"] = [{"amount": 10}]

    # Clear reward tokens too so no valid tokens remain
    row["protocol_data"]["reward_tokens"] = []

    agg = YieldReturnAggregator.aggregate_token_snapshots(user_id, [row])

    # Should successfully process but ignore invalid items, resulting in empty or partial data
    # In this case, since we corrupted the only tokens, result tokens should be empty
    assert len(agg) == 1
    assert not agg[0]["token_amounts"]


def test_safe_json_loads_more_edge_cases():
    """Test _safe_json_loads for lines 53-54 and 58."""
    # Valid JSON dict (covers 53-54)
    assert YieldReturnAggregator._safe_json_loads('{"a": 1}') == {"a": 1}

    # Valid JSON but not a dict (covers 58)
    assert YieldReturnAggregator._safe_json_loads("[1, 2, 3]") == {}
    assert YieldReturnAggregator._safe_json_loads("123") == {}

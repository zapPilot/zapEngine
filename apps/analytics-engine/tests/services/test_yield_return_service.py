"""Unit tests for YieldReturnService."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest

from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.shared.query_names import QUERY_NAMES
from src.services.yield_return_service import YieldReturnService


class StubQueryService:
    """Minimal stub implementing the async fetch API, dispatching by query name."""

    def __init__(
        self,
        rows: list[dict[str, Any]],
        wallet_rows: list[dict[str, Any]] | None = None,
    ):
        self.rows = rows
        self.wallet_rows = wallet_rows or []
        self.last_call: dict[str, Any] | None = None
        self.calls: dict[str, dict[str, Any]] = {}

    async def fetch_time_range_query(
        self,
        db,
        query_name: str,
        user_id: UUID | str,
        start_date,
        end_date,
        *,
        limit=None,
        wallet_address: str | None = None,
        extra_params=None,
    ) -> list[dict[str, Any]]:
        call = {
            "db": db,
            "query_name": query_name,
            "user_id": user_id,
            "start_date": start_date,
            "end_date": end_date,
            "wallet_address": wallet_address,
        }
        self.calls[query_name] = call
        if query_name == QUERY_NAMES.WALLET_TOKEN_ATTRIBUTION_SNAPSHOTS:
            return self.wallet_rows
        # last_call stays on the position query so window assertions keep their
        # original meaning now that a second query shares this stub.
        self.last_call = call
        return self.rows

    def execute_query(
        self,
        db,
        query_name: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return []


class NullAprProvider:
    """Staking APR provider stub for tests that assert observed carry only."""

    async def get_benchmark_apr(self) -> float | None:
        return None


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


@pytest.mark.asyncio
async def test_get_daily_yield_returns_builds_summary(db_session):
    """Service returns Yield Return response with summary statistics."""
    user_id = uuid4()
    day0 = datetime(2024, 1, 1, tzinfo=UTC)
    day1 = day0 + timedelta(days=1)

    rows = [
        _build_snapshot(user_id, "Aave", day0, supply_amount=100, borrow_amount=0),
        _build_snapshot(
            user_id, "Aave", day1, supply_amount=110, borrow_amount=5, reward_amount=1
        ),
        _build_snapshot(user_id, "Maker", day0, supply_amount=200),
        _build_snapshot(user_id, "Maker", day1, supply_amount=180),
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(user_id=user_id, days=5)

    assert response.user_id == str(user_id)
    assert len(response.daily_returns) == 2
    assert response.summary.total_yield_return_usd == pytest.approx(-13.0)
    assert response.summary.positive_days == 1
    assert response.summary.negative_days == 1
    assert response.summary.top_protocol == "Maker"
    assert response.summary.top_chain == "ethereum"


@pytest.mark.asyncio
async def test_get_daily_yield_returns_applies_threshold_and_filters(db_session):
    """Noise threshold and protocol filters reduce daily rows."""
    user_id = uuid4()
    day0 = datetime(2024, 2, 1, tzinfo=UTC)
    day1 = day0 + timedelta(days=1)

    rows = [
        _build_snapshot(user_id, "Aave", day0, supply_amount=50),
        _build_snapshot(user_id, "Aave", day1, supply_amount=60),
        _build_snapshot(user_id, "Maker", day0, supply_amount=10),
        _build_snapshot(user_id, "Maker", day1, supply_amount=30),
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(
        user_id=user_id,
        days=3,
        min_threshold=15,
        protocols=["Maker"],
        chains=["ethereum"],
    )

    assert len(response.daily_returns) == 1
    entry = response.daily_returns[0]
    assert entry.protocol_name == "Maker"
    assert entry.yield_return_usd == pytest.approx(20.0)
    assert response.summary.total_yield_return_usd == pytest.approx(20.0)


# =====================================================================
# Tests for YieldReturnAggregator have been moved to:
# tests/services/aggregators/test_yield_return_aggregator.py
# =====================================================================


# =====================================================================
# FILTER EDGE CASE TESTS
# =====================================================================


@pytest.mark.asyncio
async def test_get_daily_yield_returns_protocol_filter_no_match(db_session):
    """Protocol filter with no matches returns empty daily_returns."""
    user_id = uuid4()
    day0 = datetime(2024, 1, 1, tzinfo=UTC)
    day1 = day0 + timedelta(days=1)

    rows = [
        _build_snapshot(user_id, "Aave", day0, supply_amount=100),
        _build_snapshot(user_id, "Aave", day1, supply_amount=110),
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(
        user_id=user_id,
        days=5,
        protocols=["NonExistentProtocol"],  # No match
    )

    assert len(response.daily_returns) == 0
    assert response.summary.total_yield_return_usd == 0.0
    assert response.summary.positive_days == 0
    assert response.summary.negative_days == 0
    assert response.summary.top_protocol is None
    assert response.summary.top_chain is None


@pytest.mark.asyncio
async def test_get_daily_yield_returns_chain_filter_no_match(db_session):
    """Chain filter with no matches returns empty daily_returns."""
    user_id = uuid4()
    day0 = datetime(2024, 1, 1, tzinfo=UTC)
    day1 = day0 + timedelta(days=1)

    rows = [
        _build_snapshot(user_id, "Aave", day0, chain="ethereum", supply_amount=100),
        _build_snapshot(user_id, "Aave", day1, chain="ethereum", supply_amount=110),
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(
        user_id=user_id,
        days=5,
        chains=["solana"],  # No match - data is on ethereum
    )

    assert len(response.daily_returns) == 0
    assert response.summary.total_yield_return_usd == 0.0


@pytest.mark.asyncio
async def test_get_daily_yield_returns_both_filters_no_match(db_session):
    """Both protocol and chain filters with no matches returns empty daily_returns."""
    user_id = uuid4()
    day0 = datetime(2024, 1, 1, tzinfo=UTC)
    day1 = day0 + timedelta(days=1)

    rows = [
        _build_snapshot(user_id, "Aave", day0, chain="ethereum", supply_amount=100),
        _build_snapshot(user_id, "Aave", day1, chain="ethereum", supply_amount=110),
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    # Protocol matches but chain doesn't
    response = await service.get_daily_yield_returns(
        user_id=user_id,
        days=5,
        protocols=["Aave"],
        chains=["arbitrum"],  # No match
    )

    assert len(response.daily_returns) == 0


@pytest.mark.asyncio
async def test_get_daily_yield_returns_empty_database_result(db_session):
    """Empty database result returns valid response structure."""
    user_id = uuid4()

    service = YieldReturnService(
        db_session,
        StubQueryService([]),  # Empty result
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(user_id=user_id, days=30)

    assert response.user_id == str(user_id)
    assert len(response.daily_returns) == 0
    assert response.summary.total_yield_return_usd == 0.0
    assert response.summary.average_daily_return == 0.0
    assert response.summary.positive_days == 0
    assert response.summary.negative_days == 0


@pytest.mark.asyncio
async def test_get_yield_summary_supports_token_and_usd_balance_deltas(db_session):
    user_id = uuid4()
    day0 = datetime(2026, 8, 1, tzinfo=UTC)
    day1 = day0 + timedelta(days=1)
    rows = [
        _build_snapshot(user_id, "Morpho", day0, supply_amount=100),
        _build_snapshot(user_id, "Morpho", day1, supply_amount=103),
        {
            "user_id": str(user_id),
            "chain": "hyperliquid",
            "protocol_name": "hyperliquid",
            "name": "hyperliquid",
            "snapshot_at": day0,
            "protocol_type": "usd_balance",
            "protocol_data": {"usd_value": 500},
            "name_item": "Hyperliquidity Provider (HLP)",
        },
        {
            "user_id": str(user_id),
            "chain": "hyperliquid",
            "protocol_name": "hyperliquid",
            "name": "hyperliquid",
            "snapshot_at": day1,
            "protocol_type": "usd_balance",
            "protocol_data": {"usd_value": 498},
            "name_item": "Hyperliquidity Provider (HLP)",
        },
    ]
    query_service = StubQueryService(rows)
    service = YieldReturnService(
        db_session, query_service, PortfolioAnalyticsContext(), NullAprProvider()
    )

    response = await service.get_yield_summary(user_id, windows=("30d",))

    protocols = {
        item.protocol: item for item in response.windows["30d"].protocol_breakdown
    }
    assert protocols["Morpho"].window.total_yield_usd == pytest.approx(3)
    assert protocols["hyperliquid"].window.total_yield_usd == pytest.approx(-2)
    assert (
        query_service.last_call["end_date"] - query_service.last_call["start_date"]
    ).days == 31


@pytest.mark.asyncio
async def test_get_yield_summary_empty_portfolio(db_session):
    service = YieldReturnService(
        db_session, StubQueryService([]), PortfolioAnalyticsContext(), NullAprProvider()
    )

    response = await service.get_yield_summary(uuid4(), windows=("7d", "90d"))

    assert response.windows["7d"].statistics.total_days == 0
    assert response.windows["90d"].protocol_breakdown == []


def _wallet_row(day: str, symbol: str, amount: float, price: float) -> dict[str, Any]:
    return {
        "wallet": "0xaaa",
        "chain": "eth",
        "token_address": f"0x{symbol.lower()}",
        "symbol": symbol,
        "amount": amount,
        "price": price,
        "snapshot_date": date.fromisoformat(day),
    }


@pytest.mark.asyncio
async def test_daily_returns_flag_the_funding_spike_but_not_the_carry(db_session):
    """Only the deposit-shaped day is marked, so the rest can count as returns."""
    user_id = uuid4()
    day0 = datetime(2026, 3, 1, tzinfo=UTC)
    # Routine carry, then a day that quadruples the position.
    amounts = [100.0, 101.0, 102.1, 103.0, 104.0, 105.1, 106.0, 500.0]
    rows = [
        _build_snapshot(
            user_id, "Aave", day0 + timedelta(days=index), supply_amount=amount
        )
        for index, amount in enumerate(amounts)
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(user_id=user_id, days=30)

    flagged = {entry.date for entry in response.daily_returns if entry.outlier}
    assert flagged == {"2026-03-08"}
    assert all(entry.outlier is False for entry in response.daily_returns[:-1])


@pytest.mark.asyncio
async def test_wallet_returns_cover_idle_holdings_over_the_same_window(db_session):
    """Idle wallet tokens are attributed alongside the DeFi positions."""
    user_id = uuid4()
    day0 = datetime(2026, 3, 1, tzinfo=UTC)
    rows = [
        _build_snapshot(user_id, "Aave", day0, supply_amount=100),
        _build_snapshot(user_id, "Aave", day0 + timedelta(days=1), supply_amount=101),
    ]
    wallet_rows = [
        _wallet_row("2026-03-01", "ETH", 2.0, 3_000.0),
        _wallet_row("2026-03-02", "ETH", 2.0, 3_100.0),
    ]
    query_service = StubQueryService(rows, wallet_rows)

    service = YieldReturnService(
        db_session, query_service, PortfolioAnalyticsContext(), NullAprProvider()
    )

    response = await service.get_daily_yield_returns(user_id=user_id, days=30)

    [wallet_day] = response.wallet_returns
    assert wallet_day.date == "2026-03-02"
    [token] = wallet_day.tokens
    assert token.symbol == "ETH"
    assert token.market_return_usd == pytest.approx(200.0)

    wallet_call = query_service.calls[QUERY_NAMES.WALLET_TOKEN_ATTRIBUTION_SNAPSHOTS]
    position_call = query_service.calls[QUERY_NAMES.PORTFOLIO_YIELD_SNAPSHOTS]
    assert wallet_call["start_date"] == position_call["start_date"]
    assert wallet_call["end_date"] == position_call["end_date"]


@pytest.mark.asyncio
async def test_wallet_returns_are_empty_without_wallet_rows(db_session):
    """No idle-token history simply means no wallet attribution."""
    user_id = uuid4()
    day0 = datetime(2026, 3, 1, tzinfo=UTC)
    rows = [
        _build_snapshot(user_id, "Aave", day0, supply_amount=100),
        _build_snapshot(user_id, "Aave", day0 + timedelta(days=1), supply_amount=101),
    ]

    service = YieldReturnService(
        db_session,
        StubQueryService(rows),
        PortfolioAnalyticsContext(),
        NullAprProvider(),
    )

    response = await service.get_daily_yield_returns(user_id=user_id, days=30)

    assert response.wallet_returns == []

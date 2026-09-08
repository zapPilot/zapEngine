"""Contract tests for portfolio_snapshots_for_yield_returns.sql.

This query and ``wallet_token_snapshots_for_attribution.sql`` feed the same
yield response (``yield_return_service.py`` calls both with one shared
start/end pair), so the window they cover has to agree. The bounds asserted
here are the ones the aggregator depends on:

* ``:start_date`` is inclusive and ``:end_date`` exclusive **on the timestamp**;
* ``:end_date`` arrives as "now", so a snapshot written earlier today must still
  be returned — otherwise position attribution loses the day that wallet
  attribution keeps, and the two sides stop reconciling.

Rows are seeded the way ``alpha-etl`` writes them (``portfolioWriter.ts``):
``wallet`` lower-cased and ``snapshot_date`` set to the UTC calendar day of
``snapshot_at``.
"""

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.services.shared.query_names import QUERY_NAMES

WALLET_A = "0xAbC1111111111111111111111111111111111111"
WALLET_B = "0xdEf2222222222222222222222222222222222222"
WALLET_OTHER_USER = "0xFfF3333333333333333333333333333333333333"

WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def wallets(db_session, user_id):
    """Two wallets for the test user, plus one owned by a different user."""
    other_user_id = uuid4()
    for uid in (user_id, other_user_id):
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id)"), {"user_id": str(uid)}
        )
    for uid, wallet in [
        (user_id, WALLET_A),
        (user_id, WALLET_B),
        (other_user_id, WALLET_OTHER_USER),
    ]:
        db_session.execute(
            text("""
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
                VALUES (:id, :user_id, :wallet, 'Test', :created_at)
            """),
            {
                "id": str(uuid4()),
                "user_id": str(uid),
                "wallet": wallet,
                "created_at": datetime.now(UTC),
            },
        )
    db_session.commit()
    return {"owned": [WALLET_A, WALLET_B], "other": WALLET_OTHER_USER}


def _insert_position(
    db_session,
    wallet,
    snapshot_at,
    *,
    protocol="Aave",
    chain="eth",
    name_item="Lending",
    net_usd_value=0.0,
    detail=None,
    detail_types=("common",),
):
    """Insert one position exactly as alpha-etl would write it."""
    db_session.execute(
        text("""
            INSERT INTO analytics.daily_portfolio_positions
                (id, wallet, snapshot_at, snapshot_date, chain, source,
                 name, name_item, asset_usd_value, net_usd_value,
                 detail, detail_types)
            VALUES (:id, :wallet, :snapshot_at, :snapshot_date, :chain, 'debank',
                    :protocol, :name_item, :net_usd_value, :net_usd_value,
                    CAST(:detail AS jsonb), CAST(:detail_types AS text[]))
        """),
        {
            "id": str(uuid4()),
            "wallet": wallet.lower(),
            "snapshot_at": snapshot_at,
            "snapshot_date": snapshot_at.astimezone(UTC).date(),
            "chain": chain,
            "protocol": protocol,
            "name_item": name_item,
            "net_usd_value": net_usd_value,
            "detail": json.dumps(detail if detail is not None else {}),
            "detail_types": list(detail_types),
        },
    )
    db_session.commit()


def _token(address, symbol, amount, price):
    return {"id": address, "optimized_symbol": symbol, "amount": amount, "price": price}


def _run(query_service, db_session, user_id, *, start_date, end_date, wallet=None):
    return query_service.execute_query(
        db_session,
        QUERY_NAMES.PORTFOLIO_YIELD_SNAPSHOTS,
        {
            "user_id": str(user_id),
            "wallet_address": wallet,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def test_a_snapshot_written_earlier_today_is_still_returned(
    query_service, db_session, user_id, wallets
):
    """end_date is "now", so today's snapshot must land in the window.

    The sibling wallet-attribution query keeps today by comparing its calendar
    date inclusively; if this side dropped today the two halves of the same
    response would cover different windows.
    """
    now = datetime.now(UTC)
    _insert_position(db_session, wallets["owned"][0], now - timedelta(hours=1))

    rows = _run(
        query_service,
        db_session,
        user_id,
        start_date=now - timedelta(days=7),
        end_date=now,
    )

    assert len(rows) == 1
    assert rows[0]["snapshot_at"].astimezone(UTC).date() == now.date()


def test_the_window_is_start_inclusive_and_end_exclusive(
    query_service, db_session, user_id, wallets
):
    """Exactly the boundary instants decide inclusion."""
    wallet = wallets["owned"][0]
    start = datetime(2026, 1, 10, 6, 0, tzinfo=UTC)
    end = datetime(2026, 1, 20, 6, 0, tzinfo=UTC)
    for offset, protocol in [
        (timedelta(seconds=-1), "TooEarly"),
        (timedelta(0), "AtStart"),
        (timedelta(days=5), "Inside"),
    ]:
        _insert_position(db_session, wallet, start + offset, protocol=protocol)
    _insert_position(db_session, wallet, end, protocol="AtEnd")
    _insert_position(db_session, wallet, end - timedelta(seconds=1), protocol="JustIn")

    rows = _run(query_service, db_session, user_id, start_date=start, end_date=end)

    assert [row["protocol_name"] for row in rows] == [
        "AtStart",
        "Inside",
        "JustIn",
    ]


def test_rows_are_ordered_by_snapshot_at_ascending(
    query_service, db_session, user_id, wallets
):
    """The aggregator walks the rows in time order to build deltas."""
    wallet = wallets["owned"][0]
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = datetime(2026, 2, 1, tzinfo=UTC)
    for day, protocol in [(20, "Third"), (5, "First"), (12, "Second")]:
        _insert_position(
            db_session,
            wallet,
            datetime(2026, 1, day, 9, 0, tzinfo=UTC),
            protocol=protocol,
        )

    rows = _run(query_service, db_session, user_id, start_date=start, end_date=end)

    assert [row["protocol_name"] for row in rows] == ["First", "Second", "Third"]


def test_token_based_rows_expose_supply_borrow_and_reward_lists(
    query_service, db_session, user_id, wallets
):
    """protocol_data is the preprocessed payload the aggregator consumes."""
    _insert_position(
        db_session,
        wallets["owned"][0],
        datetime(2026, 1, 10, 9, 0, tzinfo=UTC),
        detail={
            "supply_token_list": [_token(WSTETH, "wstETH", 2.0, 3000.0)],
            "borrow_token_list": [_token(WSTETH, "wstETH", 1.0, 3000.0)],
        },
    )

    rows = _run(
        query_service,
        db_session,
        user_id,
        start_date=datetime(2026, 1, 1, tzinfo=UTC),
        end_date=datetime(2026, 2, 1, tzinfo=UTC),
    )

    assert set(rows[0]) == {
        "wallet",
        "chain",
        "protocol_name",
        "snapshot_at",
        "name_item",
        "protocol_type",
        "detail_types",
        "protocol_data",
    }
    assert rows[0]["protocol_type"] == "token_based"
    assert rows[0]["name_item"] == "Lending"
    assert rows[0]["detail_types"] == ["common"]
    payload = rows[0]["protocol_data"]
    assert [token["optimized_symbol"] for token in payload["supply_tokens"]] == [
        "wstETH"
    ]
    assert len(payload["borrow_tokens"]) == 1
    assert payload["reward_tokens"] == []


def test_hyperliquid_rows_are_classified_as_usd_balance(
    query_service, db_session, user_id, wallets
):
    """Hyperliquid carries no token list; its value comes from net_usd_value."""
    _insert_position(
        db_session,
        wallets["owned"][0],
        datetime(2026, 1, 10, 9, 0, tzinfo=UTC),
        protocol="Hyperliquid",
        net_usd_value=1234.5,
    )

    rows = _run(
        query_service,
        db_session,
        user_id,
        start_date=datetime(2026, 1, 1, tzinfo=UTC),
        end_date=datetime(2026, 2, 1, tzinfo=UTC),
    )

    assert rows[0]["protocol_type"] == "usd_balance"
    assert float(rows[0]["protocol_data"]["usd_value"]) == pytest.approx(1234.5)


def test_rows_are_scoped_to_the_user_and_the_wallet_filter(
    query_service, db_session, user_id, wallets
):
    """Another user's wallet is never returned; the filter accepts any casing."""
    first, second = wallets["owned"]
    at = datetime(2026, 1, 10, 9, 0, tzinfo=UTC)
    start = datetime(2026, 1, 1, tzinfo=UTC)
    end = datetime(2026, 2, 1, tzinfo=UTC)
    _insert_position(db_session, first, at, protocol="First")
    _insert_position(db_session, second, at, protocol="Second")
    _insert_position(db_session, wallets["other"], at, protocol="Foreign")

    bundle = _run(query_service, db_session, user_id, start_date=start, end_date=end)
    assert sorted(row["protocol_name"] for row in bundle) == ["First", "Second"]
    assert {row["wallet"] for row in bundle} == {first.lower(), second.lower()}

    filtered = _run(
        query_service,
        db_session,
        user_id,
        start_date=start,
        end_date=end,
        wallet=second.upper(),
    )
    assert [row["protocol_name"] for row in filtered] == ["Second"]

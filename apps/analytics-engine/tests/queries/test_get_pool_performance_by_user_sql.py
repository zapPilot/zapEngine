"""Contract tests for get_pool_performance_by_user.sql.

The pool-performance endpoint reads this query directly, so its two selection
rules are asserted at the SQL boundary:

* a bound ``:snapshot_date`` pins every wallet to that exact calendar day;
* a NULL ``:snapshot_date`` falls back to each wallet's *own* latest day, which
  is what keeps a stale wallet in a bundle from blanking the fresh ones.

Rows are seeded the way ``alpha-etl`` writes them (``portfolioWriter.ts``):
``wallet`` lower-cased and ``snapshot_date`` set to the UTC calendar day of
``snapshot_at``. ``user_crypto_wallets`` keeps checksummed casing, because that
is the side where case normalisation is load-bearing.
"""

import json
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.services.shared.query_names import QUERY_NAMES

WALLET_A = "0xAbC1111111111111111111111111111111111111"
WALLET_B = "0xdEf2222222222222222222222222222222222222"
WALLET_OTHER_USER = "0xFfF3333333333333333333333333333333333333"


@pytest.fixture
def user_id():
    return uuid4()


def _register_wallet(db_session, user_id, wallet):
    db_session.execute(
        text("""
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
            VALUES (:id, :user_id, :wallet, 'Test', :created_at)
        """),
        {
            "id": str(uuid4()),
            "user_id": str(user_id),
            "wallet": wallet,
            "created_at": datetime.now(UTC),
        },
    )


@pytest.fixture
def wallets(db_session, user_id):
    """Two wallets for the test user, plus one owned by a different user."""
    other_user_id = uuid4()
    for uid in (user_id, other_user_id):
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id)"), {"user_id": str(uid)}
        )
    _register_wallet(db_session, user_id, WALLET_A)
    _register_wallet(db_session, user_id, WALLET_B)
    _register_wallet(db_session, other_user_id, WALLET_OTHER_USER)
    db_session.commit()
    return {"owned": [WALLET_A, WALLET_B], "other": WALLET_OTHER_USER}


def _insert_position(
    db_session,
    wallet,
    day,
    *,
    asset_usd_value,
    symbols=("ETH",),
    protocol="Aave",
    chain="eth",
    name_item="Lending",
    hour=12,
):
    """Insert one position exactly as alpha-etl would write it."""
    snapshot_at = datetime(day.year, day.month, day.day, hour, tzinfo=UTC)
    position_id = str(uuid4())
    db_session.execute(
        text("""
            INSERT INTO analytics.daily_portfolio_positions
                (id, wallet, snapshot_at, snapshot_date, chain, source,
                 name, name_item, asset_usd_value, net_usd_value, asset_token_list)
            VALUES (:id, :wallet, :snapshot_at, :snapshot_date, :chain, 'debank',
                    :protocol, :name_item, :asset_usd_value, :asset_usd_value,
                    CAST(:asset_token_list AS jsonb))
        """),
        {
            "id": position_id,
            "wallet": wallet.lower(),
            "snapshot_at": snapshot_at,
            "snapshot_date": day,
            "chain": chain,
            "protocol": protocol,
            "name_item": name_item,
            "asset_usd_value": asset_usd_value,
            "asset_token_list": json.dumps([{"symbol": s} for s in symbols]),
        },
    )
    db_session.commit()
    return position_id


def _run(query_service, db_session, user_id, snapshot_date=None):
    return query_service.execute_query(
        db_session,
        QUERY_NAMES.POOL_PERFORMANCE_BY_USER,
        {
            "user_id": str(user_id),
            "snapshot_date": snapshot_date.isoformat() if snapshot_date else None,
        },
    )


def test_a_bound_date_selects_exactly_that_calendar_day(
    query_service, db_session, user_id, wallets
):
    """Neither the day before nor the day after may leak in."""
    wallet = wallets["owned"][0]
    _insert_position(db_session, wallet, date(2026, 3, 3), asset_usd_value=10)
    _insert_position(db_session, wallet, date(2026, 3, 4), asset_usd_value=20)
    _insert_position(db_session, wallet, date(2026, 3, 5), asset_usd_value=30)

    rows = _run(query_service, db_session, user_id, snapshot_date=date(2026, 3, 4))

    assert [float(row["asset_usd_value"]) for row in rows] == [20.0]


def test_a_bound_date_with_no_rows_returns_nothing(
    query_service, db_session, user_id, wallets
):
    """A gap day yields an empty pool list, never the nearest day."""
    _insert_position(
        db_session, wallets["owned"][0], date(2026, 3, 4), asset_usd_value=20
    )

    assert (
        _run(query_service, db_session, user_id, snapshot_date=date(2026, 3, 5)) == []
    )


def test_null_date_uses_each_wallets_own_latest_day(
    query_service, db_session, user_id, wallets
):
    """A wallet that stopped updating still contributes its last known day."""
    fresh, stale = wallets["owned"]
    _insert_position(db_session, fresh, date(2026, 3, 10), asset_usd_value=100)
    _insert_position(db_session, fresh, date(2026, 3, 9), asset_usd_value=999)
    _insert_position(db_session, stale, date(2026, 1, 2), asset_usd_value=50)
    _insert_position(db_session, stale, date(2026, 1, 1), asset_usd_value=999)

    rows = _run(query_service, db_session, user_id)

    assert sorted(float(row["asset_usd_value"]) for row in rows) == [50.0, 100.0]
    assert {row["wallet"] for row in rows} == {fresh.lower(), stale.lower()}


def test_the_same_wallet_registered_twice_is_not_double_counted(
    query_service, db_session, user_id, wallets
):
    """Re-registering an address in different casing must not inflate value."""
    wallet = wallets["owned"][0]
    _register_wallet(db_session, user_id, wallet.lower())
    db_session.commit()
    _insert_position(db_session, wallet, date(2026, 3, 4), asset_usd_value=100)

    rows = _run(query_service, db_session, user_id, snapshot_date=date(2026, 3, 4))

    assert [float(row["asset_usd_value"]) for row in rows] == [100.0]


def test_positions_sharing_a_signature_collapse_to_the_highest_value(
    query_service, db_session, user_id, wallets
):
    """Same wallet/chain/protocol/symbols keeps one row, not a sum."""
    wallet = wallets["owned"][0]
    day = date(2026, 3, 4)
    _insert_position(db_session, wallet, day, asset_usd_value=70, hour=8)
    _insert_position(db_session, wallet, day, asset_usd_value=30, hour=9)

    rows = _run(query_service, db_session, user_id, snapshot_date=day)

    assert [float(row["asset_usd_value"]) for row in rows] == [70.0]


def test_chain_and_protocol_case_variants_group_together(
    query_service, db_session, user_id, wallets
):
    """Case-normalised grouping prevents duplicate positions in the response."""
    wallet = wallets["owned"][0]
    day = date(2026, 3, 4)
    _insert_position(
        db_session, wallet, day, asset_usd_value=70, protocol="Aave", chain="eth"
    )
    _insert_position(
        db_session, wallet, day, asset_usd_value=30, protocol="AAVE", chain="ETH"
    )

    rows = _run(query_service, db_session, user_id, snapshot_date=day)

    assert len(rows) == 1
    assert rows[0]["protocol"] == "aave"
    assert rows[0]["chain"] == "eth"


def test_zero_value_positions_are_dropped(query_service, db_session, user_id, wallets):
    """Only positions carrying value reach the response."""
    wallet = wallets["owned"][0]
    day = date(2026, 3, 4)
    _insert_position(db_session, wallet, day, asset_usd_value=0, protocol="Empty")
    _insert_position(db_session, wallet, day, asset_usd_value=25, protocol="Aave")

    rows = _run(query_service, db_session, user_id, snapshot_date=day)

    assert [row["protocol"] for row in rows] == ["aave"]


def test_rows_carry_the_response_columns_and_contribution_shares(
    query_service, db_session, user_id, wallets
):
    """Contribution is a percentage of the returned pools' combined value."""
    wallet = wallets["owned"][0]
    day = date(2026, 3, 4)
    _insert_position(
        db_session, wallet, day, asset_usd_value=75, protocol="Aave", symbols=("ETH",)
    )
    _insert_position(
        db_session,
        wallet,
        day,
        asset_usd_value=25,
        protocol="Curve",
        symbols=("USDC", "DAI"),
    )

    rows = _run(query_service, db_session, user_id, snapshot_date=day)

    assert set(rows[0]) == {
        "wallet",
        "snapshot_id",
        "snapshot_ids",
        "chain",
        "protocol_id",
        "protocol",
        "protocol_name",
        "asset_usd_value",
        "pool_symbols",
        "contribution_to_portfolio",
    }
    # Ordered by value descending.
    assert [row["protocol"] for row in rows] == ["aave", "curve"]
    assert [float(row["contribution_to_portfolio"]) for row in rows] == [75.0, 25.0]
    assert rows[0]["pool_symbols"] == ["ETH"]
    assert rows[1]["pool_symbols"] == ["DAI", "USDC"]
    assert rows[0]["protocol_id"] == rows[0]["protocol"] == rows[0]["protocol_name"]
    assert rows[0]["wallet"] == wallet.lower()


def test_another_users_positions_are_never_returned(
    query_service, db_session, user_id, wallets
):
    """User scoping is enforced in SQL, not by the caller."""
    day = date(2026, 3, 4)
    _insert_position(db_session, wallets["owned"][0], day, asset_usd_value=10)
    _insert_position(db_session, wallets["other"], day, asset_usd_value=9999)

    rows = _run(query_service, db_session, user_id, snapshot_date=day)

    assert [float(row["asset_usd_value"]) for row in rows] == [10.0]

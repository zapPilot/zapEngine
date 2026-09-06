"""Boundary tests for wallet_token_snapshots_for_attribution.sql.

The wallet attribution aggregator trusts this query for user scoping and for the
window bounds. The upper bound is inclusive on purpose — ``end_date`` arrives as
"now" while ``snapshot_date`` is a calendar date — so it is asserted here rather
than only in the Python layer.
"""

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.services.shared.query_names import QUERY_NAMES

ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def wallets(db_session, user_id):
    """Two wallets for the test user, plus one owned by a different user."""
    owned = [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
    ]
    other_user_id = uuid4()
    other_wallet = "0x3333333333333333333333333333333333333333"

    for uid in (user_id, other_user_id):
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id)"), {"user_id": str(uid)}
        )
    for uid, wallet in [
        (user_id, owned[0]),
        (user_id, owned[1]),
        (other_user_id, other_wallet),
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
    return {"owned": owned, "other": other_wallet}


def _insert_token(
    db_session,
    wallet,
    token_address,
    symbol,
    amount,
    price,
    snapshot_date,
    chain="eth",
):
    db_session.execute(
        text("""
            INSERT INTO analytics.daily_wallet_tokens
                (user_wallet_address, token_address, chain, symbol,
                 amount, price, snapshot_date)
            VALUES (:wallet, :token_address, :chain, :symbol,
                    :amount, :price, :snapshot_date)
        """),
        {
            "wallet": wallet,
            "token_address": token_address,
            "chain": chain,
            "symbol": symbol,
            "amount": amount,
            "price": price,
            "snapshot_date": snapshot_date,
        },
    )
    db_session.commit()


def _run(
    query_service,
    db_session,
    user_id,
    *,
    start_date=datetime(2026, 1, 1, tzinfo=UTC),
    end_date=datetime(2026, 1, 31, 12, 0, tzinfo=UTC),
    wallet_address=None,
):
    return query_service.execute_query(
        db_session,
        QUERY_NAMES.WALLET_TOKEN_ATTRIBUTION_SNAPSHOTS,
        {
            "user_id": str(user_id),
            "wallet_address": wallet_address,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def test_rows_are_scoped_to_the_users_own_wallets(
    query_service, db_session, user_id, wallets
):
    """Another user's wallet is never returned, even on the same day."""
    first, second = wallets["owned"]
    day = date(2026, 1, 10)
    _insert_token(db_session, first, ETH, "ETH", 1.0, 3_000.0, day)
    _insert_token(db_session, second, ETH, "ETH", 4.0, 3_000.0, day)
    _insert_token(db_session, wallets["other"], ETH, "ETH", 9.0, 3_000.0, day)

    rows = _run(query_service, db_session, user_id)

    assert sorted(float(row["amount"]) for row in rows) == [1.0, 4.0]
    assert {row["wallet"] for row in rows} == {first.lower(), second.lower()}


def test_wallet_filter_is_case_insensitive(query_service, db_session, user_id, wallets):
    """A caller may pass a checksummed address; storage is lower-cased."""
    first, second = wallets["owned"]
    day = date(2026, 1, 10)
    _insert_token(db_session, first, ETH, "ETH", 1.0, 3_000.0, day)
    _insert_token(db_session, second, ETH, "ETH", 4.0, 3_000.0, day)

    rows = _run(query_service, db_session, user_id, wallet_address=second.upper())

    assert len(rows) == 1
    assert float(rows[0]["amount"]) == pytest.approx(4.0)
    assert rows[0]["wallet"] == second.lower()


def test_the_window_includes_both_of_its_bounds(
    query_service, db_session, user_id, wallets
):
    """end_date is "now" as a timestamp, so today's snapshot must still land."""
    wallet = wallets["owned"][0]
    for day, amount in [
        (date(2025, 12, 31), 1.0),
        (date(2026, 1, 1), 2.0),
        (date(2026, 1, 31), 3.0),
        (date(2026, 2, 1), 4.0),
    ]:
        _insert_token(db_session, wallet, ETH, "ETH", amount, 3_000.0, day)

    rows = _run(query_service, db_session, user_id)

    assert sorted(float(row["amount"]) for row in rows) == [2.0, 3.0]


def test_rows_are_ordered_and_carry_the_attribution_columns(
    query_service, db_session, user_id, wallets
):
    """The aggregator reads chain, token_address, symbol, amount, price, date."""
    wallet = wallets["owned"][0]
    _insert_token(
        db_session, wallet, USDC, "USDC", 500.0, 1.0, date(2026, 1, 20), chain="base"
    )
    _insert_token(db_session, wallet, ETH, "ETH", 2.0, 3_000.0, date(2026, 1, 10))

    rows = _run(query_service, db_session, user_id)

    assert [row["snapshot_date"] for row in rows] == [
        date(2026, 1, 10),
        date(2026, 1, 20),
    ]
    assert [row["symbol"] for row in rows] == ["ETH", "USDC"]
    assert [row["chain"] for row in rows] == ["eth", "base"]
    assert rows[1]["token_address"] == USDC
    assert float(rows[1]["price"]) == pytest.approx(1.0)

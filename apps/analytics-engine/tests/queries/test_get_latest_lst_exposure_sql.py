"""Boundary tests for get_latest_lst_exposure.sql.

The staking-income aggregator trusts this query to emit only idle wallet balances
and DeBank supply/collateral token lists, anchored to each wallet's latest day.
Borrow, reward, and asset token lists must never reach the aggregator as positive
exposure, so the SQL boundary is asserted here rather than only in the Python layer.
"""

import json
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.services.shared.query_names import QUERY_NAMES

WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0"
STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"
USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def wallets(db_session, user_id):
    """Two wallets for the test user, plus one wallet owned by a different user."""
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


def _insert_idle_token(
    db_session, wallet, token_address, symbol, amount, price, snapshot_date, chain="eth"
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


def _insert_position(
    db_session,
    wallet,
    detail,
    snapshot_date,
    *,
    source="debank",
    chain="eth",
    name_item="Lending",
    asset_token_list=None,
):
    position_id = str(uuid4())
    db_session.execute(
        text("""
            INSERT INTO analytics.daily_portfolio_positions
                (id, wallet, snapshot_at, snapshot_date, chain, source,
                 name, name_item, detail, asset_token_list)
            VALUES (:id, :wallet, :snapshot_at, :snapshot_date, :chain, :source,
                    'TestProtocol', :name_item,
                    CAST(:detail AS jsonb), CAST(:asset_token_list AS jsonb))
        """),
        {
            "id": position_id,
            "wallet": wallet,
            "snapshot_at": datetime.combine(
                snapshot_date, datetime.min.time(), tzinfo=UTC
            ),
            "snapshot_date": snapshot_date,
            "chain": chain,
            "source": source,
            "name_item": name_item,
            "detail": json.dumps(detail),
            "asset_token_list": json.dumps(asset_token_list or []),
        },
    )
    db_session.commit()
    return position_id


def _token(address, symbol, amount, price):
    return {"id": address, "optimized_symbol": symbol, "amount": amount, "price": price}


def _run(query_service, db_session, user_id, wallet_address=None):
    return query_service.execute_query(
        db_session,
        QUERY_NAMES.ETH_LST_LATEST_EXPOSURE,
        {"user_id": str(user_id), "wallet_address": wallet_address},
    )


def test_idle_tokens_use_only_the_latest_snapshot_day(
    query_service, db_session, user_id, wallets
):
    """Only the wallet's most recent daily_wallet_tokens day contributes exposure."""
    wallet = wallets["owned"][0]
    today = date(2026, 9, 4)
    _insert_idle_token(db_session, wallet, WSTETH, "wstETH", 2.0, 3000.0, today)
    _insert_idle_token(
        db_session, wallet, STETH, "stETH", 99.0, 3000.0, today - timedelta(days=1)
    )

    rows = _run(query_service, db_session, user_id)

    assert len(rows) == 1
    row = rows[0]
    assert row["token_address"] == WSTETH
    assert row["exposure_type"] == "idle"
    assert row["source_kind"] == "idle"
    assert row["source_id"] == wallet.lower()
    assert row["position_type"] is None
    assert float(row["amount"]) == pytest.approx(2.0)
    assert float(row["price"]) == pytest.approx(3000.0)


def test_only_supply_token_list_becomes_exposure(
    query_service, db_session, user_id, wallets
):
    """Borrow, reward, and asset token lists never surface as positive exposure."""
    wallet = wallets["owned"][0]
    position_id = _insert_position(
        db_session,
        wallet,
        {
            "supply_token_list": [_token(WSTETH, "wstETH", 2.0, 3000.0)],
            "borrow_token_list": [_token(STETH, "stETH", 5.0, 3000.0)],
            "reward_token_list": [_token(STETH, "stETH", 1.0, 3000.0)],
        },
        date(2026, 9, 4),
        asset_token_list=[_token(STETH, "stETH", 7.0, 3000.0)],
    )

    rows = _run(query_service, db_session, user_id)

    assert len(rows) == 1
    row = rows[0]
    assert row["token_address"] == WSTETH
    assert row["exposure_type"] == "supply"
    assert row["source_kind"] == "position"
    assert row["source_id"] == position_id
    assert row["position_type"] == "Lending"


def test_lp_position_type_is_reported_for_downstream_exclusion(
    query_service, db_session, user_id, wallets
):
    """name_item reaches the aggregator so LP/Farming constituents can be dropped."""
    _insert_position(
        db_session,
        wallets["owned"][0],
        {"supply_token_list": [_token(WSTETH, "wstETH", 1.0, 3000.0)]},
        date(2026, 9, 4),
        name_item="Liquidity Pool",
    )

    rows = _run(query_service, db_session, user_id)

    assert [row["position_type"] for row in rows] == ["Liquidity Pool"]


def test_hyperliquid_rows_neither_emit_nor_move_the_debank_anchor(
    query_service, db_session, user_id, wallets
):
    """A newer non-DeBank day must not hide the latest DeBank position day."""
    wallet = wallets["owned"][0]
    _insert_position(
        db_session,
        wallet,
        {"supply_token_list": [_token(WSTETH, "wstETH", 2.0, 3000.0)]},
        date(2026, 9, 4),
    )
    _insert_position(
        db_session,
        wallet,
        {"supply_token_list": [_token(WSTETH, "wstETH", 50.0, 3000.0)]},
        date(2026, 9, 5),
        source="hyperliquid",
    )

    rows = _run(query_service, db_session, user_id)

    assert len(rows) == 1
    assert float(rows[0]["amount"]) == pytest.approx(2.0)


def test_wallet_filter_and_user_ownership_scope_results(
    query_service, db_session, user_id, wallets
):
    """The wallet filter narrows results; another user's wallet is never returned."""
    first, second = wallets["owned"]
    today = date(2026, 9, 4)
    _insert_idle_token(db_session, first, WSTETH, "wstETH", 1.0, 3000.0, today)
    _insert_idle_token(db_session, second, WSTETH, "wstETH", 4.0, 3000.0, today)
    _insert_idle_token(
        db_session, wallets["other"], WSTETH, "wstETH", 9.0, 3000.0, today
    )

    all_rows = _run(query_service, db_session, user_id)
    assert sorted(float(row["amount"]) for row in all_rows) == [1.0, 4.0]

    filtered = _run(query_service, db_session, user_id, wallet_address=second.upper())
    assert len(filtered) == 1
    assert float(filtered[0]["amount"]) == pytest.approx(4.0)
    assert filtered[0]["source_id"] == second.lower()


def test_non_lst_tokens_still_reach_the_registry_filter(
    query_service, db_session, user_id, wallets
):
    """The SQL is address-agnostic: eligibility is decided by the Python registry."""
    _insert_idle_token(
        db_session, wallets["owned"][0], USDC, "USDC", 100.0, 1.0, date(2026, 9, 4)
    )

    rows = _run(query_service, db_session, user_id)

    assert [row["token_address"] for row in rows] == [USDC]

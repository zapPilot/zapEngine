"""Regression tests for the database-owned incremental portfolio rollups."""

from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.orm import Session


def _insert_user_and_wallet(
    db_session: Session,
    *,
    user_id: str,
    wallet_id: str,
    wallet: str,
) -> None:
    db_session.execute(
        text("INSERT INTO users (id) VALUES (:user_id)"),
        {"user_id": user_id},
    )
    db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet)
            VALUES (:wallet_id, :user_id, :wallet)
            """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet},
    )


def _insert_portfolio_snapshot(
    db_session: Session,
    *,
    snapshot_id: str,
    user_id: str,
    wallet: str,
    protocol: str,
    snapshot_at: str,
    symbol: str,
    amount: str,
    price: str = "1",
) -> None:
    db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
              id,
              user_id,
              wallet,
              snapshot_at,
              chain,
              name,
              id_raw,
              name_item,
              asset_token_list,
              asset_usd_value,
              debt_usd_value,
              net_usd_value
            )
            VALUES (
              :snapshot_id,
              :user_id,
              :wallet,
              :snapshot_at,
              'ethereum',
              :protocol,
              :protocol,
              :snapshot_id,
              CAST(:asset_token_list AS jsonb),
              CAST(:amount AS numeric) * CAST(:price AS numeric),
              0,
              CAST(:amount AS numeric) * CAST(:price AS numeric)
            )
            """
        ),
        {
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "wallet": wallet,
            "protocol": protocol,
            "snapshot_at": snapshot_at,
            "asset_token_list": json.dumps(
                [{"symbol": symbol, "amount": amount, "price": price}]
            ),
            "amount": amount,
            "price": price,
        },
    )


def test_incremental_rollups_preserve_batches_latest_wallet_and_trend_history(
    db_session: Session,
    refresh_materialized_views,
) -> None:
    wallet = "0xAbC"
    _insert_user_and_wallet(
        db_session,
        user_id="rollup-user-a",
        wallet_id="rollup-wallet-a",
        wallet=wallet,
    )
    db_session.execute(text("INSERT INTO users (id) VALUES ('rollup-user-b')"))

    _insert_portfolio_snapshot(
        db_session,
        snapshot_id="morpho-old",
        user_id="rollup-user-a",
        wallet=wallet,
        protocol="morpho",
        snapshot_at="2026-07-20T09:00:00Z",
        symbol="USDC",
        amount="1",
    )
    # Two legitimate positions share one protocol-level id_raw and timestamp.
    _insert_portfolio_snapshot(
        db_session,
        snapshot_id="morpho-latest-a",
        user_id="rollup-user-a",
        wallet=wallet,
        protocol="morpho",
        snapshot_at="2026-07-20T10:00:00Z",
        symbol="USDC",
        amount="2",
    )
    _insert_portfolio_snapshot(
        db_session,
        snapshot_id="morpho-latest-b",
        user_id="rollup-user-a",
        wallet=wallet,
        protocol="morpho",
        snapshot_at="2026-07-20T10:00:00Z",
        symbol="USDC",
        amount="3",
    )
    _insert_portfolio_snapshot(
        db_session,
        snapshot_id="aave-latest",
        user_id="rollup-user-a",
        wallet=wallet,
        protocol="aave",
        snapshot_at="2026-07-20T08:00:00Z",
        symbol="WETH",
        amount="2",
        price="20",
    )

    db_session.execute(
        text(
            """
            INSERT INTO alpha_raw.wallet_token_snapshots (
              id,
              user_wallet_address,
              token_address,
              chain,
              symbol,
              amount,
              price,
              is_wallet,
              time_at,
              inserted_at
            )
            VALUES
              ('wallet-old', :wallet, '0xold', 'ethereum', 'WBTC', 1, 10, true, 100, '2026-07-20'),
              ('wallet-latest-a', :wallet, '0xa', 'ethereum', 'WBTC', 2, 10, true, 200, '2026-07-20'),
              ('wallet-latest-b', :wallet, '0xb', 'ethereum', 'ETH', 1, 20, true, 200, '2026-07-20')
            """
        ),
        {"wallet": wallet},
    )

    refresh_materialized_views()

    portfolio_ids = db_session.execute(
        text(
            """
            SELECT id
            FROM daily_portfolio_snapshots
            ORDER BY id
            """
        )
    ).scalars()
    assert list(portfolio_ids) == [
        "aave-latest",
        "morpho-latest-a",
        "morpho-latest-b",
    ]

    wallet_ids = db_session.execute(
        text(
            """
            SELECT id
            FROM alpha_raw.daily_wallet_token_snapshots
            ORDER BY id
            """
        )
    ).scalars()
    assert list(wallet_ids) == ["wallet-latest-a", "wallet-latest-b"]

    # Moving a row between protocol keys invalidates both old and new keys.
    db_session.execute(
        text(
            """
            UPDATE portfolio_item_snapshots
            SET name = 'compound'
            WHERE id = 'aave-latest'
            """
        )
    )
    refresh_materialized_views()
    moved_protocol = db_session.execute(
        text(
            """
            SELECT name
            FROM daily_portfolio_snapshots
            WHERE id = 'aave-latest'
            """
        )
    ).scalar_one()
    stale_protocol_rows = db_session.execute(
        text(
            """
            SELECT count(*)
            FROM daily_portfolio_snapshots
            WHERE name = 'aave'
            """
        )
    ).scalar_one()
    assert moved_protocol == "compound"
    assert stale_protocol_rows == 0

    _insert_portfolio_snapshot(
        db_session,
        snapshot_id="morpho-day-two",
        user_id="rollup-user-a",
        wallet=wallet,
        protocol="morpho",
        snapshot_at="2026-07-21T10:00:00Z",
        symbol="USDC",
        amount="8",
    )
    refresh_materialized_views()

    stablecoin_trend = db_session.execute(
        text(
            """
            SELECT date, category_value_usd, pnl_usd
            FROM portfolio_category_trend_mv
            WHERE user_id = 'rollup-user-a'
              AND source_type = 'defi'
              AND category = 'stablecoins'
            ORDER BY date
            """
        )
    ).all()
    assert [
        (str(row.date), float(row.category_value_usd), float(row.pnl_usd))
        for row in stablecoin_trend
    ] == [
        ("2026-07-20", 5.0, 0.0),
        ("2026-07-21", 8.0, 3.0),
    ]

    # Rebinding a wallet rebuilds both users' complete histories.
    db_session.execute(
        text(
            """
            UPDATE user_crypto_wallets
            SET user_id = 'rollup-user-b'
            WHERE id = 'rollup-wallet-a'
            """
        )
    )
    refresh_materialized_views()

    old_user_rows = db_session.execute(
        text(
            """
            SELECT count(*)
            FROM portfolio_category_trend_mv
            WHERE user_id = 'rollup-user-a'
            """
        )
    ).scalar_one()
    new_user_rows = db_session.execute(
        text(
            """
            SELECT count(*)
            FROM portfolio_category_trend_mv
            WHERE user_id = 'rollup-user-b'
            """
        )
    ).scalar_one()
    assert old_user_rows == 0
    assert new_user_rows > 0

    # Deleting the latest protocol batch exposes the previous batch.
    db_session.execute(
        text(
            """
            DELETE FROM portfolio_item_snapshots
            WHERE id IN ('morpho-latest-a', 'morpho-latest-b')
            """
        )
    )
    refresh_materialized_views()
    morpho_ids = db_session.execute(
        text(
            """
            SELECT id
            FROM daily_portfolio_snapshots
            WHERE name = 'morpho'
              AND snapshot_date = DATE '2026-07-20'
            """
        )
    ).scalars()
    assert list(morpho_ids) == ["morpho-old"]

    empty_run = (
        db_session.execute(
            text("SELECT * FROM private.process_portfolio_rollup_queue()")
        )
        .mappings()
        .one()
    )
    assert empty_run["portfolio_keys_processed"] == 0
    assert empty_run["wallet_keys_processed"] == 0
    assert empty_run["users_processed"] == 0


def test_rollup_queue_dequeue_rolls_back_atomically(
    db_session: Session,
) -> None:
    _insert_user_and_wallet(
        db_session,
        user_id="rollback-user",
        wallet_id="rollback-wallet",
        wallet="0xRollback",
    )
    _insert_portfolio_snapshot(
        db_session,
        snapshot_id="rollback-snapshot",
        user_id="rollback-user",
        wallet="0xRollback",
        protocol="aave",
        snapshot_at="2026-07-22T10:00:00Z",
        symbol="USDC",
        amount="10",
    )

    nested = db_session.begin_nested()
    processed = (
        db_session.execute(
            text("SELECT * FROM private.process_portfolio_rollup_queue()")
        )
        .mappings()
        .one()
    )
    assert processed["portfolio_keys_processed"] == 1
    nested.rollback()

    queued_after_rollback = db_session.execute(
        text("SELECT count(*) FROM private.portfolio_rollup_dirty_portfolio")
    ).scalar_one()
    assert queued_after_rollback == 1

    processed_again = (
        db_session.execute(
            text("SELECT * FROM private.process_portfolio_rollup_queue()")
        )
        .mappings()
        .one()
    )
    assert processed_again["portfolio_keys_processed"] == 1

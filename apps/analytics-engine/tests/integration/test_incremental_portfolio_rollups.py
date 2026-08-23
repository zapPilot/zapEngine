"""Regression tests for canonical daily batch snapshots and trend rebuilds."""

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


def _insert_daily_position(
    db_session: Session,
    *,
    snapshot_id: str,
    wallet: str,
    snapshot_at: str,
    snapshot_date: str,
    name_item: str,
    symbol: str,
    amount: str,
) -> None:
    db_session.execute(
        text(
            """
            INSERT INTO analytics.daily_portfolio_positions (
              id,
              wallet,
              snapshot_at,
              snapshot_date,
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
              lower(:wallet),
              :snapshot_at,
              CAST(:snapshot_date AS date),
              'ethereum',
              'morpho',
              'shared-protocol-id',
              :name_item,
              CAST(:asset_token_list AS jsonb),
              CAST(:amount AS numeric),
              0,
              CAST(:amount AS numeric)
            )
            """
        ),
        {
            "snapshot_id": snapshot_id,
            "wallet": wallet,
            "snapshot_at": snapshot_at,
            "snapshot_date": snapshot_date,
            "name_item": name_item,
            "asset_token_list": json.dumps(
                [{"symbol": symbol, "amount": amount, "price": "1"}]
            ),
            "amount": amount,
        },
    )


def _rebuild_trends(db_session: Session, user_ids: list[str] | None):
    return (
        db_session.execute(
            text(
                """
                SELECT users_processed, trend_rows_written
                FROM analytics.rebuild_category_trends(:user_ids)
                """
            ),
            {"user_ids": user_ids},
        )
        .mappings()
        .one()
    )


def test_replace_batches_preserve_positions_and_complete_wallet_tokens(
    db_session: Session,
) -> None:
    wallet = "0xAbC"
    _insert_user_and_wallet(
        db_session,
        user_id="daily-user",
        wallet_id="daily-wallet",
        wallet=wallet,
    )

    _insert_daily_position(
        db_session,
        snapshot_id="old-position",
        wallet=wallet,
        snapshot_at="2026-07-20T09:00:00Z",
        snapshot_date="2026-07-20",
        name_item="old",
        symbol="USDC",
        amount="1",
    )

    # A retry replaces the whole wallet/day slice. Both rows in the replacement
    # are legitimate even though their protocol-level id_raw is identical.
    db_session.execute(
        text(
            """
            DELETE FROM analytics.daily_portfolio_positions
            WHERE wallet = lower(:wallet)
              AND snapshot_date = DATE '2026-07-20'
            """
        ),
        {"wallet": wallet},
    )
    _insert_daily_position(
        db_session,
        snapshot_id="latest-a",
        wallet=wallet,
        snapshot_at="2026-07-20T10:00:00Z",
        snapshot_date="2026-07-20",
        name_item="position-a",
        symbol="USDC",
        amount="2",
    )
    _insert_daily_position(
        db_session,
        snapshot_id="latest-b",
        wallet=wallet,
        snapshot_at="2026-07-20T10:00:00Z",
        snapshot_date="2026-07-20",
        name_item="position-b",
        symbol="USDC",
        amount="3",
    )
    _insert_daily_position(
        db_session,
        snapshot_id="day-two",
        wallet=wallet,
        snapshot_at="2026-07-21T10:00:00Z",
        snapshot_date="2026-07-21",
        name_item="position-c",
        symbol="USDC",
        amount="8",
    )

    db_session.execute(
        text(
            """
            INSERT INTO analytics.daily_wallet_tokens (
              user_wallet_address,
              token_address,
              chain,
              symbol,
              amount,
              price,
              snapshot_date
            )
            VALUES
              (lower(:wallet), '0xa', 'ethereum', 'WBTC', 2, 10, DATE '2026-07-20'),
              (lower(:wallet), '0xb', 'ethereum', 'ETH', 1, 20, DATE '2026-07-20')
            """
        ),
        {"wallet": wallet},
    )

    metrics = _rebuild_trends(db_session, ["daily-user"])

    assert metrics["users_processed"] == 1
    assert metrics["trend_rows_written"] > 0
    ids = db_session.execute(
        text("SELECT id FROM daily_portfolio_snapshots ORDER BY id")
    ).scalars()
    assert list(ids) == ["day-two", "latest-a", "latest-b"]

    wallet_tokens = db_session.execute(
        text(
            """
            SELECT token_address
            FROM alpha_raw.daily_wallet_token_snapshots
            ORDER BY token_address
            """
        )
    ).scalars()
    assert list(wallet_tokens) == ["0xa", "0xb"]

    stablecoin_trend = db_session.execute(
        text(
            """
            SELECT date, category_value_usd, pnl_usd
            FROM portfolio_category_trend_mv
            WHERE user_id = 'daily-user'
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


def test_scoped_trend_rebuild_is_idempotent_and_transactional(
    db_session: Session,
) -> None:
    _insert_user_and_wallet(
        db_session,
        user_id="trend-user",
        wallet_id="trend-wallet",
        wallet="0xTrend",
    )
    _insert_daily_position(
        db_session,
        snapshot_id="trend-position",
        wallet="0xTrend",
        snapshot_at="2026-07-22T10:00:00Z",
        snapshot_date="2026-07-22",
        name_item="position",
        symbol="USDC",
        amount="10",
    )

    first = _rebuild_trends(db_session, ["trend-user"])
    second = _rebuild_trends(db_session, ["trend-user"])
    assert first == second

    before = db_session.execute(
        text(
            """
            SELECT category_value_usd
            FROM analytics.daily_category_trends
            WHERE user_id = 'trend-user'
              AND source_type = 'defi'
              AND category = 'stablecoins'
            """
        )
    ).scalar_one()

    nested = db_session.begin_nested()
    db_session.execute(
        text(
            """
            UPDATE analytics.daily_portfolio_positions
            SET asset_token_list = '[{"symbol":"USDC","amount":"99","price":"1"}]'
            WHERE id = 'trend-position'
            """
        )
    )
    _rebuild_trends(db_session, ["trend-user"])
    nested.rollback()

    after = db_session.execute(
        text(
            """
            SELECT category_value_usd
            FROM analytics.daily_category_trends
            WHERE user_id = 'trend-user'
              AND source_type = 'defi'
              AND category = 'stablecoins'
            """
        )
    ).scalar_one()
    assert after == before

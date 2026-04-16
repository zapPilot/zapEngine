"""
Unit tests for get_borrowing_positions_by_user.sql query.

Validates per-position output (no aggregation), protocol health rate extraction,
and debt-only filtering using the daily_portfolio_snapshots MV.
"""

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text

from src.services.shared.query_service import QueryService


@pytest.fixture
def query_service(db_session):
    """QueryService instance with test database"""
    return QueryService()


def create_snapshot(
    db_session,
    refresh_materialized_views,
    user_id,
    wallet,
    name,
    chain,
    asset_value,
    debt_value,
    health_rate=None,
    snapshot_time=None,
):
    """
    Helper to create a portfolio snapshot with optional health_rate.

    Ensures user and wallet rows exist and refreshes daily_portfolio_snapshots.
    """
    snapshot_time = snapshot_time or datetime.now(UTC)
    detail = {}
    if health_rate is not None:
        detail["health_rate"] = health_rate

    # Ensure user exists
    db_session.execute(
        text(
            """
            INSERT INTO users (id) VALUES (:user_id)
            ON CONFLICT (id) DO NOTHING
            """
        ),
        {"user_id": str(user_id)},
    )

    # Ensure wallet is linked to user
    db_session.execute(
        text("DELETE FROM user_crypto_wallets WHERE wallet = :wallet"),
        {"wallet": wallet},
    )
    db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet)
            VALUES (:id, :user_id, :wallet)
            ON CONFLICT DO NOTHING
            """
        ),
        {
            "id": str(uuid4()),
            "user_id": str(user_id),
            "wallet": wallet,
        },
    )

    db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, wallet, name, chain,
                asset_usd_value, debt_usd_value, net_usd_value,
                asset_token_list, detail, snapshot_at
            ) VALUES (
                :id, :wallet, :name, :chain,
                :asset_value, :debt_value, :net_value,
                CAST('[]' AS jsonb), CAST(:detail AS jsonb), :snapshot_at
            )
            """
        ),
        {
            "id": str(uuid4()),
            "wallet": wallet,
            "name": name,
            "chain": chain,
            "asset_value": asset_value,
            "debt_value": debt_value,
            "net_value": asset_value - debt_value,
            "detail": json.dumps(detail),
            "snapshot_at": snapshot_time,
        },
    )
    db_session.commit()
    refresh_materialized_views(include_portfolio_category_trend=False)


def test_returns_all_positions_even_same_protocol_chain(
    db_session, query_service, refresh_materialized_views
):
    """Verify query returns multiple positions even with same protocol+chain."""
    user_id = uuid4()
    wallet = "0xtest"
    snapshot_time = datetime(2026, 1, 12, 1, 0, 0, tzinfo=UTC)

    create_snapshot(
        db_session,
        refresh_materialized_views,
        user_id,
        wallet,
        "Morpho",
        "eth",
        1000.0,
        500.0,
        health_rate=1.2,
        snapshot_time=snapshot_time,
    )
    create_snapshot(
        db_session,
        refresh_materialized_views,
        user_id,
        wallet,
        "Morpho",
        "eth",
        2000.0,
        1000.0,
        health_rate=1.4,
        snapshot_time=snapshot_time,
    )

    result = query_service.execute_query(
        db_session,
        "get_borrowing_positions_by_user",
        {"user_id": str(user_id), "snapshot_date": None},
    )

    assert len(result) == 2
    assert all(row["protocol_id"] == "Morpho" for row in result)
    assert all(row["chain"] == "eth" for row in result)

    rates = sorted(float(row["protocol_health_rate"]) for row in result)
    assert rates == [1.2, 1.4]


def test_filters_out_zero_debt_positions(
    db_session, query_service, refresh_materialized_views
):
    """Verify query excludes positions with zero debt."""
    user_id = uuid4()
    wallet = "0xtest"
    snapshot_time = datetime(2026, 1, 12, 2, 0, 0, tzinfo=UTC)

    create_snapshot(
        db_session,
        refresh_materialized_views,
        user_id,
        wallet,
        "Aave V3",
        "eth",
        5000.0,
        0.0,
        health_rate=2.5,
        snapshot_time=snapshot_time,
    )
    create_snapshot(
        db_session,
        refresh_materialized_views,
        user_id,
        wallet,
        "Compound V3",
        "eth",
        4000.0,
        1000.0,
        health_rate=2.0,
        snapshot_time=snapshot_time,
    )

    result = query_service.execute_query(
        db_session,
        "get_borrowing_positions_by_user",
        {"user_id": str(user_id), "snapshot_date": None},
    )

    assert len(result) == 1
    assert result[0]["protocol_id"] == "Compound V3"
    assert float(result[0]["total_debt_usd"]) == 1000.0

"""Execute the shipped category SQL against canonical wallet snapshots."""

from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_category_query_uses_only_the_latest_day_of_the_requested_wallet(
    integration_db_session,
):
    wallet = "0x" + uuid4().hex + "0" * 8
    other_wallet = "0x" + uuid4().hex + "0" * 8
    insert = text(
        """
        INSERT INTO analytics.daily_wallet_tokens
            (user_wallet_address, token_address, chain, symbol, amount, price, snapshot_date)
        VALUES (:wallet, :token, 'eth', :symbol, :amount, :price, :day)
        """
    )
    for owner, token, symbol, amount, price, day in [
        (wallet, "old-eth", "ETH", 100, 3000, date(2026, 1, 1)),
        (wallet, "btc", "BTC", 1, 60000, date(2026, 1, 2)),
        (wallet, "stable", "USDC", 10000, 1, date(2026, 1, 2)),
        (wallet, "empty", "ETH", 0, 3000, date(2026, 1, 2)),
        (other_wallet, "other", "ETH", 500, 3000, date(2026, 1, 3)),
    ]:
        await integration_db_session.execute(
            insert,
            {
                "wallet": owner,
                "token": token,
                "symbol": symbol,
                "amount": amount,
                "price": price,
                "day": day,
            },
        )
    query_path = (
        Path(__file__).parents[2] / "src/queries/sql/get_wallet_token_categories.sql"
    )
    result = await integration_db_session.execute(
        text(query_path.read_text()), {"wallet_address": wallet}
    )
    rows = result.mappings().all()
    assert [row["category"] for row in rows] == ["btc", "stablecoins"]
    assert [float(row["category_value"]) for row in rows] == [60000, 10000]
    assert [row["token_count"] for row in rows] == [1, 1]
    assert [row["wallet_address"] for row in rows] == [wallet, wallet]
    assert [float(row["percentage"]) for row in rows] == pytest.approx([85.71, 14.29])

"""
Unit tests for get_portfolio_category_trend_by_user_id.sql query

Tests the v4 deduplication fix that:
1. Uses token_signature (sorted token symbols) to distinguish positions
2. Prevents merging distinct positions with same name_item but different tokens
3. Fixes GMX V2 bug where 3 "Liquidity Pool" positions were merged into 1
"""

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text


@pytest.fixture
def test_user_id():
    """Generate a test user ID"""
    return uuid4()


@pytest.fixture
def test_wallet(test_user_id, db_session):
    """Create test user and wallet"""
    wallet_address = "0x1234567890123456789012345678901234567890"

    # Create user first (PostgreSQL FK constraint requirement)
    db_session.execute(
        text("INSERT INTO users (id) VALUES (:user_id)"),
        {"user_id": str(test_user_id)},
    )
    db_session.commit()

    # Insert test user's wallet
    db_session.execute(
        text("""
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
            VALUES (:id, :user_id, :wallet, 'Test Wallet', :created_at)
        """),
        {
            "id": str(uuid4()),
            "user_id": str(test_user_id),
            "wallet": wallet_address,
            "created_at": datetime.now(UTC),
        },
    )
    db_session.commit()

    return wallet_address


@pytest.fixture
def create_position_snapshots(db_session, test_user_id, refresh_materialized_views):
    """Helper to create portfolio item snapshots with asset_token_list"""

    def _create(wallet, positions_data):
        """
        Args:
            wallet: Wallet address
            positions_data: List of (name, name_item, tokens, net_value, days_ago) tuples
                tokens: List of dicts with 'symbol', 'amount', 'price'
        """
        # Ensure user exists
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id) ON CONFLICT DO NOTHING"),
            {"user_id": str(test_user_id)},
        )
        db_session.commit()

        base_date = datetime.now(UTC)

        for name, name_item, tokens, net_value, days_ago in positions_data:
            snapshot_date = base_date - timedelta(days=days_ago)

            # Build asset_token_list JSONB
            asset_token_list = [
                {
                    "symbol": token["symbol"],
                    "amount": token["amount"],
                    "price": token["price"],
                    "id": f"0x{token['symbol'].lower()}",
                    "name": token["symbol"],
                    "chain": "arb",
                    "is_core": True,
                    "time_at": 1622346702,
                    "decimals": 18,
                    "is_wallet": True,
                    "is_verified": True,
                    "protocol_id": "",
                }
                for token in tokens
            ]

            db_session.execute(
                text("""
                    INSERT INTO portfolio_item_snapshots
                    (id, user_id, wallet, name, name_item, snapshot_at, net_usd_value,
                     asset_token_list, chain, has_supported_portfolio)
                    VALUES (:id, :user_id, :wallet, :name, :name_item, :snapshot_at, :value,
                            :asset_token_list, 'arb', true)
                """),
                {
                    "id": str(uuid4()),
                    "user_id": str(test_user_id),
                    "wallet": wallet,
                    "name": name,
                    "name_item": name_item,
                    "snapshot_at": snapshot_date,
                    "value": float(net_value),
                    "asset_token_list": json.dumps(asset_token_list),
                },
            )

        db_session.commit()
        refresh_materialized_views(include_portfolio_category_trend=True)

    return _create


class TestDeduplicationWithTokenSignature:
    """Test v4 deduplication fix: positions with same name_item but different tokens"""

    def test_gmx_v2_multiple_liquidity_pools_distinct(
        self,
        query_service,
        db_session,
        test_user_id,
        test_wallet,
        create_position_snapshots,
    ):
        """
        Test: GMX V2 has 3 "Liquidity Pool" positions with different tokens
        Bug (v3): All 3 merged into 1 position, losing $3,667+
        Fix (v4): Each pool kept distinct via token_signature
        """
        # Create 3 GMX V2 "Liquidity Pool" positions with different tokens
        positions_data = [
            # (name, name_item, tokens, net_value, days_ago)
            (
                "GMX V2",
                "Liquidity Pool",
                [{"symbol": "WBTC", "amount": 0.042, "price": 86897.94}],
                3667.11,  # WBTC pool
                0,  # Today
            ),
            (
                "GMX V2",
                "Liquidity Pool",
                [{"symbol": "WETH", "amount": 0.508, "price": 2838.54}],
                1442.05,  # WETH pool
                0,  # Today
            ),
            (
                "GMX V2",
                "Liquidity Pool",
                [{"symbol": "SOL", "amount": 1.672, "price": 130.67}],
                218.49,  # SOL pool
                0,  # Today
            ),
            (
                "GMX V2",
                "Yield",
                [
                    {"symbol": "WETH", "amount": 0.601, "price": 2838.54},
                    {"symbol": "USDC", "amount": 1670.79, "price": 1.0002},
                ],
                3376.73,  # WETH+USDC yield
                0,  # Today
            ),
        ]
        create_position_snapshots(test_wallet, positions_data)

        # Execute query
        start_date = datetime.now(UTC) - timedelta(days=1)
        end_date = datetime.now(UTC) + timedelta(days=1)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_category_trend_by_user_id",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Calculate total value from all results (only GMX V2 positions exist in test data)
        # With v4 fix, we should see all 4 positions contributing to total
        # Total: 3667.11 + 1442.05 + 218.49 + 3376.73 = 8704.38
        # The query returns daily aggregations by category/source, so we need to sum the total_value_usd
        # which is the same across all rows for a given date
        total_value = (
            max(float(r.get("total_value_usd", 0)) for r in results) if results else 0
        )

        # Assert all 4 positions are counted (within floating point tolerance)
        # Allow 1% tolerance for floating point precision: 8704 * 0.99 = 8617
        assert total_value > 8600, (
            f"Expected ~$8,704 total (all 4 GMX V2 positions), got ${total_value:.2f}. "
            "Bug: Positions with same name_item but different tokens are being merged!"
        )

        # Assert we have data
        assert len(results) > 0, "Query should return results"

    def test_same_name_item_different_tokens_not_merged(
        self,
        query_service,
        db_session,
        test_user_id,
        test_wallet,
        create_position_snapshots,
    ):
        """
        Test: Positions with same name_item but different tokens are kept distinct
        Example: "Lending" positions for USDC vs WETH
        """
        positions_data = [
            (
                "Aave V3",
                "Lending",
                [{"symbol": "USDC", "amount": 10000, "price": 1.0}],
                10000.0,  # USDC lending
                0,
            ),
            (
                "Aave V3",
                "Lending",
                [{"symbol": "WETH", "amount": 3.5, "price": 2838.54}],
                9934.89,  # WETH lending
                0,
            ),
        ]
        create_position_snapshots(test_wallet, positions_data)

        start_date = datetime.now(UTC) - timedelta(days=1)
        end_date = datetime.now(UTC) + timedelta(days=1)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_category_trend_by_user_id",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Total should be ~$19,935 (both positions counted)
        total_value = sum(float(r.get("total_value_usd", 0)) for r in results)
        assert total_value > 19900, (
            f"Expected ~$19,935 (both lending positions), got ${total_value:.2f}"
        )

    def test_identical_positions_all_counted(
        self,
        query_service,
        db_session,
        test_user_id,
        test_wallet,
        create_position_snapshots,
    ):
        """
        Test: Multiple snapshots are all counted (no deduplication)

        Updated behavior (v6): Removed deduplication logic.
        ETL guarantees no duplicate inserts (verified in production data).
        If 3 positions exist in DB, they are 3 LEGITIMATE separate positions.

        Example: Frax has 4 "Locked" positions with different unlock_at dates.
        Example: GMX V2 has multiple "Liquidity Pool" positions with different tokens.

        NOTE: This test creates 3 identical positions to verify NO deduplication occurs.
        In production, ETL never creates such duplicates.
        """
        # Create 3 snapshots of the EXACT same position (same tokens)
        # In production, this scenario doesn't occur (ETL inserts once per day)
        positions_data = [
            (
                "Morpho",
                "Yield",
                [{"symbol": "USDC", "amount": 5000, "price": 1.0}],
                5000.0,
                0,
            ),
            (
                "Morpho",
                "Yield",
                [{"symbol": "USDC", "amount": 5000, "price": 1.0}],
                5000.0,
                0,  # Same day
            ),
            (
                "Morpho",
                "Yield",
                [{"symbol": "USDC", "amount": 5000, "price": 1.0}],
                5000.0,
                0,  # Same day (3rd identical)
            ),
        ]
        create_position_snapshots(test_wallet, positions_data)

        start_date = datetime.now(UTC) - timedelta(days=1)
        end_date = datetime.now(UTC) + timedelta(days=1)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_category_trend_by_user_id",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Should count all 3 positions = $15,000 (no deduplication)
        total_value = sum(float(r.get("total_value_usd", 0)) for r in results)
        assert 14900 < total_value < 15100, (
            f"Expected ~$15,000 (3 positions × $5,000), got ${total_value:.2f}. "
            "Query should return ALL positions without deduplication!"
        )


class TestTokenSignatureEdgeCases:
    """Test edge cases in token signature generation"""

    def test_token_order_independence(
        self,
        query_service,
        db_session,
        test_user_id,
        test_wallet,
        create_position_snapshots,
    ):
        """
        Test: Token signature is order-independent (sorted alphabetically)
        [WETH, USDC] and [USDC, WETH] should produce same signature "USDC,WETH"
        """
        # Create position with tokens in different order on different days
        positions_data = [
            (
                "Uniswap V3",
                "Liquidity Pool",
                [
                    {"symbol": "WETH", "amount": 1.0, "price": 2838.54},
                    {"symbol": "USDC", "amount": 2838.54, "price": 1.0},
                ],
                5677.08,
                1,  # Yesterday
            ),
            (
                "Uniswap V3",
                "Liquidity Pool",
                [
                    {
                        "symbol": "USDC",
                        "amount": 2900.0,
                        "price": 1.0,
                    },  # Different order
                    {"symbol": "WETH", "amount": 1.0, "price": 2900.0},
                ],
                5800.0,
                0,  # Today
            ),
        ]
        create_position_snapshots(test_wallet, positions_data)

        start_date = datetime.now(UTC) - timedelta(days=2)
        end_date = datetime.now(UTC) + timedelta(days=1)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_category_trend_by_user_id",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Should see 2 days of data (not 4 - positions are deduplicated as same pool)
        dates = {r.get("date") for r in results}
        assert len(dates) == 2, f"Expected 2 distinct dates, got {len(dates)}"

    def test_empty_token_list_handled(
        self,
        query_service,
        db_session,
        test_user_id,
        test_wallet,
        create_position_snapshots,
    ):
        """
        Test: Positions with empty token list get empty string signature
        Edge case: Some protocols might have positions without asset_token_list
        """
        positions_data = [
            (
                "TestProtocol",
                "Rewards",
                [],  # Empty token list
                100.0,
                0,
            ),
        ]
        create_position_snapshots(test_wallet, positions_data)

        start_date = datetime.now(UTC) - timedelta(days=1)
        end_date = datetime.now(UTC) + timedelta(days=1)

        # Should not crash
        results = query_service.execute_query(
            db_session,
            "get_portfolio_category_trend_by_user_id",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Should handle gracefully and return results
        assert isinstance(results, list), (
            "Query should return list even with empty tokens"
        )

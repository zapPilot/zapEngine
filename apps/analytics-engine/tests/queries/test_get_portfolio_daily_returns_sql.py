"""
Unit tests for get_portfolio_daily_returns.sql query

Tests the fixed SQL query that now:
1. JOINs with user_crypto_wallets to filter by user_id
2. Protects against division-by-zero with NULLIF and CASE
3. Optimizes LAG() window function (single call instead of duplicate)
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text


@pytest.fixture
def test_user_id():
    """Generate a test user ID"""
    return uuid4()


@pytest.fixture
def test_wallets(test_user_id, db_session):
    """Create test user and wallets"""
    wallet_1 = "0x1234567890123456789012345678901234567890"
    wallet_2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"

    # Create user first (PostgreSQL FK constraint requirement)
    db_session.execute(
        text("INSERT INTO users (id) VALUES (:user_id)"),
        {"user_id": str(test_user_id)},
    )
    db_session.commit()

    # Insert test user's wallets
    db_session.execute(
        text("""
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
            VALUES
                (:id1, :user_id, :wallet1, 'Test Wallet 1', :created_at),
                (:id2, :user_id, :wallet2, 'Test Wallet 2', :created_at)
        """),
        {
            "id1": str(uuid4()),
            "id2": str(uuid4()),
            "user_id": str(test_user_id),
            "wallet1": wallet_1,
            "wallet2": wallet_2,
            "created_at": datetime.now(UTC),
        },
    )
    db_session.commit()

    return [wallet_1, wallet_2]


@pytest.fixture
def create_snapshots(db_session, test_user_id, refresh_materialized_views):
    """Helper to create portfolio snapshots

    Note: Ensures user exists before creating snapshots (FK constraint)
    """

    def _create(user_wallets, days_data):
        """
        Args:
            user_wallets: List of wallet addresses
            days_data: List of (days_ago, values_per_wallet) tuples
        """
        # Ensure user exists (idempotent - won't fail if already exists)
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id) ON CONFLICT DO NOTHING"),
            {"user_id": str(test_user_id)},
        )
        db_session.commit()

        base_date = datetime.now(UTC)

        for days_ago, values in days_data:
            snapshot_date = base_date - timedelta(days=days_ago)

            for wallet, value in zip(user_wallets, values, strict=False):
                db_session.execute(
                    text("""
                        INSERT INTO portfolio_item_snapshots
                        (id, user_id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
                        VALUES (:id, :user_id, :wallet, :snapshot_at, :value, 'ethereum', true)
                    """),
                    {
                        "id": str(uuid4()),
                        "user_id": str(test_user_id),
                        "wallet": wallet,
                        "snapshot_at": snapshot_date,
                        "value": float(value),
                    },
                )

        db_session.commit()
        refresh_materialized_views(include_portfolio_category_trend=False)

    return _create


class TestDailyReturnsHappyPath:
    """Test daily returns calculation with valid multi-wallet data"""

    def test_multi_wallet_aggregation_30_days(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Multi-wallet portfolio returns over 30 days
        Expected: 29 daily returns (first day has no LAG)
        """
        # Create 30 days of data for both wallets
        days_data = [
            (i, [1000 + (i * 10), 500 + (i * 5)])  # Growing portfolio
            for i in range(30)
        ]
        create_snapshots(test_wallets, days_data)

        # Execute query
        start_date = datetime.now(UTC) - timedelta(days=30)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Assertions
        assert len(results) == 29, "Should have 29 returns (30 days - 1 for first day)"
        assert all("daily_return" in r for r in results)
        assert all(r["daily_return"] is not None for r in results)
        assert all(isinstance(r["daily_return"], float) for r in results)

        # Verify aggregation: total_portfolio_value = wallet1 + wallet2
        first_day = results[0]
        # Earliest return corresponds to the second-oldest snapshot day (len(days_data) - 2)
        target_index = len(days_data) - 2
        expected_value = sum(days_data[target_index][1])
        assert abs(float(first_day["total_portfolio_value"]) - expected_value) < 1

    def test_positive_returns_calculation(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Verify daily return percentage calculation
        Portfolio: $1000 → $1050 = 5% return
        """
        days_data = [
            (2, [1000, 0]),  # Day 0
            (1, [1050, 0]),  # Day 1: +5%
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1
        # 5% return = 0.05
        assert abs(float(results[0]["daily_return"]) - 0.05) < 0.001


class TestDailyReturnsEdgeCases:
    """Test edge cases: zero values, single day, gaps, etc."""

    def test_zero_portfolio_value_protection(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Portfolio value = 0 on a day (division-by-zero protection)
        Expected: NULLIF prevents error, return is NULL (filtered out)
        """
        days_data = [
            (3, [1000, 500]),  # Day 0: $1500
            (2, [0, 0]),  # Day 1: $0 (EDGE CASE)
            (1, [1200, 600]),  # Day 2: $1800
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=4)
        end_date = datetime.now(UTC)

        # Should not raise division-by-zero error
        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Only 1 valid return: Day 0 → Day 1 has NULL (filtered out)
        # Day 1 → Day 2 calculated (but from 0, still NULL due to CASE)
        assert len(results) <= 2, (
            "Zero value days should be filtered or have NULL returns"
        )

    def test_single_day_no_returns(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Only 1 day of data
        Expected: Empty result (LAG returns NULL, filtered by WHERE clause)
        """
        days_data = [(1, [1000, 500])]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=2)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 0, "Single day of data cannot calculate returns"

    def test_two_days_minimum_for_calculation(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Minimum 2 days needed for 1 return
        """
        days_data = [
            (2, [1000, 500]),
            (1, [1100, 550]),
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1, "2 days should produce 1 return"
        # $1500 → $1650 = 10% return
        assert abs(float(results[0]["daily_return"]) - 0.10) < 0.001

    def test_no_wallets_empty_result(
        self, query_service, db_session, test_user_id, create_snapshots
    ):
        """
        Test: User has no wallets in user_crypto_wallets
        Expected: Empty result (JOIN filters out all snapshots)
        """
        # Don't create wallets for this user
        # Create snapshots for a random wallet
        random_wallet = ["0xrandomwallet123"]
        days_data = [(i, [1000]) for i in range(5)]
        create_snapshots(random_wallet, days_data)

        start_date = datetime.now(UTC) - timedelta(days=6)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 0, "No linked wallets should return empty"

    def test_wallet_not_linked_to_user(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Wallet exists in snapshots but NOT linked to user
        Expected: That wallet's data excluded from results
        """
        # Create another user's wallet
        other_user_wallet = "0xotheruser123"
        other_user_id = uuid4()

        # Create other user first (FK constraint)
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id)"),
            {"user_id": str(other_user_id)},
        )
        db_session.commit()

        db_session.execute(
            text("""
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
                VALUES (:id, :user_id, :wallet, 'Other User Wallet', :created_at)
            """),
            {
                "id": str(uuid4()),
                "user_id": str(other_user_id),
                "wallet": other_user_wallet,
                "created_at": datetime.now(UTC),
            },
        )
        db_session.commit()

        # Create snapshots for both users' wallets
        days_data = [
            (2, [1000, 500]),  # test_user's wallets
            (1, [1100, 550]),
        ]
        create_snapshots(test_wallets, days_data)

        # Create snapshots for other user (should be excluded)
        create_snapshots([other_user_wallet], [(2, [9999]), (1, [9999])])

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1
        # Should NOT include other user's $9999 values
        assert float(results[0]["total_portfolio_value"]) < 2000, (
            "Other user's data excluded"
        )

    def test_data_gaps_handled(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Missing days in snapshot sequence
        Expected: LAG works across gaps
        """
        days_data = [
            (10, [1000, 500]),
            (8, [1100, 550]),  # Gap: day 9 missing
            (5, [1200, 600]),  # Gap: days 6-7 missing
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=11)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 2, "Should calculate returns despite gaps"
        assert all(r["daily_return"] is not None for r in results)

    def test_negative_portfolio_values(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Negative net_usd_value (debt > assets)
        Expected: Query handles without error
        """
        days_data = [
            (2, [1000, -200]),  # Net: $800
            (1, [900, -100]),  # Net: $800 (0% return)
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1
        assert abs(float(results[0]["daily_return"])) < 0.001, "0% return expected"


class TestDailyReturnsDataQuality:
    """Test data quality scenarios: precision, NULLs, duplicates"""

    def test_decimal_precision_maintained(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Decimal precision in calculations
        Expected: No floating-point errors
        """
        days_data = [
            (2, [1000.123456, 500.654321]),
            (1, [1050.123456, 525.654321]),
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1
        # Verify precision maintained (not truncated to integers)
        portfolio_value = float(results[0]["total_portfolio_value"])
        assert portfolio_value > 1575 and portfolio_value < 1576

    def test_very_large_values_no_overflow(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Very large portfolio values (> $1 billion)
        Expected: No overflow errors
        """
        days_data = [
            (2, [1_000_000_000, 500_000_000]),  # $1.5B
            (1, [1_050_000_000, 525_000_000]),  # $1.575B
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_daily_returns",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1
        assert float(results[0]["total_portfolio_value"]) > 1_500_000_000

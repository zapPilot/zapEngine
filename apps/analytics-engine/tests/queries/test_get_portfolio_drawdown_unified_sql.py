"""
Unit tests for get_portfolio_drawdown_unified.sql query

Tests the fixed SQL query that now:
1. JOINs with user_crypto_wallets to filter by user_id
2. Calculates running peaks, drawdown percentages, underwater flags
3. Detects recovery points and ranks drawdowns

Note: These tests require PostgreSQL due to ::numeric type casts in the SQL query.
They will be skipped when running with SQLite (default test environment).
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text

# Mark all drawdown tests as requiring PostgreSQL (::numeric casts)
pytestmark = pytest.mark.postgres


@pytest.fixture
def test_user_id():
    """Generate a test user ID"""
    return uuid4()


@pytest.fixture
def test_wallets(test_user_id, db_session):
    """Create test user and wallets"""
    wallet_1 = "0x1111111111111111111111111111111111111111"
    wallet_2 = "0x2222222222222222222222222222222222222222"

    # Create user first (PostgreSQL FK constraint requirement)
    db_session.execute(
        text("INSERT INTO users (id) VALUES (:user_id)"),
        {"user_id": str(test_user_id)},
    )
    db_session.commit()

    db_session.execute(
        text("""
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
            VALUES
                (:id1, :user_id, :wallet1, 'Drawdown Test Wallet 1', :created_at),
                (:id2, :user_id, :wallet2, 'Drawdown Test Wallet 2', :created_at)
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

    def _create(wallets, days_data):
        """
        Args:
            wallets: List of wallet addresses
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

            for wallet, value in zip(wallets, values, strict=False):
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


class TestDrawdownHappyPath:
    """Test drawdown calculation with valid multi-wallet data"""

    def test_multi_wallet_aggregation(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Multi-wallet portfolio drawdown over 10 days
        Expected: All rows have valid drawdown metrics
        """
        # Create 10 days: growth, peak, drawdown, recovery
        days_data = [
            (10, [1000, 500]),  # $1500 - initial
            (9, [1100, 550]),  # $1650 - new peak
            (8, [1200, 600]),  # $1800 - new peak
            (7, [1000, 500]),  # $1500 - drawdown
            (6, [900, 450]),  # $1350 - deeper drawdown
            (5, [1100, 550]),  # $1650 - partial recovery
            (4, [1300, 650]),  # $1950 - new peak
            (3, [1200, 600]),  # $1800 - small drawdown
            (2, [1400, 700]),  # $2100 - new peak
            (1, [1400, 700]),  # $2100 - at peak
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=11)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Assertions
        assert len(results) == 10, "Should have 10 days of drawdown data"

        # Verify all required columns present
        required_cols = [
            "date",
            "portfolio_value",
            "peak_value",
            "drawdown_pct",
            "is_underwater",
            "recovery_point",
            "drawdown_rank",
            "underwater_pct",
        ]
        for col in required_cols:
            assert all(col in r for r in results), f"Column {col} missing"

        # Verify aggregation: sum of both wallets
        first_day = results[0]
        assert float(first_day["portfolio_value"]) == 1500

        # Peak should be running maximum
        assert float(results[0]["peak_value"]) == 1500  # First day
        assert float(results[2]["peak_value"]) == 1800  # Day 3 peak
        assert float(results[-1]["peak_value"]) == 2100  # Final peak

    def test_drawdown_percentage_calculation(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Verify drawdown percentage calculation
        Peak: $2000, Current: $1600 = -20% drawdown
        """
        days_data = [
            (3, [2000, 0]),  # Peak
            (2, [1800, 0]),  # -10%
            (1, [1600, 0]),  # -20%
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=4)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 3

        # Day 1: At peak, 0% drawdown
        assert float(results[0]["drawdown_pct"]) == 0
        assert results[0]["is_underwater"] is False

        # Day 2: -10% drawdown
        assert abs(float(results[1]["drawdown_pct"]) - (-10)) < 0.1
        assert results[1]["is_underwater"] is True

        # Day 3: -20% drawdown
        assert abs(float(results[2]["drawdown_pct"]) - (-20)) < 0.1
        assert results[2]["is_underwater"] is True


class TestDrawdownEdgeCases:
    """Test edge cases: zero values, single day, recovery detection"""

    def test_zero_portfolio_value_handling(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Portfolio value = 0 at peak
        Expected: drawdown_pct = 0 (CASE handles division by zero)
        """
        days_data = [
            (2, [0, 0]),  # Zero value (edge case)
            (1, [1000, 500]),  # Recovery to positive
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 2
        # Zero peak should result in 0% drawdown (not NULL or error)
        assert float(results[0]["drawdown_pct"]) == 0

    def test_single_day_single_peak(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Only 1 day of data
        Expected: 1 row, peak = portfolio_value, 0% drawdown
        """
        days_data = [(1, [1000, 500])]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=2)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 1
        assert float(results[0]["portfolio_value"]) == float(results[0]["peak_value"])
        assert float(results[0]["drawdown_pct"]) == 0
        assert results[0]["is_underwater"] is False

    def test_recovery_point_detection(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Recovery from underwater to new peak
        Expected: recovery_point = True on recovery day
        """
        days_data = [
            (5, [2000, 0]),  # Peak
            (4, [1800, 0]),  # Underwater
            (3, [1600, 0]),  # Still underwater
            (2, [2000, 0]),  # Recovery to peak
            (1, [2100, 0]),  # New peak
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=6)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 5

        # Days 1-3: Not recovery points
        assert results[0]["recovery_point"] is False
        assert results[1]["recovery_point"] is False
        assert results[2]["recovery_point"] is False

        # Day 4: Recovery to peak (recovery_point = True)
        assert results[3]["recovery_point"] is True

        # Day 5: New peak, not a recovery (already at peak)
        assert results[4]["recovery_point"] is False

    def test_drawdown_rank_ordering(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Drawdown rank ordering (worst drawdown = rank 1)
        """
        days_data = [
            (5, [2000, 0]),  # Peak
            (4, [1800, 0]),  # -10%
            (3, [1400, 0]),  # -30% (worst)
            (2, [1600, 0]),  # -20%
            (1, [2000, 0]),  # 0% (recovery)
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=6)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Find the worst drawdown day
        worst_day = min(results, key=lambda r: float(r["drawdown_pct"]))
        assert worst_day["drawdown_rank"] == 1, "Worst drawdown should be rank 1"
        assert abs(float(worst_day["drawdown_pct"]) - (-30)) < 0.1

    def test_no_wallets_empty_result(
        self, query_service, db_session, test_user_id, create_snapshots
    ):
        """
        Test: User has no wallets in user_crypto_wallets
        Expected: Empty result (JOIN filters out all snapshots)
        """
        # Create snapshots for random wallet not linked to user
        random_wallet = ["0xrandomwallet"]
        days_data = [(i, [1000]) for i in range(5)]
        create_snapshots(random_wallet, days_data)

        start_date = datetime.now(UTC) - timedelta(days=6)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 0, "No linked wallets should return empty"

    def test_wallet_isolation_between_users(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Wallet exists in snapshots but NOT linked to queried user
        Expected: That wallet's data excluded from results
        """
        # Create another user with different wallet
        other_user_id = uuid4()
        other_wallet = "0xotheruser"

        # Create other user first (FK constraint)
        db_session.execute(
            text("INSERT INTO users (id) VALUES (:user_id)"),
            {"user_id": str(other_user_id)},
        )
        db_session.commit()

        db_session.execute(
            text("""
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
                VALUES (:id, :user_id, :wallet, 'Other User', :created_at)
            """),
            {
                "id": str(uuid4()),
                "user_id": str(other_user_id),
                "wallet": other_wallet,
                "created_at": datetime.now(UTC),
            },
        )
        db_session.commit()

        # Create snapshots for both users
        days_data = [(2, [1000, 500]), (1, [1100, 550])]
        create_snapshots(test_wallets, days_data)

        # Other user has huge portfolio (should be excluded)
        create_snapshots([other_wallet], [(2, [99999]), (1, [99999])])

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 2
        # Should NOT include other user's $99999 values
        assert all(float(r["portfolio_value"]) < 2000 for r in results)

    def test_optional_end_date_null_handling(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: end_date parameter can be NULL
        Expected: Query returns all data from start_date onwards
        """
        days_data = [
            (10, [1000, 500]),
            (5, [1500, 750]),
            (1, [2000, 1000]),
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=11)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": None,  # NULL end_date
                "wallet_address": None,
            },
        )

        assert len(results) == 3, "Should return all data when end_date is NULL"


class TestDrawdownDataQuality:
    """Test data quality scenarios: precision, underwater periods, multiple drawdowns"""

    def test_decimal_precision_in_percentages(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Drawdown percentage precision
        Expected: Rounded to 2 decimal places
        """
        days_data = [
            (2, [1000.12, 500.34]),  # Peak: 1500.46
            (1, [900.11, 450.22]),  # Current: 1350.33
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=3)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Drawdown should be rounded to 2 decimals
        drawdown = float(results[1]["drawdown_pct"])
        assert drawdown == round(drawdown, 2)

    def test_multiple_drawdown_periods(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Multiple distinct drawdown and recovery cycles
        """
        days_data = [
            (10, [1000, 0]),  # Initial
            (9, [1500, 0]),  # Peak 1
            (8, [1200, 0]),  # Drawdown 1
            (7, [1600, 0]),  # Peak 2
            (6, [1300, 0]),  # Drawdown 2
            (5, [1700, 0]),  # Peak 3
            (4, [1400, 0]),  # Drawdown 3
            (3, [1800, 0]),  # Peak 4
            (2, [1500, 0]),  # Drawdown 4
            (1, [1900, 0]),  # Peak 5
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=11)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        # Count recovery points (transitions from underwater to peak)
        recovery_count = sum(1 for r in results if r["recovery_point"] is True)
        assert recovery_count >= 3, "Should detect multiple recovery points"

    def test_negative_portfolio_values(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Negative net_usd_value (debt > assets)
        Expected: Drawdown still calculated (using negative values)
        """
        days_data = [
            (3, [500, -200]),  # Net: $300
            (2, [400, -300]),  # Net: $100
            (1, [300, -400]),  # Net: -$100 (negative total)
        ]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=4)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 3, "Should handle negative portfolio values"
        # Verify peak is still calculated
        assert all("peak_value" in r for r in results)

    def test_constant_portfolio_value(
        self, query_service, db_session, test_user_id, test_wallets, create_snapshots
    ):
        """
        Test: Portfolio value never changes
        Expected: 0% drawdown always, never underwater
        """
        days_data = [(i, [1000, 500]) for i in range(5, 0, -1)]
        create_snapshots(test_wallets, days_data)

        start_date = datetime.now(UTC) - timedelta(days=6)
        end_date = datetime.now(UTC)

        results = query_service.execute_query(
            db_session,
            "get_portfolio_drawdown_unified",
            {
                "user_id": str(test_user_id),
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        assert len(results) == 5
        assert all(float(r["drawdown_pct"]) == 0 for r in results)
        assert all(r["is_underwater"] is False for r in results)
        assert all(r["recovery_point"] is False for r in results)

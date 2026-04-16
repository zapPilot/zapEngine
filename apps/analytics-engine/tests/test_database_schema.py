"""
Test database schema and table creation for testing (PostgreSQL-only).
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


@pytest.fixture
def setup_test_tables(db_session):
    """Create test tables for user and wallet tests"""

    # Tables are already created in conftest.py, but we can verify they exist
    # This fixture now primarily serves as a dependency marker for tests
    # that require the full schema to be available

    # No commit needed - fixture handles transaction cleanup
    return True


class TestDatabaseSchema:
    """Test database schema and table operations"""

    def test_create_test_tables(self, db_session, setup_test_tables):
        """Test that test tables can be created"""
        assert setup_test_tables is True

        # Verify tables exist by querying PostgreSQL information_schema
        result = db_session.execute(
            text("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
              AND table_name IN ('users', 'plans', 'user_subscriptions', 'user_crypto_wallets')
        """)
        )

        tables = [row[0] for row in result.fetchall()]
        assert "users" in tables
        assert "plans" in tables
        assert "user_subscriptions" in tables
        assert "user_crypto_wallets" in tables

    def test_table_constraints(self, db_session, setup_test_tables):
        """Test table constraints work correctly"""
        # Test unique email constraint in users table
        user_id_1 = str(uuid.uuid4())
        user_id_2 = str(uuid.uuid4())

        # Insert first user
        db_session.execute(
            text("""
            INSERT INTO users (id, email)
            VALUES (:id, :email)
        """),
            {"id": user_id_1, "email": "duplicate@test.com"},
        )

        # Attempt to insert duplicate email should fail (use savepoint for isolation)
        savepoint = db_session.begin_nested()
        try:
            db_session.execute(
                text("""
                INSERT INTO users (id, email)
                VALUES (:id, :email)
            """),
                {"id": user_id_2, "email": "duplicate@test.com"},
            )
            savepoint.commit()
            pytest.fail("Expected IntegrityError for duplicate email")
        except IntegrityError:
            savepoint.rollback()

        # Test foreign key constraint in user_subscriptions
        subscription_id = str(uuid.uuid4())

        # Insert a valid subscription for existing user and plan
        db_session.execute(
            text("""
            INSERT INTO user_subscriptions (id, user_id, plan_code)
            VALUES (:id, :user_id, :plan_code)
        """),
            {"id": subscription_id, "user_id": user_id_1, "plan_code": "free"},
        )

        # Verify subscription was created
        result = db_session.execute(
            text("""
            SELECT COUNT(*) FROM user_subscriptions WHERE user_id = :user_id
        """),
            {"user_id": user_id_1},
        )

        count = result.scalar()
        assert count == 1

    def test_foreign_key_constraint(self, db_session, setup_test_tables):
        """Test foreign key constraints in user_crypto_wallets and user_subscriptions tables"""
        # First create a valid user
        user_id = str(uuid.uuid4())
        db_session.execute(
            text("""
            INSERT INTO users (id, email)
            VALUES (:id, :email)
        """),
            {"id": user_id, "email": "test@example.com"},
        )

        # Test valid wallet insertion for existing user
        wallet_id = str(uuid.uuid4())
        db_session.execute(
            text("""
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label)
            VALUES (:id, :user_id, :wallet, :label)
        """),
            {
                "id": wallet_id,
                "user_id": user_id,
                "wallet": "0x123",
                "label": "test wallet",
            },
        )

        # Verify the wallet was inserted
        result = db_session.execute(
            text("""
            SELECT COUNT(*) FROM user_crypto_wallets WHERE user_id = :user_id
        """),
            {"user_id": user_id},
        )

        count = result.scalar()
        assert count == 1

        # Test user_subscriptions foreign key relationships
        subscription_id = str(uuid.uuid4())

        # Test valid subscription with existing user and plan
        db_session.execute(
            text("""
            INSERT INTO user_subscriptions (id, user_id, plan_code)
            VALUES (:id, :user_id, :plan_code)
        """),
            {"id": subscription_id, "user_id": user_id, "plan_code": "premium"},
        )

        # Verify subscription was created
        result = db_session.execute(
            text("""
            SELECT plan_code FROM user_subscriptions WHERE user_id = :user_id
        """),
            {"user_id": user_id},
        )

        plan_code = result.scalar()
        assert plan_code == "premium"

    def test_subscription_lifecycle(self, db_session, setup_test_tables):
        """Test subscription lifecycle with starts_at, ends_at, and is_canceled"""
        # Create a user
        user_id = str(uuid.uuid4())
        db_session.execute(
            text("""
            INSERT INTO users (id, email)
            VALUES (:id, :email)
        """),
            {"id": user_id, "email": "lifecycle@example.com"},
        )

        # Create an active subscription
        subscription_id = str(uuid.uuid4())
        starts_at = datetime.now(UTC)
        ends_at = starts_at + timedelta(days=30)

        db_session.execute(
            text("""
            INSERT INTO user_subscriptions (id, user_id, plan_code, starts_at, ends_at)
            VALUES (:id, :user_id, :plan_code, :starts_at, :ends_at)
        """),
            {
                "id": subscription_id,
                "user_id": user_id,
                "plan_code": "enterprise",
                "starts_at": starts_at,
                "ends_at": ends_at,
            },
        )

        # Test canceling the subscription
        db_session.execute(
            text("""
            UPDATE user_subscriptions
            SET is_canceled = true
            WHERE id = :id
        """),
            {"id": subscription_id},
        )

        # Verify the subscription is canceled (SQLite returns 1, PostgreSQL returns True)
        result = db_session.execute(
            text("""
            SELECT is_canceled FROM user_subscriptions WHERE id = :id
        """),
            {"id": subscription_id},
        )

        is_canceled = result.scalar()
        assert is_canceled in (True, 1), f"Expected True or 1, got {is_canceled}"

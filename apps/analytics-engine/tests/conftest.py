"""
Test configuration and fixtures
"""

import os
import time
from collections.abc import Callable, Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from src.core.cache_service import analytics_cache
from src.core.database import get_db
from src.main import app

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://test_user:testpass123@localhost:5435/test_db",
)
TEST_DB_ADVISORY_LOCK_KEY = 132450091
TEST_DB_LOCK_RETRY_ATTEMPTS = 5
TEST_DB_LOCK_RETRY_DELAY_SECONDS = 0.1

if not (
    TEST_DATABASE_URL.startswith("postgresql://")
    or TEST_DATABASE_URL.startswith("postgres://")
    or TEST_DATABASE_URL.startswith("postgresql+")
):
    raise RuntimeError(
        "Analytics Engine tests now require PostgreSQL. "
        "Set TEST_DATABASE_URL to a postgresql:// connection string."
    )


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear analytics cache before each test to ensure test isolation."""
    analytics_cache.clear()
    yield
    analytics_cache.clear()


def create_test_engine():
    """
    Create database engine for testing.

    Uses PostgreSQL for all tests.
    """
    url = TEST_DATABASE_URL
    # Ensure sync driver points to psycopg v3 (CI may not have psycopg2)
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)

    return create_engine(
        url,
        poolclass=NullPool,
        echo=False,
    )


def _table_exists(conn, table: str) -> bool:
    result = conn.execute(
        text("SELECT to_regclass(:table_name)"),
        {"table_name": table},
    )
    return result.scalar() is not None


def _is_retryable_lock_error(error: OperationalError) -> bool:
    message = str(getattr(error, "orig", error)).lower()
    patterns = (
        "deadlock detected",
        "lock timeout",
        "could not obtain lock",
        "canceling statement due to lock timeout",
    )
    return any(pattern in message for pattern in patterns)


def _run_with_lock_retry(description: str, operation: Callable[[], None]) -> None:
    for attempt in range(1, TEST_DB_LOCK_RETRY_ATTEMPTS + 1):
        try:
            operation()
            return
        except OperationalError as error:
            if (
                not _is_retryable_lock_error(error)
                or attempt >= TEST_DB_LOCK_RETRY_ATTEMPTS
            ):
                raise
            time.sleep(TEST_DB_LOCK_RETRY_DELAY_SECONDS * attempt)


def _acquire_test_setup_lock(conn) -> None:
    conn.execute(
        text("SELECT pg_advisory_xact_lock(:lock_key)"),
        {"lock_key": TEST_DB_ADVISORY_LOCK_KEY},
    )


def _set_local_lock_timeouts(conn) -> None:
    conn.execute(text("SET LOCAL lock_timeout = '5s'"))
    conn.execute(text("SET LOCAL statement_timeout = '120s'"))


def _process_portfolio_rollup_queue(
    conn, *, include_portfolio_category_trend: bool = True
) -> None:
    del include_portfolio_category_trend
    _set_local_lock_timeouts(conn)
    _acquire_test_setup_lock(conn)
    conn.execute(text("SELECT * FROM private.process_portfolio_rollup_queue()"))


def _truncate_test_tables(conn) -> None:
    table_candidates = [
        "portfolio_item_snapshots",
        "alpha_raw.wallet_token_snapshots",
        "user_crypto_wallets",
        "user_subscriptions",
        "users",
        "plans",
        "mv_portfolio_summary_v2",
        "private.daily_portfolio_snapshots_cache",
        "private.daily_wallet_token_snapshots_cache",
        "private.portfolio_category_trend_cache",
        "private.portfolio_rollup_dirty_portfolio",
        "private.portfolio_rollup_dirty_wallet",
        "private.portfolio_rollup_dirty_users",
    ]
    existing_tables = [
        table for table in table_candidates if _table_exists(conn, table)
    ]
    if not existing_tables:
        return
    conn.execute(text(f"TRUNCATE TABLE {', '.join(existing_tables)} CASCADE"))


def _initialize_test_database(engine) -> None:
    def _setup_once() -> None:
        with engine.begin() as conn:
            _set_local_lock_timeouts(conn)
            _acquire_test_setup_lock(conn)
            _ensure_test_schema_and_tables(conn)
            _ensure_test_incremental_rollups(conn)
            _truncate_test_tables(conn)
            _seed_test_reference_data(conn)

    _run_with_lock_retry("test database initialization", _setup_once)


def _ensure_test_schema_and_tables(conn) -> None:
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    )
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS plans (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tier INTEGER DEFAULT 0
        )
    """)
    )
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_code TEXT NOT NULL,
            starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ends_at TIMESTAMP,
            is_canceled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (plan_code) REFERENCES plans(code)
        )
    """)
    )
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS user_crypto_wallets (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            wallet TEXT NOT NULL,
            label TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    )
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS mv_portfolio_summary_v2 (
            user_id TEXT,
            total_assets REAL,
            total_debt REAL,
            net_portfolio_value REAL,
            wallet_count INTEGER,
            last_updated TIMESTAMP,
            category_summary_assets TEXT,
            category_summary_debt TEXT
        )
        """)
    )
    conn.execute(text("CREATE SCHEMA IF NOT EXISTS alpha_raw"))
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS alpha_raw.wallet_token_snapshots (
            id TEXT,
            user_wallet_address TEXT,
            token_address TEXT,
            amount REAL,
            raw_amount NUMERIC,
            raw_amount_hex_str TEXT,
            price REAL,
            price_24h_change REAL,
            symbol TEXT,
            name TEXT,
            display_symbol TEXT,
            optimized_symbol TEXT,
            decimals INTEGER,
            chain TEXT,
            is_wallet BOOLEAN DEFAULT TRUE,
            logo_url TEXT,
            protocol_id TEXT,
            is_verified BOOLEAN DEFAULT FALSE,
            is_core BOOLEAN DEFAULT FALSE,
            time_at BIGINT,
            inserted_at TIMESTAMP,
            total_supply NUMERIC,
            credit_score NUMERIC
        )
        """)
    )
    conn.execute(
        text("""
        CREATE TABLE IF NOT EXISTS portfolio_item_snapshots (
            id TEXT PRIMARY KEY,
            wallet TEXT NOT NULL,
            snapshot_at TIMESTAMP NOT NULL,
            chain TEXT,
            name TEXT,
            has_supported_portfolio BOOLEAN,
            id_raw TEXT,
            logo_url TEXT,
            site_url TEXT,
            asset_dict JSONB,
            asset_token_list JSONB,
            detail JSONB,
            detail_types TEXT[],
            pool TEXT,
            proxy_detail JSONB,
            asset_usd_value REAL,
            debt_usd_value REAL,
            net_usd_value REAL,
            update_at TIMESTAMPTZ,
            name_item TEXT
        )
        """)
    )


def _ensure_test_incremental_rollups(conn) -> None:
    processor = conn.execute(
        text(
            "SELECT to_regprocedure('private.process_portfolio_rollup_queue(integer)')"
        )
    ).scalar()
    if processor is None:
        raise RuntimeError(
            "Incremental portfolio rollups are not installed. "
            "Run scripts/db/bootstrap-integration-db.sh before tests."
        )

    relation_kinds = conn.execute(
        text(
            """
            SELECT
              namespace.nspname,
              relation.relname,
              relation.relkind::text AS relkind
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE (namespace.nspname, relation.relname) IN (
              ('public', 'daily_portfolio_snapshots'),
              ('alpha_raw', 'daily_wallet_token_snapshots'),
              ('public', 'portfolio_category_trend_mv')
            )
            """
        )
    ).all()
    if len(relation_kinds) != 3 or any(row.relkind != "v" for row in relation_kinds):
        raise RuntimeError(
            "Portfolio compatibility relations must all be ordinary views."
        )


def _seed_test_reference_data(conn) -> None:
    conn.execute(
        text("""
        INSERT INTO plans (code, name, tier) VALUES
        ('free', 'Free Plan', 0),
        ('premium', 'Premium Plan', 1),
        ('enterprise', 'Enterprise Plan', 2)
        ON CONFLICT DO NOTHING
    """)
    )


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Create a PostgreSQL-backed test database session with automatic rollback."""
    engine = create_test_engine()
    _initialize_test_database(engine)

    # Create connection for test isolation with transaction rollback
    connection = engine.connect()
    transaction = connection.begin()

    session_local = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = session_local()

    # Yield session for tests
    yield session

    # Rollback transaction after test for isolation
    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()

    engine.dispose()


@pytest.fixture
async def client(db_session):
    """Create a test client with database dependency override"""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def test_wallet_address() -> str:
    """Provides a consistent test wallet address."""
    return "0xDeaDB33f00000000000000000000000000000000"


@pytest.fixture
def create_test_user_and_wallets(db_session: Session):
    """Fixture to create a test user and associated wallets."""
    import uuid

    from sqlalchemy import text

    user_id = str(uuid.uuid4())
    wallet_address_1 = "0xAbC...123"
    wallet_address_2 = "0xDeF...456"

    db_session.execute(
        text("INSERT INTO users (id, email) VALUES (:id, :email)"),
        {"id": user_id, "email": "testuser@example.com"},
    )
    db_session.execute(
        text(
            "INSERT INTO user_crypto_wallets (id, user_id, wallet) VALUES (:id, :user_id, :wallet)"
        ),
        {"id": str(uuid.uuid4()), "user_id": user_id, "wallet": wallet_address_1},
    )
    db_session.execute(
        text(
            "INSERT INTO user_crypto_wallets (id, user_id, wallet) VALUES (:id, :user_id, :wallet)"
        ),
        {"id": str(uuid.uuid4()), "user_id": user_id, "wallet": wallet_address_2},
    )
    db_session.commit()
    return user_id, [wallet_address_1, wallet_address_2]


@pytest.fixture
def query_service():
    """Provides QueryService instance for SQL query execution tests."""
    from src.services.shared.query_service import QueryService

    return QueryService()


@pytest.fixture
def refresh_materialized_views(db_session: Session):
    """Drain the incremental rollup queue with lock retry protection."""

    def _refresh(*, include_portfolio_category_trend: bool = True) -> None:
        for attempt in range(1, TEST_DB_LOCK_RETRY_ATTEMPTS + 1):
            try:
                with db_session.begin_nested():
                    _process_portfolio_rollup_queue(
                        db_session.connection(),
                        include_portfolio_category_trend=include_portfolio_category_trend,
                    )
                db_session.expire_all()
                return
            except OperationalError as error:
                if (
                    not _is_retryable_lock_error(error)
                    or attempt >= TEST_DB_LOCK_RETRY_ATTEMPTS
                ):
                    raise
                time.sleep(TEST_DB_LOCK_RETRY_DELAY_SECONDS * attempt)

    return _refresh


@pytest.fixture
def refresh_portfolio_mv(refresh_materialized_views):
    """
    Process portfolio rollups after inserting test data.

    In production, DeBank invokes the same incremental processor immediately and
    the 30-minute cron is a fallback. Tests keep the historical fixture name to
    avoid obscuring query-test intent.

    Usage:
        def test_portfolio_trend(db_session, refresh_portfolio_mv):
            # Insert test data (mimics ETL)
            db_session.execute(text("INSERT INTO portfolio_item_snapshots ..."))
            db_session.commit()

            # Drain dirty keys with the production processor
            refresh_portfolio_mv()

            # Query the compatibility view - now contains fresh data
            result = query_service.execute(QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV, {...})
    """

    def _refresh():
        refresh_materialized_views(include_portfolio_category_trend=True)

    return _refresh

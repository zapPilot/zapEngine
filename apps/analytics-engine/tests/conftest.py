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
    "postgresql+psycopg://test_user:testpass123@localhost:5433/test_db",
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


def _matview_exists(conn, schema: str, name: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT 1
            FROM pg_matviews
            WHERE schemaname = :schema AND matviewname = :name
            """
        ),
        {"schema": schema, "name": name},
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


def _refresh_materialized_views(
    conn, *, include_portfolio_category_trend: bool = True
) -> None:
    _set_local_lock_timeouts(conn)
    _acquire_test_setup_lock(conn)
    if _matview_exists(conn, "public", "daily_portfolio_snapshots"):
        conn.execute(text("REFRESH MATERIALIZED VIEW daily_portfolio_snapshots"))
    if _matview_exists(conn, "alpha_raw", "daily_wallet_token_snapshots"):
        conn.execute(
            text("REFRESH MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots")
        )
    if include_portfolio_category_trend and _matview_exists(
        conn, "public", "portfolio_category_trend_mv"
    ):
        conn.execute(text("REFRESH MATERIALIZED VIEW portfolio_category_trend_mv"))


def _truncate_test_tables(conn) -> None:
    table_candidates = [
        "portfolio_item_snapshots",
        "alpha_raw.wallet_token_snapshots",
        "user_crypto_wallets",
        "user_subscriptions",
        "users",
        "plans",
        "mv_portfolio_summary_v2",
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
            _refresh_materialized_views(conn)
            _truncate_test_tables(conn)
            _refresh_materialized_views(conn)
            _ensure_test_schema_and_tables(conn)
            _ensure_test_materialized_views_and_indexes(conn)
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


def _ensure_test_materialized_views_and_indexes(conn) -> None:
    conn.execute(text("DROP MATERIALIZED VIEW IF EXISTS portfolio_category_trend_mv"))
    conn.execute(text("DROP MATERIALIZED VIEW IF EXISTS daily_portfolio_snapshots"))
    conn.execute(
        text("""
        CREATE MATERIALIZED VIEW daily_portfolio_snapshots AS
        WITH latest_protocol_batch AS (
          SELECT
            LOWER(wallet) AS wallet,
            name,
            DATE(snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
            MAX(snapshot_at) AS latest_snapshot_at
          FROM portfolio_item_snapshots
          GROUP BY LOWER(wallet), name, DATE(snapshot_at AT TIME ZONE 'UTC')
        )
        SELECT
          pis.id,
          LOWER(pis.wallet) AS wallet,
          pis.snapshot_at,
          DATE(pis.snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
          pis.chain,
          pis.has_supported_portfolio,
          pis.id_raw,
          pis.logo_url,
          pis.name,
          pis.site_url,
          pis.asset_dict,
          pis.asset_token_list,
          pis.detail,
          pis.detail_types,
          pis.pool,
          pis.proxy_detail,
          pis.asset_usd_value,
          pis.debt_usd_value,
          pis.net_usd_value,
          pis.update_at,
          pis.name_item
        FROM portfolio_item_snapshots pis
        JOIN latest_protocol_batch lpb
          ON LOWER(pis.wallet) = lpb.wallet
         AND pis.name = lpb.name
         AND DATE(pis.snapshot_at AT TIME ZONE 'UTC') = lpb.snapshot_date
         AND pis.snapshot_at = lpb.latest_snapshot_at
    """)
    )
    conn.execute(
        text(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                  SELECT 1 FROM pg_matviews
                  WHERE schemaname = 'alpha_raw' AND matviewname = 'daily_wallet_token_snapshots'
              ) AND NOT EXISTS (
                  SELECT 1 FROM information_schema.views
                  WHERE table_schema = 'alpha_raw' AND table_name = 'daily_wallet_token_snapshots'
              ) THEN
                EXECUTE $sql$
                  CREATE MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots AS
                  WITH latest_daily AS (
                    SELECT
                      LOWER(user_wallet_address) AS user_wallet_address,
                      inserted_at AS snapshot_date,
                      MAX(time_at) AS latest_time_at
                    FROM alpha_raw.wallet_token_snapshots
                    WHERE is_wallet = TRUE
                    GROUP BY LOWER(user_wallet_address), inserted_at
                  )
                  SELECT
                    wts.id,
                    LOWER(wts.user_wallet_address) AS user_wallet_address,
                    wts.token_address,
                    wts.amount,
                    wts.price,
                    wts.symbol,
                    wts.chain,
                    wts.is_wallet,
                    wts.logo_url,
                    wts.time_at,
                    wts.inserted_at,
                    wts.inserted_at AS snapshot_date
                  FROM alpha_raw.wallet_token_snapshots wts
                  JOIN latest_daily ld
                    ON LOWER(wts.user_wallet_address) = ld.user_wallet_address
                   AND wts.inserted_at = ld.snapshot_date
                   AND wts.time_at = ld.latest_time_at
                  WHERE wts.is_wallet = TRUE
                $sql$;
              END IF;
            END$$;
            """
        )
    )
    conn.execute(
        text("""
        CREATE OR REPLACE FUNCTION classify_token_category(symbol TEXT)
        RETURNS TEXT AS $$
        BEGIN
            IF symbol IS NULL THEN
                RETURN 'others';
            END IF;

            CASE LOWER(symbol)
                WHEN 'btc' THEN RETURN 'btc';
                WHEN 'wbtc' THEN RETURN 'btc';
                WHEN 'tbtc' THEN RETURN 'btc';
                WHEN 'renbtc' THEN RETURN 'btc';
                WHEN 'eth' THEN RETURN 'eth';
                WHEN 'weth' THEN RETURN 'eth';
                WHEN 'steth' THEN RETURN 'eth';
                WHEN 'reth' THEN RETURN 'eth';
                WHEN 'usdc' THEN RETURN 'stablecoins';
                WHEN 'usdt' THEN RETURN 'stablecoins';
                WHEN 'dai' THEN RETURN 'stablecoins';
                WHEN 'busd' THEN RETURN 'stablecoins';
                WHEN 'tusd' THEN RETURN 'stablecoins';
                WHEN 'usdp' THEN RETURN 'stablecoins';
                WHEN 'frax' THEN RETURN 'stablecoins';
                ELSE RETURN 'others';
            END CASE;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)
    )
    conn.execute(
        text("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS portfolio_category_trend_mv AS
        WITH user_wallets AS (
          SELECT user_id, LOWER(wallet) AS wallet FROM user_crypto_wallets
        ),
        portfolio_snapshots AS (
          SELECT uw.user_id, dps.wallet, dps.snapshot_at, dps.asset_token_list
          FROM daily_portfolio_snapshots dps
          JOIN user_wallets uw ON dps.wallet = uw.wallet
        ),
        defi_tokens AS (
          SELECT
            ps.user_id,
            (ps.snapshot_at AT TIME ZONE 'UTC')::date AS bucket_date,
            'defi' AS source_type,
            classify_token_category(token->>'symbol') AS category,
            (COALESCE((token->>'amount')::numeric, 0) * COALESCE((token->>'price')::numeric, 0)) AS token_value
          FROM portfolio_snapshots ps
          CROSS JOIN LATERAL jsonb_array_elements(ps.asset_token_list) AS token
          WHERE ps.asset_token_list IS NOT NULL
            AND jsonb_array_length(ps.asset_token_list) > 0
        ),
        wallet_tokens AS (
          SELECT
            uw.user_id,
            DATE_TRUNC('day', dwt.inserted_at)::date AS bucket_date,
            'wallet' AS source_type,
            classify_token_category(dwt.symbol) AS category,
            (COALESCE(dwt.amount, 0) * COALESCE(dwt.price, 0)) AS token_value
          FROM alpha_raw.daily_wallet_token_snapshots dwt
          JOIN user_wallets uw ON dwt.user_wallet_address = uw.wallet
          WHERE dwt.is_wallet = TRUE
        ),
        all_tokens AS (
          SELECT * FROM defi_tokens WHERE token_value <> 0
          UNION ALL
          SELECT * FROM wallet_tokens WHERE token_value <> 0
        ),
        daily_aggregation AS (
          SELECT
            user_id, bucket_date, source_type, category,
            SUM(CASE WHEN token_value > 0 THEN token_value ELSE 0 END) AS category_assets_usd,
            SUM(CASE WHEN token_value < 0 THEN ABS(token_value) ELSE 0 END) AS category_debt_usd,
            SUM(token_value) AS category_value_usd
          FROM all_tokens
          GROUP BY user_id, bucket_date, source_type, category
        ),
        daily_totals AS (
          SELECT user_id, bucket_date, SUM(category_value_usd) AS total_value_usd
          FROM daily_aggregation
          GROUP BY user_id, bucket_date
        ),
        with_window_metrics AS (
          SELECT
            da.user_id, da.bucket_date, da.source_type, da.category,
            da.category_value_usd, da.category_assets_usd, da.category_debt_usd,
            LAG(da.category_value_usd) OVER (
              PARTITION BY da.user_id, da.source_type, da.category
              ORDER BY da.bucket_date
            ) AS prev_value_usd,
            dt.total_value_usd
          FROM daily_aggregation da
          JOIN daily_totals dt ON da.user_id = dt.user_id AND da.bucket_date = dt.bucket_date
        )
        SELECT
          user_id, bucket_date AS date, source_type, category,
          category_value_usd, category_assets_usd, category_debt_usd,
          COALESCE(category_value_usd - prev_value_usd, 0) AS pnl_usd,
          total_value_usd
        FROM with_window_metrics
        ORDER BY user_id, date ASC, category ASC, source_type ASC
    """)
    )
    conn.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_portfolio_category_trend_user_date
            ON portfolio_category_trend_mv (user_id, date DESC)
    """)
    )
    conn.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_portfolio_category_trend_user_category
            ON portfolio_category_trend_mv (user_id, category)
    """)
    )
    conn.execute(
        text("""
        CREATE INDEX IF NOT EXISTS idx_portfolio_category_trend_user_source
            ON portfolio_category_trend_mv (user_id, source_type)
    """)
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
    """Refresh test materialized views in dependency order with lock protection."""

    def _refresh(*, include_portfolio_category_trend: bool = True) -> None:
        for attempt in range(1, TEST_DB_LOCK_RETRY_ATTEMPTS + 1):
            try:
                with db_session.begin_nested():
                    _refresh_materialized_views(
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
    Refresh portfolio_category_trend_mv after inserting test data.

    In production, this MV is refreshed daily post-ETL. In tests, call this
    fixture after inserting portfolio snapshots to populate the MV with fresh data.
    This mirrors the production ETL → MV refresh workflow.

    Usage:
        def test_portfolio_trend(db_session, refresh_portfolio_mv):
            # Insert test data (mimics ETL)
            db_session.execute(text("INSERT INTO portfolio_item_snapshots ..."))
            db_session.commit()

            # Refresh MV with new data (mimics post-ETL refresh)
            refresh_portfolio_mv()

            # Query MV - now contains fresh data
            result = query_service.execute(QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV, {...})
    """

    def _refresh():
        refresh_materialized_views(include_portfolio_category_trend=True)

    return _refresh

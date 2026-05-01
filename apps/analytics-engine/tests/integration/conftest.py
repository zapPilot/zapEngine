"""
Integration test fixtures for PostgreSQL database testing.

Provides database session management, test client setup, and data seeding utilities
for integration tests that require a real PostgreSQL database.
"""

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

INTEGRATION_TEST_DB_ADVISORY_LOCK_KEY = 132450091
INTEGRATION_DB_LOCK_RETRY_ATTEMPTS = 5
INTEGRATION_DB_LOCK_RETRY_DELAY_SECONDS = 0.1
NO_INTEGRATION_DB_MARKER = "no_integration_db"


def _normalize_integration_async_url(db_url: str) -> str:
    """Normalize integration URLs to an async SQLAlchemy driver."""
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    if db_url.startswith("postgresql://"):
        return db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return db_url


def _collection_requires_integration_db(request: pytest.FixtureRequest) -> bool:
    items = getattr(request.session, "items", ())
    if not items:
        return True
    return any(
        item.get_closest_marker(NO_INTEGRATION_DB_MARKER) is None for item in items
    )


@pytest.fixture(scope="session")
def integration_db_url() -> str:
    """
    Get PostgreSQL integration test database URL from environment.

    Session-scoped to allow session-scoped fixtures (e.g., ensure_integration_mv_exists)
    to depend on it. The environment variable is read once per test session.

    Raises:
        pytest.skip: If DATABASE_INTEGRATION_URL is not set
    """
    db_url = os.getenv("DATABASE_INTEGRATION_URL")
    if not db_url:
        pytest.skip(
            "DATABASE_INTEGRATION_URL not set - skipping integration tests. "
            "Set this environment variable to run PostgreSQL integration tests. "
            "Recommended: export DATABASE_INTEGRATION_URL="
            "'postgresql+asyncpg://user:pass@localhost/test_db'"
        )
    return _normalize_integration_async_url(db_url)


@pytest.fixture
async def integration_db_session(integration_db_url: str) -> AsyncSession:
    """
    Create PostgreSQL database session for integration tests.

    Provides a plain AsyncSession; fixtures manage their own commits.
    After each test, any open transaction is rolled back to keep DB clean.
    """
    engine = create_async_engine(integration_db_url, echo=False)
    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()

    await engine.dispose()


@pytest.fixture
async def integration_client(integration_db_session: AsyncSession) -> AsyncClient:
    """
    Create test HTTP client with PostgreSQL database override.

    Overrides the application's database dependency to use the integration
    test database session, ensuring all API calls use the test database.

    Args:
        integration_db_session: Test database session

    Yields:
        AsyncClient: HTTP client for API testing
    """
    from src.core.database import get_db
    from src.main import app

    sync_engine_container: dict[str, Any] = {}

    def _build_sync_session():
        # Convert asyncpg URL -> sync psycopg compatible URL so SQLAlchemy uses psycopg v3
        sync_url = integration_db_session.bind.url.render_as_string(hide_password=False)
        if "+asyncpg" in sync_url:
            sync_url = sync_url.replace("+asyncpg", "+psycopg")
        elif "postgresql://" in sync_url and "+psycopg" not in sync_url:
            # Explicitly pin the psycopg driver to avoid implicit psycopg2 dependency
            sync_url = sync_url.replace("postgresql://", "postgresql+psycopg://", 1)

        engine = create_engine(sync_url)
        sync_engine_container["engine"] = engine
        SessionLocal = sessionmaker(bind=engine)

        def _session_scope():
            with SessionLocal() as session:
                yield session

        return _session_scope

    # Use a lightweight sync session for the FastAPI dependency override so that
    # QueryService (sync) receives a synchronous Session, avoiding coroutine
    # results in integration tests.
    override_get_db = _build_sync_session()

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        # Dispose sync engine used by dependency override to prevent unraisable warnings
        sync_engine = sync_engine_container.get("engine")
        if sync_engine:
            sync_engine.dispose()

    app.dependency_overrides.clear()


def _is_retryable_lock_error(error: Exception) -> bool:
    message = str(getattr(error, "orig", error)).lower()
    patterns = (
        "deadlock detected",
        "deadlockdetected",
        "lock timeout",
        "could not obtain lock",
        "canceling statement due to lock timeout",
        "canceling statement due to statement timeout",
    )
    return any(pattern in message for pattern in patterns)


async def _set_local_lock_timeouts(session: AsyncSession) -> None:
    await session.execute(text("SET LOCAL lock_timeout = '5s'"))
    await session.execute(text("SET LOCAL statement_timeout = '120s'"))


async def _acquire_test_setup_lock(session: AsyncSession) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:lock_key)"),
        {"lock_key": INTEGRATION_TEST_DB_ADVISORY_LOCK_KEY},
    )


async def _refresh_materialized_views(
    session: AsyncSession,
    *,
    include_daily_portfolio: bool = True,
    include_daily_wallet_token: bool = True,
    include_portfolio_category_trend: bool = True,
) -> None:
    await _set_local_lock_timeouts(session)
    await _acquire_test_setup_lock(session)

    if include_daily_portfolio:
        await session.execute(
            text("REFRESH MATERIALIZED VIEW daily_portfolio_snapshots")
        )

    if include_daily_wallet_token:
        await session.execute(
            text("REFRESH MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots")
        )

    if include_portfolio_category_trend:
        await session.execute(
            text("REFRESH MATERIALIZED VIEW portfolio_category_trend_mv")
        )


async def refresh_mv_session(
    session: AsyncSession,
    *,
    include_daily_portfolio: bool = True,
    include_daily_wallet_token: bool = True,
    include_portfolio_category_trend: bool = True,
) -> None:
    """Refresh integration materialized views with lock retries."""
    for attempt in range(1, INTEGRATION_DB_LOCK_RETRY_ATTEMPTS + 1):
        try:
            await _refresh_materialized_views(
                session,
                include_daily_portfolio=include_daily_portfolio,
                include_daily_wallet_token=include_daily_wallet_token,
                include_portfolio_category_trend=include_portfolio_category_trend,
            )
            await session.commit()
            return
        except SQLAlchemyError as error:
            await session.rollback()
            if (
                not _is_retryable_lock_error(error)
                or attempt >= INTEGRATION_DB_LOCK_RETRY_ATTEMPTS
            ):
                raise
            await asyncio.sleep(INTEGRATION_DB_LOCK_RETRY_DELAY_SECONDS * attempt)


@pytest.fixture
async def test_user_with_debt(integration_db_session: AsyncSession) -> dict[str, Any]:
    """
    Create test user with debt positions in DeFi protocol.

    Seeds the database with a user who has:
    - $10,000 USDC deposited (assets)
    - $3,000 USDC borrowed (debt, negative amount)
    - Expected NET portfolio value: $7,000

    The JSONB asset_token_list contains both positive (assets) and negative
    (debt) amounts to validate proper debt handling.

    Args:
        integration_db_session: Test database session

    Returns:
        dict: Test data including user_id, wallet, and expected values
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xDEBT{user_id[:8].upper()}"
    snapshot_id = str(uuid.uuid4())
    snapshot_time = datetime.now(UTC) - timedelta(days=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"debt-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Debt Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Create portfolio snapshot with DEBT (negative amounts in JSONB)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain,
                asset_token_list, asset_usd_value, debt_usd_value,
                net_usd_value, name, protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum',
                CAST(:asset_token_list AS jsonb),
                10000.0, 3000.0, 7000.0,
                'Aave V3', 'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "10000", "price": "1.0", "decimals": 6},
                {"symbol": "USDC", "amount": "-3000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    await integration_db_session.flush()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "snapshot_time": snapshot_time,
        "expected_net": 7000.0,
        "expected_assets": 10000.0,
        "expected_debt": 3000.0,
    }


@pytest.fixture
async def test_user_multi_day_debt(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with debt positions across multiple days.

    Seeds a 3-day history showing:
    - Day 1: $10,000 assets, $0 debt → NET $10,000
    - Day 2: $10,000 assets, $2,000 debt → NET $8,000 (borrowed)
    - Day 3: $10,000 assets, $1,000 debt → NET $9,000 (repaid partial)

    This validates that debt changes over time correctly affect portfolio value
    and PnL calculations.

    Args:
        integration_db_session: Test database session

    Returns:
        dict: Test data including user_id, wallet, and 3-day expected values
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xHISTORY{user_id[:8].upper()}"

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"multi-day-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Multi-Day Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Day 1: No debt
    day1 = datetime.now(UTC) - timedelta(days=3)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain,
                asset_token_list, asset_usd_value, debt_usd_value,
                net_usd_value, name, protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum',
                CAST(:asset_token_list AS jsonb),
                10000.0, 0.0, 10000.0,
                'Aave V3', 'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": day1,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "10000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    # Day 2: $2,000 debt
    day2 = datetime.now(UTC) - timedelta(days=2)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain,
                asset_token_list, asset_usd_value, debt_usd_value,
                net_usd_value, name, protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum',
                CAST(:asset_token_list AS jsonb),
                10000.0, 2000.0, 8000.0,
                'Aave V3', 'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": day2,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "10000", "price": "1.0", "decimals": 6},
                {"symbol": "USDC", "amount": "-2000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    # Day 3: $1,000 debt (repaid $1,000)
    day3 = datetime.now(UTC) - timedelta(days=1)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain,
                asset_token_list, asset_usd_value, debt_usd_value,
                net_usd_value, name, protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum',
                CAST(:asset_token_list AS jsonb),
                10000.0, 1000.0, 9000.0,
                'Aave V3', 'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": day3,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "10000", "price": "1.0", "decimals": 6},
                {"symbol": "USDC", "amount": "-1000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    await integration_db_session.flush()
    await refresh_mv_session(integration_db_session)
    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "day1": {"date": day1, "net": 10000.0, "debt": 0.0},
        "day2": {"date": day2, "net": 8000.0, "debt": 2000.0},
        "day3": {"date": day3, "net": 9000.0, "debt": 1000.0},
    }


@pytest.fixture
async def test_user_zero_debt(integration_db_session: AsyncSession) -> dict[str, Any]:
    """
    Create test user with no debt positions (regression test).

    Seeds a user with only positive token amounts (no borrowing) to ensure
    the debt handling fix doesn't break existing functionality for users
    without debt.

    Args:
        integration_db_session: Test database session

    Returns:
        dict: Test data including user_id, wallet, and expected values
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xNODEBT{user_id[:6].upper()}"
    snapshot_id = str(uuid.uuid4())
    snapshot_time = datetime.now(UTC) - timedelta(days=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"no-debt-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'No Debt Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Create portfolio snapshot with NO debt (only positive amounts)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain,
                asset_token_list, asset_usd_value, debt_usd_value,
                net_usd_value, name, protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum',
                CAST(:asset_token_list AS jsonb),
                15000.0, 0.0, 15000.0,
                'Curve Finance', 'dex', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "ETH", "amount": "5", "price": "2000", "decimals": 18},
                {"symbol": "USDC", "amount": "5000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    await integration_db_session.flush()
    await refresh_mv_session(integration_db_session)
    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "snapshot_time": snapshot_time,
        "expected_net": 15000.0,
        "expected_assets": 15000.0,
        "expected_debt": 0.0,
    }


# ============================================================================
# Shared Test Data Builders for Consistency Tests
# ============================================================================


async def build_gmx_v2_position(
    session: AsyncSession,
    user_id: str,
    wallet: str,
    token_symbol: str,
    token_amount: str,
    token_price: str,
    usd_value: float,
    snapshot_time: datetime,
) -> str:
    """
    Factory function for creating GMX V2 liquidity pool positions.

    Args:
        session: Database session
        user_id: User ID
        wallet: Wallet address
        token_symbol: Token symbol (e.g., "WBTC", "WETH", "SOL")
        token_amount: Token amount as string
        token_price: Token price as string
        usd_value: USD value of position
        snapshot_time: Snapshot timestamp

    Returns:
        str: Snapshot ID of created position
    """
    snapshot_id = str(uuid.uuid4())

    await session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'GMX V2', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                :usd_value, :usd_value,
                'dex', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "wallet": wallet,
            "snapshot_at": snapshot_time,
            "asset_token_list": f"""[
                {{"symbol": "{token_symbol}", "amount": "{token_amount}", "price": "{token_price}", "decimals": 18}}
            ]""",
            "usd_value": usd_value,
        },
    )

    return snapshot_id


async def build_multi_protocol_snapshot(
    session: AsyncSession,
    user_id: str,
    wallet: str,
    protocol: str,
    chain: str,
    name_item: str,
    tokens: list[dict[str, str]],
    usd_value: float,
    snapshot_time: datetime,
) -> str:
    """
    Factory function for creating multi-protocol portfolio snapshots.

    Args:
        session: Database session
        user_id: User ID
        wallet: Wallet address
        protocol: Protocol name (e.g., "Aave V3", "Compound V3")
        chain: Chain name (e.g., "ethereum", "polygon")
        name_item: Position type (e.g., "Lending", "Liquidity Pool")
        tokens: List of token dicts with symbol, amount, price
        usd_value: USD value of position
        snapshot_time: Snapshot timestamp

    Returns:
        str: Snapshot ID of created position
    """
    snapshot_id = str(uuid.uuid4())

    # Build token list JSON
    token_list_json = []
    for token in tokens:
        token_list_json.append(
            {
                "symbol": token["symbol"],
                "amount": token["amount"],
                "price": token.get("price", "1.0"),
                "decimals": token.get("decimals", 18),
            }
        )

    # Determine protocol type
    protocol_type = "dex" if "pool" in name_item.lower() else "lending"

    await session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, :chain, :protocol, :name_item,
                CAST(:asset_token_list AS jsonb),
                :usd_value, :usd_value,
                :protocol_type, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": snapshot_id,
            "user_id": user_id,
            "wallet": wallet,
            "snapshot_at": snapshot_time,
            "chain": chain,
            "protocol": protocol,
            "name_item": name_item,
            "asset_token_list": token_list_json,
            "usd_value": usd_value,
            "protocol_type": protocol_type,
        },
    )

    return snapshot_id


@pytest.fixture
def assert_endpoint_consistency():
    """
    Fixture providing consistency assertion helpers.

    Returns helper functions for validating data consistency between endpoints.
    Import consistency validators from helpers module for detailed assertions.
    """
    from tests.integration.helpers.consistency_validators import (
        assert_chain_breakdown_consistency,
        assert_pool_lists_match,
        assert_protocol_breakdown_consistency,
        assert_token_signature_distinct,
        assert_total_values_match,
    )

    return {
        "assert_total_values_match": assert_total_values_match,
        "assert_pool_lists_match": assert_pool_lists_match,
        "assert_protocol_breakdown_consistency": assert_protocol_breakdown_consistency,
        "assert_chain_breakdown_consistency": assert_chain_breakdown_consistency,
        "assert_token_signature_distinct": assert_token_signature_distinct,
    }


@pytest.fixture(scope="session", autouse=True)
async def ensure_integration_mv_exists(request: pytest.FixtureRequest):
    """
    Verify portfolio_category_trend_mv exists in integration database.

    Integration tests assume database has migrations pre-applied.
    This fixture validates setup and provides helpful error if MV missing.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    if not _collection_requires_integration_db(request):
        return

    db_url = os.getenv("DATABASE_INTEGRATION_URL")
    if not db_url:
        pytest.skip(
            "DATABASE_INTEGRATION_URL not set - skipping integration tests. "
            "Set this environment variable to run PostgreSQL integration tests. "
            "Recommended: export DATABASE_INTEGRATION_URL="
            "'postgresql+asyncpg://user:pass@localhost/test_db'"
        )
    integration_db_url = _normalize_integration_async_url(db_url)
    engine = create_async_engine(integration_db_url, echo=False)

    async with engine.begin() as conn:
        required_objects = [
            "portfolio_category_trend_mv",
            "daily_portfolio_snapshots",
            "alpha_raw.daily_wallet_token_snapshots",
        ]
        for obj in required_objects:
            result = await conn.execute(text("SELECT to_regclass(:obj)"), {"obj": obj})
            if result.scalar() is None:
                pytest.fail(
                    f"Integration test database missing {obj}.\n"
                    "Apply migrations:\n"
                    "  psql <db> < migrations/013_daily_snapshot_views.sql\n"
                    "  psql <db> < migrations/create_portfolio_category_trend_mv.sql"
                )

    await engine.dispose()


@pytest.fixture
async def refresh_integration_mv(integration_db_session: AsyncSession):
    """
    Refresh portfolio_category_trend_mv in integration tests.

    Call after inserting portfolio snapshots to populate MV with test data.
    Mirrors production post-ETL refresh workflow.
    """
    await refresh_mv_session(integration_db_session)

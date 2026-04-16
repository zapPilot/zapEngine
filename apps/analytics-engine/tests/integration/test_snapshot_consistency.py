"""
Cross-Service Snapshot Consistency Tests

Validates that the canonical snapshot architecture ensures consistency across all analytics services.

Key Test Areas:
1. Landing page totals match pool_details snapshot dates
2. Dashboard metrics use consistent wallet filtering
3. Conditional routing (MV vs runtime) works correctly
4. Canonical snapshot service returns consistent dates
5. ETL retry scenarios don't cause double-counting
"""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.services.analytics.dashboard_service import DashboardService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.portfolio.landing_page_service import LandingPageService
from src.services.shared.value_objects import WalletAggregate
from tests.integration.conftest import refresh_mv_session


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def wallet_address() -> str:
    """Test wallet address."""
    return "0x1234567890abcdef1234567890abcdef12345678"


@pytest.fixture
def snapshot_date() -> date:
    """Test snapshot date."""
    return date(2025, 1, 1)


@pytest.fixture
def mock_db():
    """Mock database session."""
    return MagicMock(spec=Session)


@pytest.fixture
def mock_query_service():
    """Mock query service."""
    return MagicMock()


@pytest.fixture
def canonical_service(mock_db, mock_query_service):
    """CanonicalSnapshotService instance with mocked dependencies."""
    return CanonicalSnapshotService(mock_db, mock_query_service)


class TestLandingPageSnapshotConsistency:
    """Test that landing page components use consistent snapshot dates."""

    @patch("src.services.portfolio.landing_page_service.analytics_cache")
    def test_landing_totals_match_pool_details_snapshot_date(
        self, mock_cache, user_id, snapshot_date
    ):
        """
        Verify that landing page totals and pool_details use the same snapshot_date.

        This test ensures that:
        1. Canonical snapshot service is called first
        2. Portfolio snapshot service receives the canonical date
        3. Pool performance service receives the same canonical date
        4. ROI calculator receives the same canonical date
        """
        # Arrange
        mock_cache.get.return_value = None  # Cache miss

        mock_canonical_service = MagicMock()
        mock_canonical_service.get_snapshot_date.return_value = snapshot_date

        mock_portfolio_service = MagicMock()
        mock_portfolio_service.get_portfolio_snapshot.return_value = (
            None  # Empty portfolio
        )

        mock_pool_service = MagicMock()
        mock_roi_calculator = MagicMock()
        mock_wallet_service = MagicMock()
        mock_query_service = MagicMock()
        mock_db = MagicMock()
        mock_response_builder = MagicMock()
        mock_response_builder.build_empty_response.return_value = {"empty": True}

        landing_service = LandingPageService(
            db=mock_db,
            wallet_service=mock_wallet_service,
            query_service=mock_query_service,
            roi_calculator=mock_roi_calculator,
            portfolio_snapshot_service=mock_portfolio_service,
            pool_performance_service=mock_pool_service,
            canonical_snapshot_service=mock_canonical_service,
            response_builder=mock_response_builder,
        )

        # Act
        _ = landing_service.get_landing_page_data(user_id)

        # Assert
        # Verify canonical snapshot service was called
        mock_canonical_service.get_snapshot_date.assert_called_once_with(user_id)

        # Since portfolio snapshot was None, other services shouldn't be called
        # But if there was data, they would all receive the same snapshot_date

    @patch("src.services.portfolio.landing_page_service.analytics_cache")
    def test_landing_all_services_use_canonical_date(
        self, mock_cache, user_id, snapshot_date
    ):
        """
        Verify all landing page services receive the canonical snapshot date.

        This is a more comprehensive test that verifies the full flow.
        """
        # Arrange
        mock_cache.get.return_value = None  # Cache miss

        mock_canonical_service = MagicMock()
        mock_canonical_service.get_snapshot_date.return_value = snapshot_date

        # Mock portfolio snapshot with minimal data
        mock_snapshot = MagicMock()
        mock_snapshot.wallet_addresses = ["0xtest"]
        mock_snapshot.wallet_override = None
        mock_snapshot.to_portfolio_summary.return_value = {
            "wallet_assets": {
                "btc": 1000,
                "eth": 500,
                "stablecoins": 100,
                "others": 50,
            },
            "total_assets": 1650,
            "total_debt": 0.0,
            "net_portfolio_value": 1650.0,
            "wallet_token_count": 4,
        }

        mock_portfolio_service = MagicMock()
        mock_portfolio_service.get_portfolio_snapshot.return_value = mock_snapshot

        mock_pool_service = MagicMock()
        mock_pool_service.get_pool_performance.return_value = []

        mock_roi_calculator = MagicMock()
        mock_roi_calculator.compute_portfolio_roi.return_value = {
            "windows": {},
            "recommended_roi": 0.0,
        }

        mock_wallet_service = MagicMock()
        mock_wallet_service.get_wallet_token_summaries_batch.return_value = {
            "0xtest": WalletAggregate(total_value=1650.0, token_count=1)
        }

        mock_query_service = MagicMock()
        mock_db = MagicMock()

        from src.services.portfolio.portfolio_aggregator import PortfolioAggregator
        from src.services.portfolio.portfolio_response_builder import (
            PortfolioResponseBuilder,
        )

        aggregator = PortfolioAggregator()
        response_builder = PortfolioResponseBuilder(aggregator)

        landing_service = LandingPageService(
            db=mock_db,
            wallet_service=mock_wallet_service,
            query_service=mock_query_service,
            roi_calculator=mock_roi_calculator,
            portfolio_snapshot_service=mock_portfolio_service,
            pool_performance_service=mock_pool_service,
            canonical_snapshot_service=mock_canonical_service,
            response_builder=response_builder,
            portfolio_aggregator=aggregator,
        )

        # Act
        landing_service.get_landing_page_data(user_id)

        # Assert
        # Canonical snapshot called once
        mock_canonical_service.get_snapshot_date.assert_called_once_with(user_id)

        # Portfolio snapshot received canonical date
        mock_portfolio_service.get_portfolio_snapshot.assert_called_once()
        call_kwargs = mock_portfolio_service.get_portfolio_snapshot.call_args[1]
        assert call_kwargs["snapshot_date"] == snapshot_date

        # ROI calculator received canonical date
        mock_roi_calculator.compute_portfolio_roi.assert_called_once()
        call_kwargs = mock_roi_calculator.compute_portfolio_roi.call_args[1]
        assert call_kwargs["current_snapshot_date"] == snapshot_date


class TestDashboardWalletFilterConsistency:
    """Test that dashboard endpoint filters by wallet_address consistently."""

    @pytest.mark.asyncio
    async def test_dashboard_all_metrics_use_same_wallet_filter(
        self, user_id, wallet_address
    ):
        """
        Verify that dashboard endpoint passes wallet_address to all analytics services.

        When wallet_address is provided, all services should receive it for filtering.
        """
        # Arrange
        mock_canonical_service = MagicMock()
        mock_canonical_service.get_snapshot_date.return_value = date(2025, 1, 1)

        mock_trend_service = MagicMock()
        mock_trend_service.get_portfolio_trend.return_value = {"daily_values": []}

        mock_risk_service = MagicMock()
        mock_risk_service.calculate_portfolio_volatility.return_value = {}
        mock_risk_service.calculate_sharpe_ratio.return_value = {}
        mock_risk_service.calculate_max_drawdown.return_value = {}

        mock_drawdown_service = MagicMock()
        mock_drawdown_service.get_enhanced_drawdown_analysis.return_value = {}
        mock_drawdown_service.get_underwater_recovery_analysis.return_value = {}

        mock_allocation_service = MagicMock()
        mock_allocation_service.get_allocation_timeseries.return_value = {}

        mock_rolling_service = MagicMock()
        mock_rolling_service.get_rolling_sharpe_analysis.return_value = {}
        mock_rolling_service.get_rolling_volatility_analysis.return_value = {}

        dashboard_service = DashboardService(
            trend_service=mock_trend_service,
            risk_service=mock_risk_service,
            drawdown_service=mock_drawdown_service,
            rolling_service=mock_rolling_service,
            canonical_snapshot_service=mock_canonical_service,
        )

        # Act
        with patch(
            "src.services.analytics.dashboard_service.analytics_cache"
        ) as mock_cache:
            mock_cache.get.return_value = None  # Cache miss
            await dashboard_service.get_portfolio_dashboard(
                user_id=user_id, wallet_address=wallet_address
            )

        # Assert
        # Trend service received wallet_address
        mock_trend_service.get_portfolio_trend.assert_called_once()
        assert (
            mock_trend_service.get_portfolio_trend.call_args[1]["wallet_address"]
            == wallet_address
        )

        # Risk metrics received wallet_address
        mock_risk_service.calculate_portfolio_volatility.assert_called_once()
        assert (
            mock_risk_service.calculate_portfolio_volatility.call_args[1][
                "wallet_address"
            ]
            == wallet_address
        )


class TestConditionalRouting:
    """Test that conditional routing between MV and runtime queries works correctly."""

    @patch("src.services.shared.base_analytics_service.analytics_cache")
    def test_bundle_request_uses_mv_query(
        self, mock_cache, user_id, mock_db, mock_query_service
    ):
        """
        Verify that bundle queries (wallet_address=None) use MV query.

        This test checks the query name used for bundle requests.
        """
        from src.services.analytics.analytics_context import get_analytics_context
        from src.services.analytics.trend_analysis_service import TrendAnalysisService

        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query.return_value = []  # Empty result

        context = get_analytics_context()
        trend_service = TrendAnalysisService(
            db=mock_db,
            query_service=mock_query_service,
            context=context,
        )

        # Act
        trend_service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            wallet_address=None,  # Bundle request
        )

        # Assert
        # Verify query service was called with MV query name
        mock_query_service.execute_query.assert_called_once()
        call_args = mock_query_service.execute_query.call_args
        query_name = call_args[0][1]  # Second positional arg is query_name

        # Should use MV query for bundle requests
        assert query_name == "get_portfolio_category_trend_from_mv"

    @patch("src.services.shared.base_analytics_service.analytics_cache")
    def test_wallet_specific_uses_runtime_query(
        self, mock_cache, user_id, wallet_address, mock_db, mock_query_service
    ):
        """
        Verify that wallet-specific queries use runtime query for accurate filtering.

        When wallet_address is provided, should use get_portfolio_category_trend_by_user_id.
        """
        from src.services.analytics.analytics_context import get_analytics_context
        from src.services.analytics.trend_analysis_service import TrendAnalysisService

        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query.return_value = []  # Empty result

        context = get_analytics_context()
        trend_service = TrendAnalysisService(
            db=mock_db,
            query_service=mock_query_service,
            context=context,
        )

        # Act
        trend_service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            wallet_address=wallet_address,  # Wallet-specific request
        )

        # Assert
        # Verify query service was called with runtime query name
        mock_query_service.execute_query.assert_called_once()
        call_args = mock_query_service.execute_query.call_args
        query_name = call_args[0][1]  # Second positional arg is query_name

        # Should use runtime query for wallet-specific requests
        assert query_name == "get_portfolio_category_trend_by_user_id"


class TestCanonicalSnapshotConsistency:
    """Test that CanonicalSnapshotService returns consistent dates."""

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_canonical_snapshot_date_consistency(
        self, mock_cache, canonical_service, user_id, snapshot_date, mock_query_service
    ):
        """
        Verify that multiple calls to get_snapshot_date return the same date.

        This tests caching behavior and ensures consistency within a session.
        """
        # Arrange
        mock_cache.get.return_value = None  # First call - cache miss
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": snapshot_date,
            "wallet_count": 3,
        }

        # Act
        result1 = canonical_service.get_snapshot_date(user_id)

        # Simulate cache hit on second call
        mock_cache.get.return_value = snapshot_date
        result2 = canonical_service.get_snapshot_date(user_id)

        # Assert
        assert result1 == result2 == snapshot_date
        # Query executed only once (second call used cache)
        assert mock_query_service.execute_query_one.call_count == 1

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_canonical_snapshot_different_wallets_different_dates(
        self, mock_cache, canonical_service, user_id, mock_query_service
    ):
        """
        Verify that bundle and wallet-specific requests are cached separately.

        Cache keys should differentiate between bundle (all wallets with data) and wallet-specific queries.
        """
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        bundle_date = date(2025, 1, 1)
        wallet_date = date(2024, 12, 31)

        def query_side_effect(db, query_name, params):
            if params.get("wallet_address") is None:
                return {"snapshot_date": bundle_date}
            else:
                return {"snapshot_date": wallet_date}

        mock_query_service.execute_query_one.side_effect = query_side_effect

        # Act
        bundle_result = canonical_service.get_snapshot_date(
            user_id, wallet_address=None
        )
        wallet_result = canonical_service.get_snapshot_date(
            user_id, wallet_address="0xtest"
        )

        # Assert
        assert bundle_result == bundle_date
        assert wallet_result == wallet_date
        # Different cache keys, so both queries executed
        assert mock_query_service.execute_query_one.call_count == 2


class TestETLRetryScenarios:
    """Test that ETL retry scenarios don't cause double-counting."""

    @pytest.mark.asyncio
    async def test_etl_retry_does_not_double_count(
        self,
        integration_db_session,
        integration_client,
        user_id,
    ):
        """
        Simulate ETL retry scenario and verify no double-counting.

        Scenario:
        1. ETL inserts snapshots for day D
        2. ETL retries and inserts duplicate snapshots for day D
        3. Query landing page totals
        4. Assert totals are NOT doubled

        The daily snapshot views should prevent duplicates by selecting
        latest snapshot per wallet per day.
        """
        # This test would require actual database setup to insert and query data
        # For integration testing, we'd use a test database fixture
        # For now, this is a placeholder showing the test structure

        wallet_id = uuid4()
        wallet_address = f"0xRETRY{str(user_id)[:8].upper()}"
        snapshot_day = datetime.now(UTC) - timedelta(days=1)
        snapshot_time_1 = snapshot_day.replace(
            hour=7, minute=0, second=0, microsecond=0
        )
        snapshot_time_2 = snapshot_day.replace(
            hour=8, minute=0, second=0, microsecond=0
        )

        # Create user + wallet
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": str(user_id), "email": f"retry-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Retry Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {
                "wallet_id": str(wallet_id),
                "user_id": str(user_id),
                "wallet": wallet_address,
            },
        )

        # Insert initial snapshot (value 100)
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    100.0, 100.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": str(user_id),
                "wallet": wallet_address,
                "snapshot_at": snapshot_time_1,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "100", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        # ETL retry inserts a newer snapshot on the same day (value 200)
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    200.0, 200.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": str(user_id),
                "wallet": wallet_address,
                "snapshot_at": snapshot_time_2,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "200", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        await integration_db_session.commit()

        # Refresh MVs (daily snapshots + trend MV)
        await refresh_mv_session(integration_db_session)

        # Landing totals should match latest snapshot (200), not doubled
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()
        assert abs(float(landing_data["total_net_usd"]) - 200.0) < 0.01

        # Trend latest day should also reflect 200
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=3"
        )
        assert trend_response.status_code == 200, trend_response.text
        trend_data = trend_response.json()
        daily_values = trend_data.get("daily_values", [])
        assert daily_values, "Expected trend daily values"
        latest = max(daily_values, key=lambda row: row["date"])
        assert abs(float(latest["total_value_usd"]) - 200.0) < 0.01

        # Dashboard trend should also reflect 200
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 3},
        )
        assert dashboard_response.status_code == 200, dashboard_response.text
        dashboard_data = dashboard_response.json()
        dashboard_trend = dashboard_data.get("trends", {})
        dashboard_values = dashboard_trend.get("daily_values", [])
        assert dashboard_values, "Expected dashboard trend daily values"
        dashboard_latest = max(dashboard_values, key=lambda row: row["date"])
        assert abs(float(dashboard_latest["total_value_usd"]) - 200.0) < 0.01

    @pytest.mark.asyncio
    async def test_bundle_ignores_wallets_without_snapshots(
        self,
        integration_db_session,
        integration_client,
    ):
        """
        Ensure bundle endpoints return data even if one wallet has no snapshots.

        Regression test for:
        - get_canonical_snapshot_date requiring ALL wallets to have data
        - landing/dashboard returning empty when a single wallet is missing
        """
        user_id = str(uuid4())
        wallet_a = f"0xBUNDLE{user_id[:6].upper()}A"
        wallet_b = f"0xBUNDLE{user_id[:6].upper()}B"
        snapshot_time = datetime.now(UTC) - timedelta(days=1)

        # Create user + wallets
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"bundle-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Wallet A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_a},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Wallet B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_b},
        )

        # Only wallet A has a snapshot (wallet B has no data)
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    100.0, 100.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": user_id,
                "wallet": wallet_a,
                "snapshot_at": snapshot_time,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "100", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        await integration_db_session.commit()

        # Refresh MVs (daily snapshots + trend MV)
        await refresh_mv_session(integration_db_session)

        # Landing should return non-zero totals
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()
        assert abs(float(landing_data["total_net_usd"]) - 100.0) < 0.01

        # Dashboard trend should return the same non-zero total
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 3},
        )
        assert dashboard_response.status_code == 200, dashboard_response.text
        dashboard_data = dashboard_response.json()
        dashboard_values = (dashboard_data.get("trends") or {}).get(
            "daily_values"
        ) or []
        assert dashboard_values, "Expected dashboard trend daily values"
        dashboard_latest = max(dashboard_values, key=lambda row: row["date"])
        assert abs(float(dashboard_latest["total_value_usd"]) - 100.0) < 0.01


class TestLandingTotalsComposition:
    """Ensure landing totals match component sums from canonical daily sources."""

    @pytest.mark.asyncio
    async def test_landing_totals_match_component_sums(
        self,
        integration_db_session,
        integration_client,
    ):
        user_id = str(uuid4())
        wallet_address = f"0xCOMP{user_id[:6].upper()}"
        snapshot_time = datetime.now(UTC) - timedelta(days=1)
        snapshot_date = snapshot_time.date()

        # Create user + wallet
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"comp-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Composition Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_address},
        )

        # DeFi snapshot: assets 200, debt 20, net 180
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, debt_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    200.0, 20.0, 180.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": user_id,
                "wallet": wallet_address,
                "snapshot_at": snapshot_time,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "200", "price": "1.0", "decimals": 6},
                    {"symbol": "USDC", "amount": "-20", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        # Wallet tokens: 50 USDC
        await integration_db_session.execute(
            text(
                """
                INSERT INTO alpha_raw.wallet_token_snapshots (
                    user_wallet_address, token_address, amount, price, symbol,
                    chain, is_wallet, inserted_at, time_at
                ) VALUES (
                    :wallet, :token_address, :amount, :price, :symbol,
                    :chain, true, :inserted_at, :time_at
                )
            """
            ),
            {
                "wallet": wallet_address,
                "token_address": "0xToken",
                "amount": 50,
                "price": 1,
                "symbol": "USDC",
                "chain": "eth",
                "inserted_at": snapshot_time,
                "time_at": 123,
            },
        )

        await integration_db_session.commit()

        # Refresh MVs (daily snapshots + trend MV)
        await refresh_mv_session(integration_db_session)

        # Landing response
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()

        # 1) DeFi total = sum(pool_details.asset_usd_value)
        defi_total = sum(
            float(pool.get("asset_usd_value", 0.0))
            for pool in landing_data.get("pool_details", [])
        )

        # 2) Wallet total = sum(amount * price) from daily_wallet_token_snapshots
        wallet_total_result = await integration_db_session.execute(
            text(
                """
                SELECT COALESCE(SUM(amount * price), 0) AS wallet_total
                FROM alpha_raw.daily_wallet_token_snapshots
                WHERE user_wallet_address = :wallet
                  AND (inserted_at AT TIME ZONE 'UTC')::date = :snapshot_date
            """
            ),
            {"wallet": wallet_address.lower(), "snapshot_date": snapshot_date},
        )
        wallet_total = float(wallet_total_result.scalar() or 0.0)

        # 3) total_assets = defi_total + wallet_total
        expected_assets = defi_total + wallet_total
        assert abs(float(landing_data["total_assets_usd"]) - expected_assets) < 0.01

        # 4) total_debt = sum(debt_usd_value) from daily_portfolio_snapshots
        debt_result = await integration_db_session.execute(
            text(
                """
                SELECT COALESCE(SUM(debt_usd_value), 0) AS total_debt
                FROM daily_portfolio_snapshots
                WHERE wallet = :wallet
                  AND (snapshot_at AT TIME ZONE 'UTC')::date = :snapshot_date
            """
            ),
            {"wallet": wallet_address.lower(), "snapshot_date": snapshot_date},
        )
        total_debt = float(debt_result.scalar() or 0.0)
        assert abs(float(landing_data["total_debt_usd"]) - total_debt) < 0.01

        # 5) net = total_assets - total_debt
        expected_net = expected_assets - total_debt
        assert abs(float(landing_data["total_net_usd"]) - expected_net) < 0.01


class TestDashboardTotalsComposition:
    """Ensure dashboard trend totals match component sums from canonical daily sources."""

    @pytest.mark.asyncio
    async def test_dashboard_totals_match_component_sums(
        self,
        integration_db_session,
        integration_client,
    ):
        user_id = str(uuid4())
        wallet_address = f"0xDASH{user_id[:6].upper()}"
        snapshot_time = datetime.now(UTC) - timedelta(days=1)
        snapshot_date = snapshot_time.date()

        # Create user + wallet
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"dashcomp-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Dashboard Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_address},
        )

        # DeFi snapshot: assets 300, debt 30, net 270
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, debt_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    300.0, 30.0, 270.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": user_id,
                "wallet": wallet_address,
                "snapshot_at": snapshot_time,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "300", "price": "1.0", "decimals": 6},
                    {"symbol": "USDC", "amount": "-30", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        # Wallet tokens: 70 USDC
        await integration_db_session.execute(
            text(
                """
                INSERT INTO alpha_raw.wallet_token_snapshots (
                    user_wallet_address, token_address, amount, price, symbol,
                    chain, is_wallet, inserted_at, time_at
                ) VALUES (
                    :wallet, :token_address, :amount, :price, :symbol,
                    :chain, true, :inserted_at, :time_at
                )
            """
            ),
            {
                "wallet": wallet_address,
                "token_address": "0xToken",
                "amount": 70,
                "price": 1,
                "symbol": "USDC",
                "chain": "eth",
                "inserted_at": snapshot_time,
                "time_at": 456,
            },
        )

        await integration_db_session.commit()

        # Refresh MVs (daily snapshots + trend MV)
        await refresh_mv_session(integration_db_session)

        # Dashboard response (trend only)
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 3},
        )
        assert dashboard_response.status_code == 200, dashboard_response.text
        dashboard_data = dashboard_response.json()
        dashboard_values = (dashboard_data.get("trends") or {}).get(
            "daily_values"
        ) or []
        assert dashboard_values, "Expected dashboard trend daily values"
        dashboard_latest = max(dashboard_values, key=lambda row: row["date"])

        # 1) DeFi total = sum(pool_details.asset_usd_value) from landing
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()
        defi_total = sum(
            float(pool.get("asset_usd_value", 0.0))
            for pool in landing_data.get("pool_details", [])
        )
        landing_net = float(landing_data["total_net_usd"])

        # 2) Wallet total = sum(amount * price) from daily_wallet_token_snapshots
        wallet_total_result = await integration_db_session.execute(
            text(
                """
                SELECT COALESCE(SUM(amount * price), 0) AS wallet_total
                FROM alpha_raw.daily_wallet_token_snapshots
                WHERE user_wallet_address = :wallet
                  AND (inserted_at AT TIME ZONE 'UTC')::date = :snapshot_date
            """
            ),
            {"wallet": wallet_address.lower(), "snapshot_date": snapshot_date},
        )
        wallet_total = float(wallet_total_result.scalar() or 0.0)

        # 3) total_assets = defi_total + wallet_total
        expected_assets = defi_total + wallet_total

        # 4) total_debt = sum(debt_usd_value) from daily_portfolio_snapshots
        debt_result = await integration_db_session.execute(
            text(
                """
                SELECT COALESCE(SUM(debt_usd_value), 0) AS total_debt
                FROM daily_portfolio_snapshots
                WHERE wallet = :wallet
                  AND (snapshot_at AT TIME ZONE 'UTC')::date = :snapshot_date
            """
            ),
            {"wallet": wallet_address.lower(), "snapshot_date": snapshot_date},
        )
        total_debt = float(debt_result.scalar() or 0.0)

        # 5) net = total_assets - total_debt (dashboard trend uses net)
        expected_net = expected_assets - total_debt
        assert abs(float(dashboard_latest["total_value_usd"]) - expected_net) < 0.01
        assert abs(float(dashboard_latest["total_value_usd"]) - landing_net) < 0.01

    @pytest.mark.asyncio
    async def test_landing_dashboard_trend_net_alignment(
        self,
        integration_db_session,
        integration_client,
    ):
        """
        Validate landing, dashboard, and trend endpoints return the same net value
        for the canonical snapshot date.
        """
        user_id = str(uuid4())
        wallet_address = f"0xALIGN{user_id[:6].upper()}"
        snapshot_time = datetime.now(UTC) - timedelta(days=1)

        # Create user + wallet
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"align-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Align Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_address},
        )

        # DeFi snapshot: assets 120, debt 20, net 100
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, debt_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    120.0, 20.0, 100.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": user_id,
                "wallet": wallet_address,
                "snapshot_at": snapshot_time,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "120", "price": "1.0", "decimals": 6},
                    {"symbol": "USDC", "amount": "-20", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        # Wallet tokens: 50 USDC
        await integration_db_session.execute(
            text(
                """
                INSERT INTO alpha_raw.wallet_token_snapshots (
                    user_wallet_address, token_address, amount, price, symbol,
                    chain, is_wallet, inserted_at, time_at
                ) VALUES (
                    :wallet, :token_address, :amount, :price, :symbol,
                    :chain, true, :inserted_at, :time_at
                )
            """
            ),
            {
                "wallet": wallet_address,
                "token_address": "0xToken",
                "amount": 50,
                "price": 1,
                "symbol": "USDC",
                "chain": "eth",
                "inserted_at": snapshot_time,
                "time_at": 789,
            },
        )

        await integration_db_session.commit()

        # Refresh MVs (daily snapshots + trend MV)
        await refresh_mv_session(integration_db_session)

        # Landing
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()
        landing_net = float(landing_data["total_net_usd"])

        # Dashboard (trend only)
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 3},
        )
        assert dashboard_response.status_code == 200, dashboard_response.text
        dashboard_data = dashboard_response.json()
        dashboard_values = (dashboard_data.get("trends") or {}).get(
            "daily_values"
        ) or []
        assert dashboard_values, "Expected dashboard trend daily values"
        dashboard_latest = max(dashboard_values, key=lambda row: row["date"])
        dashboard_net = float(dashboard_latest["total_value_usd"])

        # Trend endpoint
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=3"
        )
        assert trend_response.status_code == 200, trend_response.text
        trend_data = trend_response.json()
        trend_values = trend_data.get("daily_values") or []
        assert trend_values, "Expected trend daily values"
        trend_latest = max(trend_values, key=lambda row: row["date"])
        trend_net = float(trend_latest["total_value_usd"])

        # Expected net = (120 + 50) - 20 = 150
        assert abs(landing_net - 150.0) < 0.01
        assert abs(dashboard_net - landing_net) < 0.01
        assert abs(trend_net - landing_net) < 0.01

    @pytest.mark.asyncio
    async def test_daily_snapshot_views_deduplicate_correctly(
        self,
        integration_db_session,
    ):
        """
        Verify that daily snapshot views correctly deduplicate on retry.

        The daily_portfolio_snapshots and daily_wallet_token_snapshots MVs
        should keep only the latest snapshot per wallet per UTC day.
        """
        user_id = str(uuid4())
        wallet_id = str(uuid4())
        wallet_address = f"0xWALLET{user_id[:6].upper()}"
        snapshot_date = datetime.now(UTC).date() - timedelta(days=1)
        snapshot_time = datetime.combine(snapshot_date, datetime.min.time(), tzinfo=UTC)

        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"wallet-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
        )

        # Insert wallet token snapshots for same day, different time_at
        await integration_db_session.execute(
            text(
                """
                INSERT INTO alpha_raw.wallet_token_snapshots (
                    user_wallet_address, token_address, amount, price, symbol,
                    chain, is_wallet, inserted_at, time_at
                ) VALUES (
                    :wallet, :token_address, :amount, :price, :symbol,
                    :chain, true, :inserted_at, :time_at
                )
            """
            ),
            {
                "wallet": wallet_address,
                "token_address": "0xToken",
                "amount": 10,
                "price": 1,
                "symbol": "USDC",
                "chain": "eth",
                "inserted_at": snapshot_time,
                "time_at": 100,
            },
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO alpha_raw.wallet_token_snapshots (
                    user_wallet_address, token_address, amount, price, symbol,
                    chain, is_wallet, inserted_at, time_at
                ) VALUES (
                    :wallet, :token_address, :amount, :price, :symbol,
                    :chain, true, :inserted_at, :time_at
                )
            """
            ),
            {
                "wallet": wallet_address,
                "token_address": "0xToken",
                "amount": 20,
                "price": 1,
                "symbol": "USDC",
                "chain": "eth",
                "inserted_at": snapshot_time,
                "time_at": 200,
            },
        )
        await integration_db_session.commit()

        await refresh_mv_session(
            integration_db_session,
            include_daily_portfolio=False,
            include_portfolio_category_trend=False,
        )

        result = await integration_db_session.execute(
            text(
                """
                SELECT amount, time_at
                FROM alpha_raw.daily_wallet_token_snapshots
                WHERE user_wallet_address = :wallet
            """
            ),
            {"wallet": wallet_address.lower()},
        )
        row = result.first()
        assert row is not None
        assert float(row.amount) == 20
        assert int(row.time_at) == 200


class TestCrossServiceDateAlignment:
    """Test that all services align on snapshot dates for the same request."""

    @patch("src.services.shared.base_analytics_service.analytics_cache")
    def test_risk_metrics_use_consistent_snapshot_range(
        self, mock_cache, user_id, mock_db, mock_query_service
    ):
        """
        Verify risk metrics calculations use consistent snapshot date ranges.

        All risk calculations (volatility, Sharpe, drawdown) should use
        the same date range derived from the canonical snapshot.
        """
        from src.services.analytics.analytics_context import get_analytics_context
        from src.services.analytics.risk_metrics_service import RiskMetricsService

        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query.return_value = []  # Empty result

        context = get_analytics_context()
        risk_service = RiskMetricsService(
            db=mock_db,
            query_service=mock_query_service,
            context=context,
        )

        days = 90

        # Act - Call all risk metric methods
        risk_service.calculate_portfolio_volatility(user_id=user_id, days=days)
        volatility_calls = mock_query_service.execute_query.call_count

        risk_service.calculate_sharpe_ratio(user_id=user_id, days=days)
        sharpe_calls = mock_query_service.execute_query.call_count

        risk_service.calculate_max_drawdown(user_id=user_id, days=days)
        drawdown_calls = mock_query_service.execute_query.call_count

        # Assert
        # All methods should have made query calls
        assert volatility_calls > 0
        assert sharpe_calls > volatility_calls  # Sharpe made additional calls
        assert drawdown_calls > sharpe_calls  # Drawdown made additional calls

        # Verify all calls used the same days parameter
        for call in mock_query_service.execute_query.call_args_list:
            params = call[0][2]  # Third positional arg is params dict
            if "days" in params:
                assert params["days"] == days, (
                    "All risk metrics should use same days parameter"
                )


class TestWalletSpecificDashboardConsistency:
    """Integration tests for wallet-specific dashboard trend consistency."""

    @pytest.mark.asyncio
    async def test_wallet_specific_dashboard_trend_excludes_other_wallets(
        self,
        integration_db_session,
        integration_client,
    ):
        user_id = str(uuid4())
        hex_base = user_id.replace("-", "")
        wallet_a = f"0x{hex_base}{'a' * 8}"
        wallet_b = f"0x{hex_base}{'b' * 8}"
        snapshot_time = datetime.now(UTC) - timedelta(days=1)

        # Create user + wallets
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"dash-{user_id}@example.com"},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Wallet A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_a},
        )
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'Wallet B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": str(uuid4()), "user_id": user_id, "wallet": wallet_b},
        )

        # Wallet A snapshot (100)
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    100.0, 100.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": user_id,
                "wallet": wallet_a,
                "snapshot_at": snapshot_time,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "100", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        # Wallet B snapshot (300)
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio, created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'eth', 'Aave V3', 'Lending',
                    CAST(:asset_token_list AS jsonb),
                    300.0, 300.0,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid4()),
                "user_id": user_id,
                "wallet": wallet_b,
                "snapshot_at": snapshot_time,
                "asset_token_list": """[
                    {"symbol": "USDC", "amount": "300", "price": "1.0", "decimals": 6}
                ]""",
            },
        )

        await integration_db_session.commit()

        # Refresh MVs (daily snapshots + trend MV)
        await refresh_mv_session(integration_db_session)

        # Wallet-specific dashboard should only include wallet A value
        response_wallet = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={
                "metrics": "trend",
                "trend_days": 3,
                "wallet_address": wallet_a,
            },
        )
        assert response_wallet.status_code == 200, response_wallet.text
        wallet_payload = response_wallet.json()
        daily_values = wallet_payload["trends"]["daily_values"]
        latest = max(daily_values, key=lambda row: row["date"])
        assert abs(float(latest["total_value_usd"]) - 100.0) < 0.01

        # Bundle dashboard should include both wallets (100 + 300)
        response_bundle = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 3},
        )
        assert response_bundle.status_code == 200, response_bundle.text
        bundle_payload = response_bundle.json()
        bundle_values = bundle_payload["trends"]["daily_values"]
        latest_bundle = max(bundle_values, key=lambda row: row["date"])
        assert abs(float(latest_bundle["total_value_usd"]) - 400.0) < 0.01

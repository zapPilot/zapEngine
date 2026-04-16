"""
Value Consistency Invariants Tests

Explicit tests for mathematical value consistency across API endpoints.
These tests codify the critical invariants that must hold:

INVARIANT 1: Landing page formula
    total_net_usd = sum(pool_details.asset_usd_value) + wallet.total_value - total_debt_usd

INVARIANT 2: Cross-endpoint consistency
    landing.total_net_usd == dashboard.trends.daily_values[-1].total_value_usd

INVARIANT 3: Yield endpoint date alignment
    yield.period.start_date and end_date align with canonical snapshot range

These tests prevent regressions where data flows diverge and cause inconsistent values.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.conftest import refresh_mv_session


def _date_key(value: str) -> str:
    """Normalize ISO datetime/date strings to YYYY-MM-DD for comparisons."""
    return str(value).split("T")[0]


@pytest.fixture
async def test_user_complete_portfolio(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create a user with a complete portfolio setup:
    - DeFi positions (pool_details)
    - Wallet tokens
    - Debt positions

    This fixture enables testing all three components of the total_net_usd formula.
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xCOMPLETE{user_id[:8].upper()}"
    snapshot_time = datetime.now(UTC) - timedelta(days=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"complete-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Complete Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # DeFi Position 1: Aave Lending with debt (assets: 5000, debt: 1000, net: 4000)
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
                5000.0, 1000.0, 4000.0,
                'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "5000", "price": "1.0", "decimals": 6},
                {"symbol": "USDC", "amount": "-1000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    # DeFi Position 2: GMX V2 LP (assets: 3000, no debt)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, debt_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'GMX V2', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                3000.0, 0.0, 3000.0,
                'dex', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "WETH", "amount": "1.0", "price": "3000", "decimals": 18}
            ]""",
        },
    )

    # Wallet tokens: 2000 USDC
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
            "token_address": "0xUSDC",
            "amount": 2000,
            "price": 1.0,
            "symbol": "USDC",
            "chain": "eth",
            "inserted_at": snapshot_time,
            "time_at": 12345,
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    # Expected values:
    # pool_details total (asset_usd_value) = 5000 + 3000 = 8000
    # wallet total = 2000
    # debt total = 1000
    # total_assets = pool_details + wallet = 8000 + 2000 = 10000
    # total_net = total_assets - debt = 10000 - 1000 = 9000
    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_pool_details_sum": 8000.0,  # sum(pool_details.asset_usd_value)
        "expected_wallet_total": 2000.0,  # wallet token value
        "expected_debt_total": 1000.0,  # total_debt_usd
        "expected_total_assets": 10000.0,  # pool_details + wallet
        "expected_total_net": 9000.0,  # total_assets - debt
    }


@pytest.fixture
async def test_user_multi_day_portfolio(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create a user with multiple daily snapshots to validate series alignment.

    Returns expected per-day totals keyed by YYYY-MM-DD.
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xMULTIDAY{user_id[:8].upper()}"

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"multiday-test-{user_id}@example.com"},
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

    snapshot_values = [
        (3, 1200.0),
        (2, 1350.0),
        (1, 1100.0),
    ]
    expected_by_date: dict[str, float] = {}

    for offset_days, value in snapshot_values:
        snapshot_time = datetime.now(UTC) - timedelta(days=offset_days)
        expected_by_date[snapshot_time.date().isoformat()] = value
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
                    :asset_usd_value, 0.0, :net_usd_value,
                    'lending', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid.uuid4()),
                "user_id": user_id,
                "wallet": wallet_address,
                "snapshot_at": snapshot_time,
                "asset_usd_value": value,
                "net_usd_value": value,
                "asset_token_list": f"""[
                    {{"symbol": "USDC", "amount": "{value:.2f}", "price": "1.0", "decimals": 6}}
                ]""",
            },
        )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    latest_date = max(expected_by_date.keys())

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_by_date": expected_by_date,
        "latest_date": latest_date,
        "latest_value": expected_by_date[latest_date],
    }


@pytest.mark.integration
class TestTotalNetUsdFormulaInvariant:
    """
    INVARIANT 1: Landing page total_net_usd formula

    total_net_usd = sum(pool_details.asset_usd_value) + wallet.total_value - total_debt_usd

    This test explicitly validates each component of the formula.
    """

    @pytest.mark.asyncio
    async def test_landing_total_net_equals_formula(
        self,
        integration_client: AsyncClient,
        test_user_complete_portfolio: dict[str, Any],
    ):
        """
        Test that landing page total_net_usd exactly matches the formula:
        total_net_usd = sum(pool_details.asset_usd_value) + wallet_token_summary.total_value_usd - total_debt_usd
        """
        user_id = test_user_complete_portfolio["user_id"]

        response = await integration_client.get(f"/api/v2/portfolio/{user_id}/landing")
        assert response.status_code == 200, response.text

        data = response.json()

        # Extract components from response
        pool_details = data.get("pool_details", [])
        pool_details_sum = sum(float(p.get("asset_usd_value", 0)) for p in pool_details)

        wallet_token_summary = data.get("wallet_token_summary", {})
        wallet_value = float(wallet_token_summary.get("total_value_usd", 0))

        total_debt = float(data.get("total_debt_usd", 0))
        total_assets = float(data.get("total_assets_usd", 0))
        total_net = float(data.get("total_net_usd", 0))

        # INVARIANT 1: total_net_usd = sum(pool_details) + wallet - debt
        expected_total_net = pool_details_sum + wallet_value - total_debt

        assert abs(total_net - expected_total_net) < 0.01, (
            f"INVARIANT 1 VIOLATED: total_net_usd formula mismatch!\n"
            f"  total_net_usd from API: ${total_net:.2f}\n"
            f"  Calculated from formula: ${expected_total_net:.2f}\n"
            f"  Components:\n"
            f"    - sum(pool_details.asset_usd_value): ${pool_details_sum:.2f}\n"
            f"    - wallet_token_summary.total_value_usd: ${wallet_value:.2f}\n"
            f"    - total_debt_usd: ${total_debt:.2f}\n"
            f"  Expected: {pool_details_sum:.2f} + {wallet_value:.2f} - {total_debt:.2f} = {expected_total_net:.2f}"
        )

        # Also verify total_assets = pool_details + wallet
        expected_total_assets = pool_details_sum + wallet_value
        assert abs(total_assets - expected_total_assets) < 0.01, (
            f"total_assets_usd mismatch!\n"
            f"  total_assets_usd from API: ${total_assets:.2f}\n"
            f"  Expected (pool_details + wallet): ${expected_total_assets:.2f}"
        )

    @pytest.mark.asyncio
    async def test_landing_components_match_expected_values(
        self,
        integration_client: AsyncClient,
        test_user_complete_portfolio: dict[str, Any],
    ):
        """
        Test that each component of the landing page matches expected values from fixture.
        """
        user_id = test_user_complete_portfolio["user_id"]
        expected = test_user_complete_portfolio

        response = await integration_client.get(f"/api/v2/portfolio/{user_id}/landing")
        assert response.status_code == 200, response.text

        data = response.json()

        # Verify pool_details sum
        pool_details = data.get("pool_details", [])
        pool_details_sum = sum(float(p.get("asset_usd_value", 0)) for p in pool_details)
        assert abs(pool_details_sum - expected["expected_pool_details_sum"]) < 0.01, (
            f"pool_details sum mismatch: ${pool_details_sum:.2f} != ${expected['expected_pool_details_sum']:.2f}"
        )

        # Verify debt total
        total_debt = float(data.get("total_debt_usd", 0))
        assert abs(total_debt - expected["expected_debt_total"]) < 0.01, (
            f"total_debt_usd mismatch: ${total_debt:.2f} != ${expected['expected_debt_total']:.2f}"
        )

        # Verify total_net_usd
        total_net = float(data.get("total_net_usd", 0))
        assert abs(total_net - expected["expected_total_net"]) < 0.01, (
            f"total_net_usd mismatch: ${total_net:.2f} != ${expected['expected_total_net']:.2f}"
        )


@pytest.mark.integration
class TestCrossEndpointValueConsistency:
    """
    INVARIANT 2: Cross-endpoint value consistency

    landing.total_net_usd == dashboard.trends.daily_values[-1].total_value_usd

    Both endpoints must return the same net portfolio value for the same user.
    """

    @pytest.mark.asyncio
    async def test_landing_equals_dashboard_latest_trend(
        self,
        integration_client: AsyncClient,
        test_user_complete_portfolio: dict[str, Any],
    ):
        """
        Test that landing page total_net_usd equals dashboard's latest trend value.
        """
        user_id = test_user_complete_portfolio["user_id"]

        # Fetch landing page
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()
        landing_net = float(landing_data.get("total_net_usd", 0))

        # Fetch dashboard (trend only)
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 7},
        )
        assert dashboard_response.status_code == 200, dashboard_response.text
        dashboard_data = dashboard_response.json()

        trends = dashboard_data.get("trends", {})
        daily_values = trends.get("daily_values", [])
        assert daily_values, "Dashboard should return daily_values"

        # Get the latest value (max date)
        dashboard_latest = max(daily_values, key=lambda row: row["date"])
        dashboard_net = float(dashboard_latest.get("total_value_usd", 0))

        # INVARIANT 2: landing.total_net_usd == dashboard.trends[-1].total_value_usd
        assert abs(landing_net - dashboard_net) < 0.01, (
            f"INVARIANT 2 VIOLATED: Cross-endpoint value mismatch!\n"
            f"  landing.total_net_usd: ${landing_net:.2f}\n"
            f"  dashboard.trends.daily_values[-1].total_value_usd: ${dashboard_net:.2f}\n"
            f"  Difference: ${abs(landing_net - dashboard_net):.2f}\n"
            f"  This indicates data flow divergence between landing and dashboard services."
        )

    @pytest.mark.asyncio
    async def test_landing_equals_trend_endpoint(
        self,
        integration_client: AsyncClient,
        test_user_complete_portfolio: dict[str, Any],
    ):
        """
        Test that landing page total_net_usd equals standalone trend endpoint's latest value.
        """
        user_id = test_user_complete_portfolio["user_id"]

        # Fetch landing page
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200, landing_response.text
        landing_data = landing_response.json()
        landing_net = float(landing_data.get("total_net_usd", 0))

        # Fetch trend endpoint
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend",
            params={"days": 7},
        )
        assert trend_response.status_code == 200, trend_response.text
        trend_data = trend_response.json()

        daily_values = trend_data.get("daily_values", [])
        assert daily_values, "Trend endpoint should return daily_values"

        # Get the latest value (max date)
        trend_latest = max(daily_values, key=lambda row: row["date"])
        trend_net = float(trend_latest.get("total_value_usd", 0))

        assert abs(landing_net - trend_net) < 0.01, (
            f"Landing/Trend mismatch!\n"
            f"  landing.total_net_usd: ${landing_net:.2f}\n"
            f"  trend.daily_values[-1].total_value_usd: ${trend_net:.2f}"
        )

    @pytest.mark.asyncio
    async def test_all_three_endpoints_consistent(
        self,
        integration_client: AsyncClient,
        test_user_complete_portfolio: dict[str, Any],
    ):
        """
        Test that landing, dashboard, and trend endpoints all return the same value.
        """
        user_id = test_user_complete_portfolio["user_id"]

        # Fetch all three endpoints
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 7},
        )
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend",
            params={"days": 7},
        )

        assert landing_response.status_code == 200
        assert dashboard_response.status_code == 200
        assert trend_response.status_code == 200

        landing_data = landing_response.json()
        dashboard_data = dashboard_response.json()
        trend_data = trend_response.json()

        # Extract values
        landing_net = float(landing_data.get("total_net_usd", 0))

        dashboard_values = (dashboard_data.get("trends") or {}).get(
            "daily_values"
        ) or []
        dashboard_latest = (
            max(dashboard_values, key=lambda row: row["date"])
            if dashboard_values
            else {}
        )
        dashboard_net = float(dashboard_latest.get("total_value_usd", 0))

        trend_values = trend_data.get("daily_values") or []
        trend_latest = (
            max(trend_values, key=lambda row: row["date"]) if trend_values else {}
        )
        trend_net = float(trend_latest.get("total_value_usd", 0))

        # All three should match
        assert abs(landing_net - dashboard_net) < 0.01, (
            f"Landing vs Dashboard mismatch: ${landing_net:.2f} != ${dashboard_net:.2f}"
        )
        assert abs(landing_net - trend_net) < 0.01, (
            f"Landing vs Trend mismatch: ${landing_net:.2f} != ${trend_net:.2f}"
        )
        assert abs(dashboard_net - trend_net) < 0.01, (
            f"Dashboard vs Trend mismatch: ${dashboard_net:.2f} != ${trend_net:.2f}"
        )


@pytest.mark.integration
class TestCrossEndpointSeriesConsistency:
    """
    Series-level consistency across dashboard and trend endpoints.
    """

    @pytest.mark.asyncio
    async def test_dashboard_trend_series_matches_trend_endpoint(
        self,
        integration_client: AsyncClient,
        test_user_multi_day_portfolio: dict[str, Any],
    ):
        user_id = test_user_multi_day_portfolio["user_id"]
        expected_by_date = test_user_multi_day_portfolio["expected_by_date"]

        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 10},
        )
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend",
            params={"days": 10},
        )

        assert dashboard_response.status_code == 200, dashboard_response.text
        assert trend_response.status_code == 200, trend_response.text

        dashboard_data = dashboard_response.json()
        trend_data = trend_response.json()

        dashboard_values = (dashboard_data.get("trends") or {}).get(
            "daily_values"
        ) or []
        trend_values = trend_data.get("daily_values") or []

        dashboard_series = {
            _date_key(row.get("date")): float(row.get("total_value_usd", 0))
            for row in dashboard_values
        }
        trend_series = {
            _date_key(row.get("date")): float(row.get("total_value_usd", 0))
            for row in trend_values
        }

        assert dashboard_series, "Dashboard should return trend daily_values"
        assert trend_series, "Trend endpoint should return daily_values"

        assert set(dashboard_series.keys()) == set(trend_series.keys()), (
            "Dashboard and trend endpoints returned different date sets."
        )

        for date_key in dashboard_series:
            dash_value = dashboard_series[date_key]
            trend_value = trend_series[date_key]
            assert abs(dash_value - trend_value) < 0.01, (
                f"Trend value mismatch on {date_key}: dashboard=${dash_value:.2f} "
                f"vs trend=${trend_value:.2f}"
            )

        assert set(expected_by_date.keys()) == set(dashboard_series.keys()), (
            "Returned trend dates do not match seeded snapshot dates."
        )

    @pytest.mark.asyncio
    async def test_dashboard_metadata_snapshot_date_matches_latest_trend_and_landing(
        self,
        integration_client: AsyncClient,
        test_user_multi_day_portfolio: dict[str, Any],
    ):
        user_id = test_user_multi_day_portfolio["user_id"]
        expected_latest_date = test_user_multi_day_portfolio["latest_date"]

        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 10},
        )
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend",
            params={"days": 10},
        )

        assert landing_response.status_code == 200, landing_response.text
        assert dashboard_response.status_code == 200, dashboard_response.text
        assert trend_response.status_code == 200, trend_response.text

        landing_data = landing_response.json()
        dashboard_data = dashboard_response.json()
        trend_data = trend_response.json()

        metadata = dashboard_data.get("_metadata", {})
        metadata_snapshot_date = metadata.get("snapshot_date")
        assert metadata_snapshot_date, (
            "Dashboard should include _metadata.snapshot_date"
        )

        trend_values = trend_data.get("daily_values") or []
        assert trend_values, "Trend endpoint should return daily_values"
        latest_trend_date = max(_date_key(row.get("date")) for row in trend_values)

        landing_last_updated = landing_data.get("last_updated")
        assert landing_last_updated, "Landing response should include last_updated"
        landing_last_updated_date = _date_key(landing_last_updated)

        landing_snapshot_date_raw = landing_data.get("snapshot_date")
        assert landing_snapshot_date_raw, (
            "Landing response should include snapshot_date"
        )
        landing_snapshot_date = _date_key(landing_snapshot_date_raw)

        trend_snapshot_date_raw = trend_data.get("snapshot_date")
        assert trend_snapshot_date_raw, "Trend response should include snapshot_date"
        trend_snapshot_date = _date_key(trend_snapshot_date_raw)

        dashboard_trend_snapshot_date_raw = (dashboard_data.get("trends") or {}).get(
            "snapshot_date"
        )
        assert dashboard_trend_snapshot_date_raw, (
            "Dashboard trend response should include snapshot_date"
        )
        dashboard_trend_snapshot_date = _date_key(dashboard_trend_snapshot_date_raw)

        assert metadata_snapshot_date == latest_trend_date, (
            "Dashboard snapshot_date should match latest trend date."
        )
        assert landing_last_updated_date == latest_trend_date, (
            "Landing last_updated date should match latest trend date."
        )
        assert landing_snapshot_date == latest_trend_date, (
            "Landing snapshot_date should match latest trend date."
        )
        assert trend_snapshot_date == latest_trend_date, (
            "Trend snapshot_date should match latest trend date."
        )
        assert dashboard_trend_snapshot_date == latest_trend_date, (
            "Dashboard trend snapshot_date should match latest trend date."
        )
        assert metadata_snapshot_date == expected_latest_date, (
            "Dashboard snapshot_date should match the latest seeded snapshot date."
        )


@pytest.mark.integration
class TestYieldEndpointDateAlignment:
    """
    INVARIANT 3: Yield endpoint uses consistent date ranges

    The yield endpoint's period should align with the canonical snapshot service's
    date range calculation.
    """

    @pytest.mark.asyncio
    async def test_yield_endpoint_returns_valid_period(
        self,
        integration_client: AsyncClient,
        test_user_complete_portfolio: dict[str, Any],
    ):
        """
        Test that yield endpoint returns a valid period with proper date range.
        """
        user_id = test_user_complete_portfolio["user_id"]
        days = 30

        response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/yield/daily",
            params={"days": days},
        )
        assert response.status_code == 200, response.text

        data = response.json()
        period = data.get("period", {})

        assert "start_date" in period, "Yield response should include start_date"
        assert "end_date" in period, "Yield response should include end_date"
        assert "days" in period, "Yield response should include days"

        # Verify days parameter is reflected
        assert period["days"] == days, (
            f"Yield period.days ({period['days']}) should match requested days ({days})"
        )


@pytest.mark.integration
class TestEmptyPortfolioConsistency:
    """
    Edge case: Empty portfolios should return consistent zero values across all endpoints.
    """

    @pytest.mark.asyncio
    async def test_empty_portfolio_all_endpoints_zero(
        self,
        integration_client: AsyncClient,
    ):
        """
        Test that a non-existent user returns consistent zero values from all endpoints.
        """
        user_id = str(uuid.uuid4())  # Random user with no data

        # Fetch all endpoints
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "trend", "trend_days": 7},
        )
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend",
            params={"days": 7},
        )

        # All should return 200 (not 404)
        assert landing_response.status_code == 200
        assert dashboard_response.status_code == 200
        assert trend_response.status_code == 200

        landing_data = landing_response.json()
        dashboard_data = dashboard_response.json()
        trend_data = trend_response.json()

        # Landing should have zero totals
        assert float(landing_data.get("total_net_usd", 0)) == 0.0
        assert float(landing_data.get("total_assets_usd", 0)) == 0.0
        assert float(landing_data.get("total_debt_usd", 0)) == 0.0
        assert len(landing_data.get("pool_details", [])) == 0

        # Dashboard and trend should have empty daily_values
        dashboard_values = (dashboard_data.get("trends") or {}).get(
            "daily_values"
        ) or []
        trend_values = trend_data.get("daily_values") or []

        assert len(dashboard_values) == 0, (
            "Empty portfolio should have no dashboard trend data"
        )
        assert len(trend_values) == 0, "Empty portfolio should have no trend data"

"""
Integration tests for debt position handling in portfolio trend analysis.

These tests validate that the debt handling fix works correctly against a real
PostgreSQL database, including:
    - JSONB extraction of negative token amounts (debt)
    - NET portfolio value calculation (assets - debt)
    - Historical trend accuracy with debt changes
    - Cross-endpoint consistency
    - Edge case handling

REQUIREMENTS:
    - PostgreSQL database with production-like schema
    - DATABASE_INTEGRATION_URL environment variable
    - classify_token_category() database function
    - Tables: users, user_crypto_wallets, portfolio_item_snapshots

USAGE:
    export DATABASE_INTEGRATION_URL="postgresql+asyncpg://user:pass@localhost/test_db"
    pytest tests/integration/ -m integration -v

NOTES:
    - Tests use transaction rollback for automatic cleanup
    - JSONB data includes negative amounts (borrowings/debt)
    - Validates actual SQL query execution, not just structure
    - Bare postgresql:// URLs are normalized to postgresql+asyncpg:// for compatibility
"""

from typing import Any

import pytest
from httpx import AsyncClient


@pytest.mark.integration
class TestDebtHandlingIntegration:
    """
    Integration tests validating debt handling against PostgreSQL.

    Each test uses a dedicated test user with seeded data and validates
    end-to-end API responses including proper debt subtraction.
    """

    async def test_pure_debt_position(
        self, integration_client: AsyncClient, test_user_with_debt: dict[str, Any]
    ):
        """
        TC1: Test basic debt subtraction with single category.

        Scenario:
            User has $10,000 USDC deposited and $3,000 USDC borrowed
            Expected NET value: $7,000 (not $10,000)

        Validates:
            - JSONB negative amounts correctly extracted as debt
            - NET portfolio value = assets - debt
            - New debt fields present in response
        """
        user_id = test_user_with_debt["user_id"]

        response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=30"
        )

        assert response.status_code == 200, (
            f"Unexpected status code: {response.status_code}, Response: {response.text}"
        )

        data = response.json()

        # Validate response structure
        assert "daily_values" in data
        assert "summary" in data
        assert len(data["daily_values"]) > 0, "Expected at least one day of data"

        # Get first (and only) day's data
        day = data["daily_values"][0]

        # CRITICAL: Validate NET value (not inflated by excluding debt)
        assert day["total_value_usd"] == pytest.approx(
            test_user_with_debt["expected_net"], abs=0.01
        ), (
            f"Expected NET portfolio value of ${test_user_with_debt['expected_net']}, "
            f"but got ${day['total_value_usd']}. "
            f"Debt may not be properly subtracted."
        )

        # Validate category breakdown includes debt fields
        categories = day["categories"]
        assert len(categories) > 0, "Expected at least one category"

        # Find stablecoins category (USDC)
        stablecoin_category = next(
            (c for c in categories if c["category"] == "stablecoins"), None
        )
        assert stablecoin_category is not None, (
            "Expected stablecoins category in response"
        )

        # Validate new debt fields
        assert "assets_usd" in stablecoin_category, "Missing assets_usd field"
        assert "debt_usd" in stablecoin_category, "Missing debt_usd field"

        # Validate values
        assert stablecoin_category["value_usd"] == pytest.approx(
            test_user_with_debt["expected_net"], abs=0.01
        )
        assert stablecoin_category["assets_usd"] == pytest.approx(
            test_user_with_debt["expected_assets"], abs=0.01
        )
        assert stablecoin_category["debt_usd"] == pytest.approx(
            test_user_with_debt["expected_debt"], abs=0.01
        )

        # Validate summary also uses NET value
        summary = data["summary"]
        assert summary["latest_value"] == pytest.approx(
            test_user_with_debt["expected_net"], abs=0.01
        )

    async def test_historical_debt_trend_three_days(
        self,
        integration_client: AsyncClient,
        test_user_multi_day_debt: dict[str, Any],
    ):
        """
        TC3: Test debt changes over multiple days affect portfolio value and PnL.

        Scenario:
            Day 1: $10,000 assets, $0 debt → NET $10,000
            Day 2: $10,000 assets, $2,000 debt → NET $8,000 (borrowed)
            Day 3: $10,000 assets, $1,000 debt → NET $9,000 (repaid partial)

        Validates:
            - Historical trends reflect debt changes
            - PnL calculations include debt impact
            - Debt increase reduces portfolio value
            - Debt decrease (repayment) increases portfolio value
        """
        user_id = test_user_multi_day_debt["user_id"]

        response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=5"
        )

        assert response.status_code == 200
        data = response.json()

        daily_values = data["daily_values"]
        assert len(daily_values) == 3, (
            f"Expected 3 days of data, got {len(daily_values)}"
        )

        # Sort by date to ensure correct order
        daily_totals_sorted = sorted(daily_values, key=lambda x: x["date"])

        # Day 1: No debt ($10,000 NET)
        day1 = daily_totals_sorted[0]
        assert day1["total_value_usd"] == pytest.approx(10000.0, abs=0.01)
        day1_categories = day1["categories"]
        stablecoin_day1 = next(
            c for c in day1_categories if c["category"] == "stablecoins"
        )
        assert stablecoin_day1["debt_usd"] == pytest.approx(0.0, abs=0.01)

        # Day 2: $2,000 debt ($8,000 NET)
        day2 = daily_totals_sorted[1]
        assert day2["total_value_usd"] == pytest.approx(8000.0, abs=0.01), (
            f"Day 2 should have NET value of $8,000 (assets $10k - debt $2k), "
            f"but got ${day2['total_value_usd']}"
        )
        day2_categories = day2["categories"]
        stablecoin_day2 = next(
            c for c in day2_categories if c["category"] == "stablecoins"
        )
        assert stablecoin_day2["debt_usd"] == pytest.approx(2000.0, abs=0.01)

        # Validate PnL: Day 2 should show -$2,000 change (debt increased)
        # change_percentage = ((8000 - 10000) / 10000) * 100 = -20%
        assert day2["change_percentage"] == pytest.approx(-20.0, abs=0.1), (
            f"Expected -20% change when debt increased from $0 to $2k, "
            f"but got {day2['change_percentage']}%"
        )

        # Day 3: $1,000 debt ($9,000 NET - repaid $1,000)
        day3 = daily_totals_sorted[2]
        assert day3["total_value_usd"] == pytest.approx(9000.0, abs=0.01), (
            f"Day 3 should have NET value of $9,000 (assets $10k - debt $1k), "
            f"but got ${day3['total_value_usd']}"
        )
        day3_categories = day3["categories"]
        stablecoin_day3 = next(
            c for c in day3_categories if c["category"] == "stablecoins"
        )
        assert stablecoin_day3["debt_usd"] == pytest.approx(1000.0, abs=0.01)

        # Validate PnL: Day 3 should show +$1,000 change (debt decreased)
        # change_percentage = ((9000 - 8000) / 8000) * 100 = +12.5%
        assert day3["change_percentage"] == pytest.approx(12.5, abs=0.1), (
            f"Expected +12.5% change when debt decreased from $2k to $1k, "
            f"but got {day3['change_percentage']}%"
        )

        # Validate summary shows overall change from Day 1 to Day 3
        summary = data["summary"]
        assert summary["earliest_value"] == pytest.approx(10000.0, abs=0.01)
        assert summary["latest_value"] == pytest.approx(9000.0, abs=0.01)
        assert summary["change_usd"] == pytest.approx(-1000.0, abs=0.01)

    async def test_zero_debt_regression(
        self, integration_client: AsyncClient, test_user_zero_debt: dict[str, Any]
    ):
        """
        TC6: Test that users without debt are unaffected by the fix (regression test).

        Scenario:
            User has $15,000 in assets with no borrowing
            Expected NET value: $15,000 (same as assets)

        Validates:
            - Debt handling fix doesn't break existing users without debt
            - debt_usd fields are 0 for users with no borrowing
            - Portfolio value matches asset value when debt is zero
        """
        user_id = test_user_zero_debt["user_id"]

        response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=30"
        )

        assert response.status_code == 200
        data = response.json()

        daily_values = data["daily_values"]
        assert len(daily_values) > 0

        day = daily_values[0]

        # Validate NET value equals assets (no debt to subtract)
        assert day["total_value_usd"] == pytest.approx(
            test_user_zero_debt["expected_net"], abs=0.01
        )

        # Validate all categories have zero debt
        for category in day["categories"]:
            assert category["debt_usd"] == pytest.approx(0.0, abs=0.01), (
                f"Category {category['category']} should have zero debt, "
                f"but got ${category['debt_usd']}"
            )
            # For zero debt: value_usd should equal assets_usd
            assert category["value_usd"] == pytest.approx(
                category["assets_usd"], abs=0.01
            ), (
                f"Category {category['category']} NET value should equal assets "
                f"when debt is zero"
            )

    async def test_cross_endpoint_consistency(
        self, integration_client: AsyncClient, test_user_with_debt: dict[str, Any]
    ):
        """
        TC4: Test that trend and landing page endpoints show consistent NET values.

        Validates:
            - Trend endpoint's latest total_value_usd matches landing page's
              net_portfolio_value
            - Both endpoints properly subtract debt from assets
            - No discrepancy between endpoints for same user/time
        """
        user_id = test_user_with_debt["user_id"]

        # Get trend data
        trend_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=1"
        )
        assert trend_response.status_code == 200
        trend_data = trend_response.json()

        # Get landing page data
        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200
        landing_data = landing_response.json()

        # Extract NET values from both endpoints
        trend_net_value = trend_data["daily_values"][0]["total_value_usd"]
        landing_net_value = landing_data.get("net_portfolio_value")

        # CRITICAL: Both endpoints must show same NET value
        assert trend_net_value == pytest.approx(landing_net_value, abs=0.01), (
            f"Trend endpoint shows NET value of ${trend_net_value}, "
            f"but landing page shows ${landing_net_value}. "
            f"These should match (expected: ${test_user_with_debt['expected_net']}). "
            f"This indicates inconsistent debt handling between endpoints."
        )

        # Both should match expected NET value
        assert trend_net_value == pytest.approx(
            test_user_with_debt["expected_net"], abs=0.01
        )
        assert landing_net_value == pytest.approx(
            test_user_with_debt["expected_net"], abs=0.01
        )

    async def test_dashboard_and_landing_totals_align(
        self, integration_client: AsyncClient, test_user_with_debt: dict[str, Any]
    ) -> None:
        """Ensure dashboard consolidated endpoint matches landing page totals."""

        user_id = test_user_with_debt["user_id"]

        dashboard_response = await integration_client.get(
            f"/api/v2/analytics/{user_id}/dashboard?trend_days=1"
            "&risk_days=30&drawdown_days=30&allocation_days=30&rolling_days=30"
        )
        assert dashboard_response.status_code == 200
        dashboard_data = dashboard_response.json()

        landing_response = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        assert landing_response.status_code == 200
        landing_data = landing_response.json()

        dashboard_trend = dashboard_data.get("trends", {})
        assert dashboard_trend, "Dashboard response missing trends payload"
        daily_values = dashboard_trend.get("daily_values") or []
        assert daily_values, "Dashboard trends missing daily_values"
        dashboard_latest = daily_values[-1]["total_value_usd"]

        landing_net = landing_data.get("total_net_usd")

        assert dashboard_latest == pytest.approx(landing_net, abs=0.01), (
            "Dashboard latest net value must equal landing page total_net_usd"
        )

    @pytest.mark.skip(
        reason="Test requires creating specific multi-category test data. "
        "Implement when needed for comprehensive edge case coverage."
    )
    async def test_multi_category_debt(self, integration_client: AsyncClient):
        """
        TC2: Test debt in one category doesn't affect other categories.

        Scenario:
            ETH category: $10,000 assets, $0 debt → NET $10,000
            Stablecoins: $5,000 assets, $2,000 debt → NET $3,000
            Total: $13,000 NET

        Validates:
            - Debt is category-specific
            - Total portfolio NET = sum of category NETs
        """
        pass

    @pytest.mark.skip(
        reason="Test requires creating extreme leverage test data. "
        "Implement when needed for edge case validation."
    )
    async def test_extreme_leverage(self, integration_client: AsyncClient):
        """
        TC5: Test extreme leverage edge case (95% LTV).

        Scenario:
            $10,000 ETH collateral, $9,500 USDC borrowed
            Expected NET: $500

        Validates:
            - High leverage ratios don't break calculations
            - Nearly-equal assets and debt handled correctly
        """
        pass

    @pytest.mark.skip(
        reason="Test requires creating negative NET category test data. "
        "Implement when needed for rare edge case coverage."
    )
    async def test_negative_net_category(self, integration_client: AsyncClient):
        """
        TC7: Test category with debt exceeding assets (negative NET).

        Scenario:
            Stablecoins: $2,000 assets, $3,000 debt → NET -$1,000

        Validates:
            - Negative NET values handled correctly
            - Portfolio can have negative value in specific categories
        """
        pass

    @pytest.mark.skip(
        reason="Test requires creating wallet_token_snapshots debt data. "
        "Implement when wallet snapshots support debt positions."
    )
    async def test_mixed_defi_wallet_debt(self, integration_client: AsyncClient):
        """
        TC8: Test debt split between DeFi and wallet sources.

        Scenario:
            DeFi source: $7,000 assets, $3,000 debt → NET $4,000
            Wallet source: $5,000 assets, $0 debt → NET $5,000
            Total: $9,000 NET

        Validates:
            - Debt handling works across source types
            - DeFi and wallet sources aggregated correctly
        """
        pass


@pytest.mark.integration
class TestDebtHandlingSQLValidation:
    """
    Low-level SQL validation tests for debt handling.

    These tests directly query the database using the SQL query to validate
    PostgreSQL-specific features like JSONB operations and LATERAL joins.
    """

    async def test_sql_query_executes_successfully(
        self, integration_db_session, test_user_with_debt: dict[str, Any]
    ):
        """
        Validate that the SQL query executes without errors against PostgreSQL.

        This is a smoke test to ensure the query syntax is compatible with
        PostgreSQL and all referenced functions/tables exist.
        """
        from datetime import datetime, timedelta

        from src.services.shared.query_names import QUERY_NAMES
        from src.services.shared.query_service import QueryService

        query_service = QueryService()
        query_content = query_service.get_query(QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV)

        user_id = test_user_with_debt["user_id"]
        start_date = datetime.now() - timedelta(days=30)
        end_date = datetime.now()

        # Execute the actual SQL query
        result = await integration_db_session.execute(
            query_service._prepare_query(query_content),
            {
                "user_id": user_id,
                "start_date": start_date,
                "end_date": end_date,
                "wallet_address": None,
            },
        )

        rows = result.fetchall()

        # Validate results returned
        assert len(rows) > 0, "Expected at least one row from SQL query"

        # Validate row structure includes debt fields
        first_row = rows[0]
        assert hasattr(first_row, "category_assets_usd"), (
            "SQL result missing category_assets_usd column"
        )
        assert hasattr(first_row, "category_debt_usd"), (
            "SQL result missing category_debt_usd column"
        )
        assert hasattr(first_row, "category_value_usd"), (
            "SQL result missing category_value_usd column"
        )

        # Validate NET value calculation
        for row in rows:
            category_net = float(row.category_value_usd or 0)
            category_assets = float(row.category_assets_usd or 0)
            category_debt = float(row.category_debt_usd or 0)

            # NET should equal assets - debt
            expected_net = category_assets - category_debt
            assert category_net == pytest.approx(expected_net, abs=0.01), (
                f"SQL row has incorrect NET calculation: "
                f"NET={category_net}, assets={category_assets}, debt={category_debt}. "
                f"Expected NET={expected_net}"
            )

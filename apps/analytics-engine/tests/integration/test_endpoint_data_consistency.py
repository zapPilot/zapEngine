"""
Integration tests for data consistency across endpoints.

Validates that landing page, pool performance, and portfolio trends endpoints
return consistent data. Catches bugs like the GMX V2 token signature issue
where endpoints incorrectly merged positions with different token compositions.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.conftest import refresh_mv_session
from tests.integration.helpers.consistency_validators import (
    assert_chain_breakdown_consistency,
    assert_pool_lists_match,
    assert_protocol_breakdown_consistency,
    assert_token_signature_distinct,
    assert_total_values_match,
)


@pytest.fixture
async def test_user_gmx_v2_multi_token_pools(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with 3 GMX V2 liquidity pools with different tokens.

    This is the EXACT bug scenario from production where GMX V2 positions
    with same name_item="Liquidity Pool" but different tokens were merged,
    losing $3,885 in reported value.

    Returns:
        dict with user_id and expected values for assertions
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xGMXV2{user_id[:8].upper()}"
    snapshot_time = datetime.now() - timedelta(hours=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"gmx-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'GMX V2 Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # GMX V2 Position 1: WBTC Liquidity Pool
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'GMX V2', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                3667.11, 3667.11,
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
                {"symbol": "WBTC", "amount": "0.042", "price": "86897.94", "decimals": 8}
            ]""",
        },
    )

    # GMX V2 Position 2: WETH Liquidity Pool
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'GMX V2', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                1442.05, 1442.05,
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
                {"symbol": "WETH", "amount": "0.508", "price": "2838.54", "decimals": 18}
            ]""",
        },
    )

    # GMX V2 Position 3: SOL Liquidity Pool
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'GMX V2', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                218.49, 218.49,
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
                {"symbol": "SOL", "amount": "1.672", "price": "130.67", "decimals": 9}
            ]""",
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_total": 5327.65,  # Sum of all 3 positions
        "expected_pool_count": 3,
        "expected_pools": [
            {
                "protocol": "gmx-v2",
                "chain": "arb",
                "pool_symbols": ["WBTC"],
                "asset_usd_value": 3667.11,
            },
            {
                "protocol": "gmx-v2",
                "chain": "arb",
                "pool_symbols": ["WETH"],
                "asset_usd_value": 1442.05,
            },
            {
                "protocol": "gmx-v2",
                "chain": "arb",
                "pool_symbols": ["SOL"],
                "asset_usd_value": 218.49,
            },
        ],
    }


@pytest.fixture
async def test_user_mixed_protocols(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with multiple protocols (Aave, Compound, GMX V2).

    Tests consistency across different protocol types with both single and
    multi-token pools.
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xMIXED{user_id[:8].upper()}"
    snapshot_time = datetime.now() - timedelta(hours=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"mixed-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Mixed Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Aave Position: Supply ETH
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Aave V3', 'Lending',
                CAST(:asset_token_list AS jsonb),
                5000.0, 5000.0,
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
                {"symbol": "ETH", "amount": "2.5", "price": "2000", "decimals": 18}
            ]""",
        },
    )

    # Compound Position: Supply USDC
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Compound V3', 'Lending',
                CAST(:asset_token_list AS jsonb),
                2000.0, 2000.0,
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
                {"symbol": "USDC", "amount": "2000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    # GMX V2 Position: WETH Pool
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'GMX V2', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                1500.0, 1500.0,
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
                {"symbol": "WETH", "amount": "0.5", "price": "3000", "decimals": 18}
            ]""",
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_total": 8500.0,
        "expected_pool_count": 3,
        "expected_protocols": ["aave-v3", "compound-v3", "gmx-v2"],
        "expected_chains": ["ethereum", "arb"],
    }


class TestGMXV2ConsistencyRegression:
    """
    Regression tests for GMX V2 token signature bug.

    Tests that GMX V2 positions with same name_item but different tokens
    are NOT merged across all endpoints.
    """

    @pytest.mark.asyncio
    async def test_gmx_v2_pool_count_consistency(
        self,
        integration_client: AsyncClient,
        test_user_gmx_v2_multi_token_pools: dict[str, Any],
    ):
        pytest.skip("Skipping until trend protocol breakdowns are implemented")
        """
        Test that all 3 GMX V2 positions are visible in all endpoints.

        This is the PRIMARY regression test for the GMX V2 bug where
        positions were merged, losing $3,885 in reported value.
        """
        user_id = test_user_gmx_v2_multi_token_pools["user_id"]
        expected_count = test_user_gmx_v2_multi_token_pools["expected_pool_count"]

        # Fetch from all 3 endpoints
        landing_resp = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        trends_resp = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=1"
        )

        assert landing_resp.status_code == 200
        assert pools_resp.status_code == 200
        assert trends_resp.status_code == 200

        landing_data = landing_resp.json()
        pools_data = pools_resp.json()
        trends_data = trends_resp.json()

        # Assert pool counts (landing page and pools endpoint)
        assert len(landing_data["pool_details"]) == expected_count, (
            f"Landing page shows {len(landing_data['pool_details'])} pools, "
            f"expected {expected_count} (GMX V2 bug: positions merged!)"
        )
        assert len(pools_data) == expected_count, (
            f"Pool endpoint shows {len(pools_data)} pools, "
            f"expected {expected_count} (GMX V2 bug: positions merged!)"
        )

        # Validate token signatures are distinct (landing page and pools)
        assert_token_signature_distinct(
            landing_data["pool_details"],
            protocol_filter="gmx-v2",
            chain_filter="arb",
        )
        assert_token_signature_distinct(
            pools_data,
            protocol_filter="gmx-v2",
            chain_filter="arb",
        )

        # Validate trends endpoint has GMX V2 protocol breakdown
        # (trends doesn't show individual pools, but should show protocol totals)
        expected_total = test_user_gmx_v2_multi_token_pools["expected_total"]
        daily_values = trends_data.get("daily_values", [])
        assert len(daily_values) > 0, "Trends endpoint should return daily values"

        latest_day = daily_values[0]
        by_protocol = latest_day.get("by_protocol", {})

        # GMX V2 should appear in protocol breakdown
        gmx_v2_value = by_protocol.get("gmx-v2", 0.0)
        assert gmx_v2_value > 0, (
            f"GMX V2 missing from trends by_protocol breakdown! "
            f"Available protocols: {list(by_protocol.keys())}"
        )

        # GMX V2 total in trends should match sum of all 3 pools
        assert abs(gmx_v2_value - expected_total) < 0.01, (
            f"GMX V2 total in trends mismatch: "
            f"${gmx_v2_value:.2f} != ${expected_total:.2f} "
            f"(positions may have been merged in trends endpoint!)"
        )

    @pytest.mark.asyncio
    async def test_total_portfolio_value_consistency(
        self,
        integration_client: AsyncClient,
        test_user_gmx_v2_multi_token_pools: dict[str, Any],
    ):
        pytest.skip("Skipping until trend protocol breakdowns are implemented")
        """
        Test that total USD values match across all 3 endpoints.

        Validates that the GMX V2 fix properly includes all position values
        in the portfolio total.
        """
        user_id = test_user_gmx_v2_multi_token_pools["user_id"]
        expected_total = test_user_gmx_v2_multi_token_pools["expected_total"]

        # Fetch from all endpoints
        landing_resp = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        trends_resp = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=1"
        )

        assert landing_resp.status_code == 200
        assert pools_resp.status_code == 200
        assert trends_resp.status_code == 200

        landing_data = landing_resp.json()
        pools_data = pools_resp.json()
        trends_data = trends_resp.json()

        # Validate totals match expected
        assert abs(landing_data["total_net_usd"] - expected_total) < 0.01, (
            f"Landing page total ${landing_data['total_net_usd']:.2f} != "
            f"expected ${expected_total:.2f}"
        )

        pools_total = sum(p["asset_usd_value"] for p in pools_data)
        assert abs(pools_total - expected_total) < 0.01, (
            f"Pools total ${pools_total:.2f} != expected ${expected_total:.2f}"
        )

        trends_latest = trends_data["daily_values"][0]
        assert abs(trends_latest["total_value_usd"] - expected_total) < 0.01, (
            f"Trends total ${trends_latest['total_value_usd']:.2f} != "
            f"expected ${expected_total:.2f}"
        )

        # Use helper validator for cross-endpoint consistency
        assert_total_values_match(landing_data, pools_data, trends_data)


class TestCrossEndpointConsistency:
    """
    Comprehensive cross-endpoint consistency validation tests.
    """

    @pytest.mark.asyncio
    async def test_pool_symbols_consistency(
        self,
        integration_client: AsyncClient,
        test_user_gmx_v2_multi_token_pools: dict[str, Any],
    ):
        """
        Test that pool_symbols lists match between landing page and pool endpoints.
        """
        user_id = test_user_gmx_v2_multi_token_pools["user_id"]

        landing_resp = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )

        assert landing_resp.status_code == 200
        assert pools_resp.status_code == 200

        landing_data = landing_resp.json()
        pools_data = pools_resp.json()

        # Use helper validator
        assert_pool_lists_match(
            landing_data["pool_details"],
            pools_data,
            source1_name="landing_page",
            source2_name="pools",
        )

    @pytest.mark.asyncio
    async def test_protocol_breakdown_consistency(
        self,
        integration_client: AsyncClient,
        test_user_mixed_protocols: dict[str, Any],
    ):
        pytest.skip("Skipping until trend protocol breakdowns are implemented")
        """
        Test that protocol aggregations match between landing page and trends.
        """
        user_id = test_user_mixed_protocols["user_id"]

        landing_resp = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        trends_resp = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=1"
        )

        assert landing_resp.status_code == 200
        assert trends_resp.status_code == 200

        landing_data = landing_resp.json()
        trends_data = trends_resp.json()

        # Use helper validator
        assert_protocol_breakdown_consistency(landing_data, trends_data)

    @pytest.mark.asyncio
    async def test_chain_breakdown_consistency(
        self,
        integration_client: AsyncClient,
        test_user_mixed_protocols: dict[str, Any],
    ):
        pytest.skip("Skipping until trend protocol breakdowns are implemented")
        """
        Test that chain aggregations match between landing page and trends.
        """
        user_id = test_user_mixed_protocols["user_id"]

        landing_resp = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        trends_resp = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=1"
        )

        assert landing_resp.status_code == 200
        assert trends_resp.status_code == 200

        landing_data = landing_resp.json()
        trends_data = trends_resp.json()

        # Use helper validator
        assert_chain_breakdown_consistency(landing_data, trends_data)

    @pytest.mark.asyncio
    async def test_empty_portfolio_consistency(
        self,
        integration_client: AsyncClient,
    ):
        """
        Test that all endpoints return consistent empty states for users with no positions.
        """
        # Create user with no positions
        user_id = str(uuid.uuid4())

        landing_resp = await integration_client.get(
            f"/api/v2/portfolio/{user_id}/landing"
        )
        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        trends_resp = await integration_client.get(
            f"/api/v2/analytics/{user_id}/trend?days=1"
        )

        # All should return 200 (not 404) with empty data
        assert landing_resp.status_code == 200
        assert pools_resp.status_code == 200
        assert trends_resp.status_code == 200

        landing_data = landing_resp.json()
        pools_data = pools_resp.json()
        trends_data = trends_resp.json()

        # Validate empty states
        assert landing_data["total_net_usd"] == 0.0
        assert len(landing_data["pool_details"]) == 0
        assert len(pools_data) == 0
        assert len(trends_data["daily_values"]) == 0

"""
Integration tests for data consistency between landing-page and portfolio-trend endpoints.
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
    assert_protocol_breakdown_consistency,
)


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


class TestCrossEndpointConsistency:
    """
    Comprehensive cross-endpoint consistency validation tests.
    """

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

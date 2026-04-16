"""
Token Signature Regression Tests

Comprehensive regression tests for token signature-based deduplication logic.
Ensures positions with different token compositions are never merged.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.conftest import refresh_mv_session


@pytest.fixture
async def test_user_token_order_independence(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create positions with same tokens in different order.

    Tests that [WETH, USDC] and [USDC, WETH] are treated as the SAME position
    (token_signature is order-independent: sorted alphabetically).
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xORDER{user_id[:8].upper()}"

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"order-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Order Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Position 1: [WETH, USDC] at time T
    time_1 = datetime.now() - timedelta(hours=2)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Uniswap V3', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                5000.0, 5000.0,
                'dex', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": time_1,
            "asset_token_list": """[
                {"symbol": "WETH", "amount": "1.0", "price": "3000", "decimals": 18},
                {"symbol": "USDC", "amount": "2000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    # Position 2: [USDC, WETH] at time T+1 (more recent)
    time_2 = datetime.now() - timedelta(hours=1)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Uniswap V3', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                5500.0, 5500.0,
                'dex', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": time_2,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "2500", "price": "1.0", "decimals": 6},
                {"symbol": "WETH", "amount": "1.0", "price": "3000", "decimals": 18}
            ]""",
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_pool_count": 1,  # Should be deduplicated to most recent
        "expected_value": 5500.0,  # More recent snapshot value
        "expected_pool_symbols": ["USDC", "WETH"],  # Sorted
    }


@pytest.fixture
async def test_user_single_vs_multi_token(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create positions with same name_item but different token counts.

    Tests that single-token and multi-token pools with same name_item
    are kept SEPARATE (different token_signatures).
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xCOUNT{user_id[:8].upper()}"
    snapshot_time = datetime.now() - timedelta(hours=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"count-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Count Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Position 1: Single-token pool (WETH)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Curve', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                3000.0, 3000.0,
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

    # Position 2: Multi-token pool (WETH, USDC)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Curve', 'Liquidity Pool',
                CAST(:asset_token_list AS jsonb),
                5000.0, 5000.0,
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
                {"symbol": "WETH", "amount": "1.0", "price": "3000", "decimals": 18},
                {"symbol": "USDC", "amount": "2000", "price": "1.0", "decimals": 6}
            ]""",
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_pool_count": 2,  # Should NOT be merged
        "expected_total": 8000.0,
        "expected_pools": [
            {"pool_symbols": ["WETH"], "asset_usd_value": 3000.0},
            {"pool_symbols": ["USDC", "WETH"], "asset_usd_value": 5000.0},
        ],
    }


@pytest.fixture
async def test_user_empty_and_null_tokens(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create positions with empty and NULL token lists.

    Tests edge cases for token_signature generation.
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet_address = f"0xEMPTY{user_id[:8].upper()}"
    snapshot_time = datetime.now() - timedelta(hours=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"empty-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Empty Test Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
    )

    # Position 1: Empty token list
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Protocol X', 'Position',
                '[]'::jsonb,
                1000.0, 1000.0,
                'other', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": snapshot_time,
        },
    )

    # Position 2: NULL token list (testing SQL COALESCE)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio, created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'Protocol Y', 'Position',
                NULL,
                500.0, 500.0,
                'other', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet_address,
            "snapshot_at": snapshot_time,
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet_address,
        "expected_pool_count": 2,  # Different protocols, so kept separate
        "expected_total": 1500.0,
    }


class TestTokenSignatureRegression:
    """
    Regression tests for token signature deduplication logic.
    """

    @pytest.mark.asyncio
    async def test_gmx_v2_wbtc_weth_sol_not_merged(
        self,
        integration_client: AsyncClient,
        integration_db_session: AsyncSession,
    ):
        """
        Test the EXACT GMX V2 bug scenario: 3 pools with different tokens not merged.

        This is the production bug that lost $3,885: GMX V2 positions with
        same name_item="Liquidity Pool" but different tokens (WBTC, WETH, SOL)
        were incorrectly merged into a single position.
        """
        user_id = str(uuid.uuid4())
        wallet_id = str(uuid.uuid4())
        wallet_address = f"0xGMX{user_id[:8].upper()}"
        snapshot_time = datetime.now() - timedelta(hours=1)

        # Create user
        await integration_db_session.execute(
            text(
                """
                INSERT INTO users (id, email, is_active, created_at, updated_at)
                VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"user_id": user_id, "email": f"gmx-exact-{user_id}@example.com"},
        )

        # Create wallet
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, 'GMX Exact Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet_address},
        )

        # Create 3 GMX V2 positions (exact production data)
        positions = [
            ("WBTC", "0.042", "86897.94", 3667.11),
            ("WETH", "0.508", "2838.54", 1442.05),
            ("SOL", "1.672", "130.67", 218.49),
        ]

        for symbol, amount, price, usd_value in positions:
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
                        :usd_value, :usd_value,
                        'dex', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                """
                ),
                {
                    "snapshot_id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "wallet": wallet_address,
                    "snapshot_at": snapshot_time,
                    "asset_token_list": f"""[
                        {{"symbol": "{symbol}", "amount": "{amount}", "price": "{price}", "decimals": 18}}
                    ]""",
                    "usd_value": usd_value,
                },
            )

        await integration_db_session.commit()
        await refresh_mv_session(integration_db_session)

        # Fetch from pool endpoint
        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        assert pools_resp.status_code == 200
        pools_data = pools_resp.json()

        # CRITICAL ASSERTION: Must have exactly 3 pools
        assert len(pools_data) == 3, (
            f"GMX V2 bug regression! Expected 3 pools, got {len(pools_data)}. "
            f"Positions were merged (losing $3,885)!"
        )

        # Validate pool symbols are distinct
        pool_symbols = [tuple(sorted(p["pool_symbols"])) for p in pools_data]
        assert len(set(pool_symbols)) == 3, (
            f"GMX V2 token signatures not distinct: {pool_symbols}"
        )

        # Validate total value
        total = sum(p["asset_usd_value"] for p in pools_data)
        expected_total = 5327.65
        assert abs(total - expected_total) < 0.01, (
            f"GMX V2 total value mismatch: ${total:.2f} != ${expected_total:.2f}"
        )

    @pytest.mark.asyncio
    async def test_token_order_independence(
        self,
        integration_client: AsyncClient,
        test_user_token_order_independence: dict[str, Any],
    ):
        """
        Test that [WETH, USDC] and [USDC, WETH] are treated as same position.

        Token_signature is order-independent (sorted alphabetically), so positions
        with same tokens in different order should be deduplicated to most recent.
        """
        user_id = test_user_token_order_independence["user_id"]
        expected_count = test_user_token_order_independence["expected_pool_count"]
        expected_value = test_user_token_order_independence["expected_value"]

        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        assert pools_resp.status_code == 200
        pools_data = pools_resp.json()

        # Should have only 1 position (deduplicated)
        assert len(pools_data) == expected_count, (
            f"Token order independence failed: expected {expected_count} pool, "
            f"got {len(pools_data)} pools"
        )

        # Should have most recent value
        assert abs(pools_data[0]["asset_usd_value"] - expected_value) < 0.01

        # Pool symbols should be sorted
        assert pools_data[0]["pool_symbols"] == ["USDC", "WETH"]

    @pytest.mark.asyncio
    async def test_single_vs_multi_token_pools_distinct(
        self,
        integration_client: AsyncClient,
        test_user_single_vs_multi_token: dict[str, Any],
    ):
        """
        Test that single-token and multi-token pools with same name_item stay separate.

        WETH-only pool and WETH+USDC pool should NOT be merged even with same name_item.
        """
        user_id = test_user_single_vs_multi_token["user_id"]
        expected_count = test_user_single_vs_multi_token["expected_pool_count"]
        expected_total = test_user_single_vs_multi_token["expected_total"]

        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        assert pools_resp.status_code == 200
        pools_data = pools_resp.json()

        # Should have 2 separate pools
        assert len(pools_data) == expected_count, (
            f"Single vs multi-token merge bug: expected {expected_count} pools, "
            f"got {len(pools_data)} pools"
        )

        # Validate total
        total = sum(p["asset_usd_value"] for p in pools_data)
        assert abs(total - expected_total) < 0.01

        # Validate pool symbols are different
        pool_symbols = [tuple(sorted(p["pool_symbols"])) for p in pools_data]
        assert ("WETH",) in pool_symbols
        assert ("USDC", "WETH") in pool_symbols

    @pytest.mark.asyncio
    async def test_empty_and_null_token_lists_handled(
        self,
        integration_client: AsyncClient,
        test_user_empty_and_null_tokens: dict[str, Any],
    ):
        """
        Test that empty and NULL token lists don't cause errors.

        Edge case handling: positions with no tokens should work correctly.
        """
        user_id = test_user_empty_and_null_tokens["user_id"]
        expected_count = test_user_empty_and_null_tokens["expected_pool_count"]
        expected_total = test_user_empty_and_null_tokens["expected_total"]

        pools_resp = await integration_client.get(
            f"/api/v2/pools/{user_id}/performance"
        )
        assert pools_resp.status_code == 200
        pools_data = pools_resp.json()

        # Should handle empty/NULL gracefully
        assert len(pools_data) == expected_count

        # Validate total
        total = sum(p["asset_usd_value"] for p in pools_data)
        assert abs(total - expected_total) < 0.01

        # Both positions should have empty pool_symbols list
        for pool in pools_data:
            assert isinstance(pool["pool_symbols"], list)

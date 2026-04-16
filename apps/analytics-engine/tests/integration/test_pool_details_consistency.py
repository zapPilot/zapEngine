"""
Integration test for pool_details consistency between endpoints.

Tests that the /pools/performance and /landing-page/portfolio endpoints
return identical pool_details data structures and values.
"""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.conftest import refresh_mv_session


@pytest.fixture
async def test_user_with_pools(integration_db_session: AsyncSession) -> dict[str, Any]:
    """
    Create test user with multiple pool positions across different protocols.

    Creates a realistic portfolio with:
    - Multiple pools on different chains
    - Different protocols (Aave, Compound, Hyperliquid)
    - APR data from DeFiLlama and Hyperliquid sources
    """
    user_id = str(uuid.uuid4())
    wallet_address = f"0x{''.join(str(uuid.uuid4()).replace('-', '')[:40])}"

    # Insert user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, created_at, updated_at)
            VALUES (:user_id, :now, :now)
            """
        ),
        {"user_id": user_id, "now": datetime.now(UTC)},
    )

    # Insert wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (user_id, wallet, created_at, updated_at)
            VALUES (:user_id, :wallet, :now, :now)
            """
        ),
        {"user_id": user_id, "wallet": wallet_address, "now": datetime.now(UTC)},
    )

    # Insert portfolio snapshots for different pools
    snapshot_time = datetime.now(UTC)
    snapshots = [
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Ethereum",
            "name": "Aave V3",
            "name_item": "USDC Supply",
            "asset_usd_value": 10000.0,
            "net_usd_value": 10000.0,
            "asset_token_list": [{"symbol": "USDC", "amount": "10000", "price": "1.0"}],
        },
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Ethereum",
            "name": "Aave V3",
            "name_item": "WETH Supply",
            "asset_usd_value": 5000.0,
            "net_usd_value": 5000.0,
            "asset_token_list": [
                {"symbol": "WETH", "amount": "2.0", "price": "2500.0"}
            ],
        },
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Polygon",
            "name": "Compound V3",
            "name_item": "USDT Supply",
            "asset_usd_value": 3000.0,
            "net_usd_value": 3000.0,
            "asset_token_list": [{"symbol": "USDT", "amount": "3000", "price": "1.0"}],
        },
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Arbitrum",
            "name": "Hyperliquid",
            "name_item": "HLP Vault",
            "asset_usd_value": 7500.0,
            "net_usd_value": 7500.0,
            "asset_token_list": [],
            "detail": {"hlp_balance": "7500.0"},
        },
    ]

    for snapshot in snapshots:
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, chain, name, name_item,
                    asset_usd_value, net_usd_value, asset_token_list,
                    detail, snapshot_at
                )
                VALUES (
                    :id, :wallet, :chain, :name, :name_item,
                    :asset_usd_value, :net_usd_value, CAST(:asset_token_list AS jsonb),
                    CAST(:detail AS jsonb), :snapshot_at
                )
                """
            ),
            {
                **snapshot,
                "asset_token_list": json.dumps(snapshot.get("asset_token_list", [])),
                "detail": json.dumps(snapshot.get("detail", {})),
                "snapshot_at": snapshot_time,
            },
        )

    # Insert APR data for DeFiLlama
    await integration_db_session.execute(
        text(
            """
            INSERT INTO alpha_raw.pool_apr_snapshots (
                pool_address, protocol, chain, symbol, apr, apr_base, apr_reward,
                snapshot_time, source
            )
            VALUES
                ('0xaave_usdc', 'Aave V3', 'Ethereum', 'USDC', 5.5, 4.0, 1.5, :now, 'defillama'),
                ('0xaave_weth', 'Aave V3', 'Ethereum', 'WETH', 3.2, 2.5, 0.7, :now, 'defillama'),
                ('0xcompound_usdt', 'Compound V3', 'Polygon', 'USDT', 4.8, 4.8, 0.0, :now, 'defillama')
            """
        ),
        {"now": snapshot_time},
    )

    # Insert APR data for Hyperliquid
    await integration_db_session.execute(
        text(
            """
            INSERT INTO alpha_raw.hyperliquid_vault_apr_snapshots (
                vault_address, vault_name, apr, apr_base, apr_reward,
                snapshot_time, source
            )
            VALUES ('0xhlp_vault', 'HLP Vault', 12.5, 12.5, 0.0, :now, 'hyperliquid_api')
            """
        ),
        {"now": snapshot_time},
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet_address": wallet_address,
        "snapshot_count": len(snapshots),
        "total_value": sum(s["asset_usd_value"] for s in snapshots),
    }


@pytest.mark.asyncio
async def test_pool_details_consistency(
    integration_client: AsyncClient, test_user_with_pools: dict[str, Any]
):
    """
    Test that both endpoints return identical pool_details data.

    Verifies:
    - Same number of pools
    - Same pool identifiers (protocol, chain, symbols)
    - Same USD values
    - Same APR data
    - Same structure/fields
    """
    user_id = test_user_with_pools["user_id"]

    # Fetch from both endpoints
    pools_response = await integration_client.get(
        f"/api/v2/pools/{user_id}/performance"
    )
    landing_response = await integration_client.get(
        f"/api/v2/portfolio/{user_id}/landing"
    )

    assert pools_response.status_code == 200, (
        f"Pools endpoint failed: {pools_response.text}"
    )
    assert landing_response.status_code == 200, (
        f"Landing page endpoint failed: {landing_response.text}"
    )

    pools_data = pools_response.json()
    landing_data = landing_response.json()
    landing_pool_details = landing_data.get("pool_details", [])

    # Verify both are lists
    assert isinstance(pools_data, list), "Pools endpoint should return a list"
    assert isinstance(landing_pool_details, list), (
        "Landing page pool_details should be a list"
    )

    # Verify same number of pools
    assert len(pools_data) == len(landing_pool_details), (
        f"Pool count mismatch: pools endpoint has {len(pools_data)}, "
        f"landing page has {len(landing_pool_details)}"
    )

    # Sort both lists by protocol+chain+symbols for comparison
    def sort_key(pool: dict) -> str:
        symbols = pool.get("pool_symbols", [])
        symbols_str = ",".join(sorted(symbols))
        return f"{pool.get('protocol', '')}_{pool.get('chain', '')}_{symbols_str}"

    pools_sorted = sorted(pools_data, key=sort_key)
    landing_sorted = sorted(landing_pool_details, key=sort_key)

    # Compare each pool
    for i, (pool, landing_pool) in enumerate(
        zip(pools_sorted, landing_sorted, strict=False)
    ):
        pool_id = sort_key(pool)

        # Verify protocol and chain match
        assert pool.get("protocol") == landing_pool.get("protocol"), (
            f"Pool {i} ({pool_id}): protocol mismatch"
        )
        assert pool.get("chain") == landing_pool.get("chain"), (
            f"Pool {i} ({pool_id}): chain mismatch"
        )

        # Verify pool symbols match
        assert sorted(pool.get("pool_symbols", [])) == sorted(
            landing_pool.get("pool_symbols", [])
        ), f"Pool {i} ({pool_id}): pool_symbols mismatch"

        # Verify USD values match (within 0.01 tolerance for floating point)
        pool_value = float(pool.get("asset_usd_value", 0))
        landing_value = float(landing_pool.get("asset_usd_value", 0))
        assert abs(pool_value - landing_value) < 0.01, (
            f"Pool {i} ({pool_id}): asset_usd_value mismatch - "
            f"pools: {pool_value}, landing: {landing_value}"
        )

        # Verify contribution percentages match
        pool_contrib = float(pool.get("contribution_to_portfolio", 0))
        landing_contrib = float(landing_pool.get("contribution_to_portfolio", 0))
        assert abs(pool_contrib - landing_contrib) < 0.01, (
            f"Pool {i} ({pool_id}): contribution_to_portfolio mismatch - "
            f"pools: {pool_contrib}, landing: {landing_contrib}"
        )


@pytest.mark.asyncio
async def test_pool_details_structure_matches(
    integration_client: AsyncClient, test_user_with_pools: dict[str, Any]
):
    """
    Test that both endpoints return the same field structure.

    Verifies all required fields are present in both responses.
    """
    user_id = test_user_with_pools["user_id"]

    pools_response = await integration_client.get(
        f"/api/v2/pools/{user_id}/performance"
    )
    landing_response = await integration_client.get(
        f"/api/v2/portfolio/{user_id}/landing"
    )

    pools_data = pools_response.json()
    landing_pool_details = landing_response.json().get("pool_details", [])

    required_fields = {
        "wallet",
        "snapshot_id",
        "chain",
        "protocol",
        "protocol_name",
        "asset_usd_value",
        "pool_symbols",
        "contribution_to_portfolio",
    }

    # Check fields in pools endpoint
    if pools_data:
        pool_fields = set(pools_data[0].keys())
        assert required_fields.issubset(pool_fields), (
            f"Pools endpoint missing fields: {required_fields - pool_fields}"
        )

    # Check fields in landing page endpoint
    if landing_pool_details:
        landing_fields = set(landing_pool_details[0].keys())
        assert required_fields.issubset(landing_fields), (
            f"Landing page endpoint missing fields: {required_fields - landing_fields}"
        )

        # Verify structure is identical (same keys)
        assert pool_fields == landing_fields, (
            f"Field structure mismatch. "
            f"Pools only: {pool_fields - landing_fields}, "
            f"Landing only: {landing_fields - pool_fields}"
        )


@pytest.mark.asyncio
async def test_empty_portfolio_consistency(integration_client: AsyncClient):
    """
    Test that both endpoints handle users with no pools consistently.
    """
    # Use a non-existent user ID
    user_id = str(uuid.uuid4())

    pools_response = await integration_client.get(
        f"/api/v2/pools/{user_id}/performance"
    )
    landing_response = await integration_client.get(
        f"/api/v2/portfolio/{user_id}/landing"
    )

    assert pools_response.status_code == 200
    assert landing_response.status_code == 200

    pools_data = pools_response.json()
    landing_pool_details = landing_response.json().get("pool_details", [])

    # Both should return empty lists
    assert pools_data == []
    assert landing_pool_details == []


@pytest.fixture
async def test_user_gmx_v2_pools(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with GMX V2 multi-token liquidity pools.

    Regression test for GMX V2 token signature bug where positions with
    same name_item but different tokens were incorrectly merged.
    """
    user_id = str(uuid.uuid4())
    wallet_address = f"0xGMX{uuid.uuid4().hex[:40]}"
    snapshot_time = datetime.now(UTC)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, created_at, updated_at)
            VALUES (:user_id, :now, :now)
            """
        ),
        {"user_id": user_id, "now": snapshot_time},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (user_id, wallet, created_at, updated_at)
            VALUES (:user_id, :wallet, :now, :now)
            """
        ),
        {"user_id": user_id, "wallet": wallet_address, "now": snapshot_time},
    )

    # Create 3 GMX V2 positions with different single tokens
    gmx_positions = [
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Arbitrum",
            "name": "GMX V2",
            "name_item": "Liquidity Pool",
            "asset_usd_value": 3667.11,
            "net_usd_value": 3667.11,
            "asset_token_list": [
                {"symbol": "WBTC", "amount": "0.042", "price": "86897.94"}
            ],
        },
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Arbitrum",
            "name": "GMX V2",
            "name_item": "Liquidity Pool",
            "asset_usd_value": 1442.05,
            "net_usd_value": 1442.05,
            "asset_token_list": [
                {"symbol": "WETH", "amount": "0.508", "price": "2838.54"}
            ],
        },
        {
            "id": str(uuid.uuid4()),
            "wallet": wallet_address,
            "chain": "Arbitrum",
            "name": "GMX V2",
            "name_item": "Liquidity Pool",
            "asset_usd_value": 218.49,
            "net_usd_value": 218.49,
            "asset_token_list": [
                {"symbol": "SOL", "amount": "1.672", "price": "130.67"}
            ],
        },
    ]

    for snapshot in gmx_positions:
        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, wallet, chain, name, name_item,
                    asset_usd_value, net_usd_value, asset_token_list,
                    snapshot_at
                )
                VALUES (
                    :id, :wallet, :chain, :name, :name_item,
                    :asset_usd_value, :net_usd_value, CAST(:asset_token_list AS jsonb),
                    :snapshot_at
                )
                """
            ),
            {
                **snapshot,
                "asset_token_list": json.dumps(snapshot.get("asset_token_list", [])),
                "snapshot_at": snapshot_time,
            },
        )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet_address": wallet_address,
        "snapshot_count": len(gmx_positions),
        "total_value": sum(s["asset_usd_value"] for s in gmx_positions),
        "expected_pool_count": 3,  # All 3 should be distinct
    }


@pytest.mark.asyncio
async def test_gmx_v2_multi_token_pools_consistency(
    integration_client: AsyncClient, test_user_gmx_v2_pools: dict[str, Any]
):
    """
    Test GMX V2 positions with same name_item but different tokens are NOT merged.

    Regression test for bug where GMX V2 "Liquidity Pool" positions with
    different tokens (WBTC, WETH, SOL) were incorrectly merged into one position,
    losing $3,885 in reported value.
    """
    user_id = test_user_gmx_v2_pools["user_id"]
    expected_count = test_user_gmx_v2_pools["expected_pool_count"]
    expected_total = test_user_gmx_v2_pools["total_value"]

    # Fetch from both endpoints
    pools_response = await integration_client.get(
        f"/api/v2/pools/{user_id}/performance"
    )
    landing_response = await integration_client.get(
        f"/api/v2/portfolio/{user_id}/landing"
    )

    assert pools_response.status_code == 200
    assert landing_response.status_code == 200

    pools_data = pools_response.json()
    landing_data = landing_response.json()
    landing_pool_details = landing_data.get("pool_details", [])

    # CRITICAL: All 3 GMX V2 positions must be visible
    assert len(pools_data) == expected_count, (
        f"GMX V2 bug regression! Expected {expected_count} pools, "
        f"got {len(pools_data)} (positions were merged)"
    )
    assert len(landing_pool_details) == expected_count, (
        f"GMX V2 bug regression in landing page! Expected {expected_count} pools, "
        f"got {len(landing_pool_details)} (positions were merged)"
    )

    # Verify pool symbols are distinct (WBTC, WETH, SOL)
    pools_symbols = {tuple(sorted(p["pool_symbols"])) for p in pools_data}
    landing_symbols = {tuple(sorted(p["pool_symbols"])) for p in landing_pool_details}

    assert len(pools_symbols) == expected_count, (
        f"GMX V2 token signatures not distinct in pools endpoint: {pools_symbols}"
    )
    assert len(landing_symbols) == expected_count, (
        f"GMX V2 token signatures not distinct in landing page: {landing_symbols}"
    )
    assert pools_symbols == landing_symbols, (
        f"GMX V2 pool symbols mismatch between endpoints: "
        f"pools={pools_symbols}, landing={landing_symbols}"
    )

    # Verify total value matches
    pools_total = sum(p["asset_usd_value"] for p in pools_data)
    landing_total = sum(p["asset_usd_value"] for p in landing_pool_details)

    assert abs(pools_total - expected_total) < 0.01, (
        f"GMX V2 total value mismatch in pools: ${pools_total:.2f} != ${expected_total:.2f}"
    )
    assert abs(landing_total - expected_total) < 0.01, (
        f"GMX V2 total value mismatch in landing: ${landing_total:.2f} != ${expected_total:.2f}"
    )

    # Verify consistency between endpoints
    assert abs(pools_total - landing_total) < 0.01, (
        f"GMX V2 total value inconsistent: "
        f"pools=${pools_total:.2f}, landing=${landing_total:.2f}"
    )


@pytest.mark.asyncio
async def test_contribution_percentages_sum_to_100(
    integration_client: AsyncClient, test_user_with_pools: dict[str, Any]
):
    """
    Test that contribution_to_portfolio percentages sum to ~100% in both endpoints.

    Validates that the percentage calculations are correct and consistent.
    """
    user_id = test_user_with_pools["user_id"]

    pools_response = await integration_client.get(
        f"/api/v2/pools/{user_id}/performance"
    )
    landing_response = await integration_client.get(
        f"/api/v2/portfolio/{user_id}/landing"
    )

    assert pools_response.status_code == 200
    assert landing_response.status_code == 200

    pools_data = pools_response.json()
    landing_pool_details = landing_response.json().get("pool_details", [])

    # Sum contribution percentages
    pools_contrib_sum = sum(p.get("contribution_to_portfolio", 0) for p in pools_data)
    landing_contrib_sum = sum(
        p.get("contribution_to_portfolio", 0) for p in landing_pool_details
    )

    # Should sum to ~100% (allowing small floating point variance)
    assert abs(pools_contrib_sum - 100.0) < 1.0, (
        f"Pools contribution percentages don't sum to 100%: {pools_contrib_sum:.2f}%"
    )
    assert abs(landing_contrib_sum - 100.0) < 1.0, (
        f"Landing contribution percentages don't sum to 100%: {landing_contrib_sum:.2f}%"
    )

    # Should be consistent between endpoints
    assert abs(pools_contrib_sum - landing_contrib_sum) < 0.1, (
        f"Contribution percentage sums inconsistent: "
        f"pools={pools_contrib_sum:.2f}%, landing={landing_contrib_sum:.2f}%"
    )


@pytest.mark.asyncio
async def test_snapshot_ids_list_consistency(
    integration_client: AsyncClient, test_user_with_pools: dict[str, Any]
):
    """
    Test that snapshot_ids list field is present and consistent in both endpoints.

    The snapshot_ids field contains all snapshot IDs that were aggregated into
    this pool position (important for cross-wallet aggregation).
    """
    user_id = test_user_with_pools["user_id"]

    pools_response = await integration_client.get(
        f"/api/v2/pools/{user_id}/performance"
    )
    landing_response = await integration_client.get(
        f"/api/v2/portfolio/{user_id}/landing"
    )

    assert pools_response.status_code == 200
    assert landing_response.status_code == 200

    pools_data = pools_response.json()
    landing_pool_details = landing_response.json().get("pool_details", [])

    # Both should have snapshot_ids field
    for i, pool in enumerate(pools_data):
        assert "snapshot_ids" in pool, (
            f"Pools endpoint pool {i} missing snapshot_ids field"
        )
        assert isinstance(pool["snapshot_ids"], list), (
            f"Pools endpoint pool {i} snapshot_ids should be a list"
        )

    for i, pool in enumerate(landing_pool_details):
        assert "snapshot_ids" in pool, (
            f"Landing page pool {i} missing snapshot_ids field"
        )
        assert isinstance(pool["snapshot_ids"], list), (
            f"Landing page pool {i} snapshot_ids should be a list"
        )

    # Verify snapshot_ids match between endpoints (after sorting)
    def sort_key(pool: dict) -> str:
        symbols = pool.get("pool_symbols", [])
        symbols_str = ",".join(sorted(symbols))
        return f"{pool.get('protocol', '')}_{pool.get('chain', '')}_{symbols_str}"

    pools_sorted = sorted(pools_data, key=sort_key)
    landing_sorted = sorted(landing_pool_details, key=sort_key)

    for i, (pool, landing_pool) in enumerate(
        zip(pools_sorted, landing_sorted, strict=False)
    ):
        pool_id = sort_key(pool)
        pools_ids = sorted(pool.get("snapshot_ids", []))
        landing_ids = sorted(landing_pool.get("snapshot_ids", []))

        assert pools_ids == landing_ids, (
            f"Pool {i} ({pool_id}): snapshot_ids mismatch - "
            f"pools={pools_ids}, landing={landing_ids}"
        )

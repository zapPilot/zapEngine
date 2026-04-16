"""
Integration tests for pool performance cross-wallet aggregation.

Tests critical scenarios to prevent regression of aggregation bugs:
1. Cross-wallet same-pool positions (Aster bug)
2. Single-wallet duplicate snapshots (Frax bug)
3. Mixed scenarios combining both

These tests use real PostgreSQL database to validate SQL behavior.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.conftest import refresh_mv_session


def _assert_protocol_groups(
    actual_groups: list[dict[str, Any]], expected_groups: list[dict[str, Any]]
) -> None:
    """Compare aggregated protocol payloads ignoring ordering differences."""

    assert len(actual_groups) == len(expected_groups)

    normalized_actual: dict[tuple[str, str, tuple[str, ...]], dict[str, Any]] = {}
    for entry in actual_groups:
        symbols = tuple(sorted(entry.get("pool_symbols") or []))
        key = (entry["protocol"].lower(), entry["chain"].lower(), symbols)
        normalized_actual[key] = entry

    for expected in expected_groups:
        expected_symbols = tuple(sorted(expected.get("pool_symbols") or []))
        key = (
            expected["protocol"].lower(),
            expected["chain"].lower(),
            expected_symbols,
        )
        assert key in normalized_actual, f"Missing aggregated entry for {expected}"
        entry = normalized_actual[key]
        assert abs(entry["asset_usd_value"] - expected["asset_usd_value"]) < 0.01
        snapshot_count = expected.get("snapshot_count")
        if snapshot_count is not None:
            assert len(entry["snapshot_ids"]) == snapshot_count


@pytest.fixture
async def test_user_cross_wallet_pools(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with same pool positions across multiple wallets.

    Simulates the Aster bug scenario where:
    - Wallet 1: Aster on arbitrum ($4,237.90)
    - Wallet 2: Aster on arbitrum ($0.00)
    - Wallet 3: Aster on hyperliquid ($22,997.47)

    All have same pool symbols but should remain separate positions.

    Returns:
        dict: Test data with user_id, wallets, and expected values
    """
    user_id = str(uuid.uuid4())
    wallet1_id = str(uuid.uuid4())
    wallet2_id = str(uuid.uuid4())
    wallet3_id = str(uuid.uuid4())
    wallet1 = f"0x3a2F{user_id[:8].upper()}"
    wallet2 = f"0x2eCB{user_id[:8].upper()}"
    wallet3 = f"0x66C4{user_id[:8].upper()}"
    snapshot_time = datetime.now() - timedelta(hours=1)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"cross-wallet-{user_id}@example.com"},
    )

    # Create 3 wallets
    for wallet_id, wallet_addr, label in [
        (wallet1_id, wallet1, "Wallet 1"),
        (wallet2_id, wallet2, "Wallet 2"),
        (wallet3_id, wallet3, "Wallet 3"),
    ]:
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, :label, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {
                "wallet_id": wallet_id,
                "user_id": user_id,
                "wallet": wallet_addr,
                "label": label,
            },
        )

    # Wallet 1: Aster on arbitrum ($4,237.90)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'aster', 'Pool',
                CAST(:asset_token_list AS jsonb), 4237.90, 4237.90,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet1,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "1000", "price": "1.0"},
                {"symbol": "DAI", "amount": "1000", "price": "1.0"},
                {"symbol": "USD₮0", "amount": "1000", "price": "1.0"},
                {"symbol": "WBTC", "amount": "0.02", "price": "50000"},
                {"symbol": "WETH", "amount": "0.5", "price": "2475.80"}
            ]""",
        },
    )

    # Wallet 2: Aster on arbitrum ($0.00 - empty but exists)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'aster', 'Pool',
                CAST(:asset_token_list AS jsonb), 0.01, 0.01,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet2,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "0.01", "price": "1.0"},
                {"symbol": "DAI", "amount": "0", "price": "1.0"},
                {"symbol": "USD₮0", "amount": "0", "price": "1.0"},
                {"symbol": "WBTC", "amount": "0", "price": "50000"},
                {"symbol": "WETH", "amount": "0", "price": "2475.80"}
            ]""",
        },
    )

    # Wallet 3: Aster on hyperliquid ($22,997.47)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'hyperliquid', 'aster', 'Pool',
                CAST(:asset_token_list AS jsonb), 22997.47, 22997.47,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet3,
            "snapshot_at": snapshot_time,
            "asset_token_list": """[
                {"symbol": "USDC", "amount": "10000", "price": "1.0"},
                {"symbol": "DAI", "amount": "5000", "price": "1.0"},
                {"symbol": "USD₮0", "amount": "3000", "price": "1.0"},
                {"symbol": "WBTC", "amount": "0.05", "price": "50000"},
                {"symbol": "WETH", "amount": "1.0", "price": "2497.47"}
            ]""",
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    pool_symbols = ["USDC", "DAI", "USD₮0", "WBTC", "WETH"]

    return {
        "user_id": user_id,
        "wallets": [wallet1, wallet2, wallet3],
        "expected_groups": [
            {
                "protocol": "aster",
                "chain": "arb",
                "pool_symbols": pool_symbols,
                "asset_usd_value": 4237.90 + 0.01,
                "snapshot_count": 2,
            },
            {
                "protocol": "aster",
                "chain": "hyperliquid",
                "pool_symbols": pool_symbols,
                "asset_usd_value": 22997.47,
                "snapshot_count": 1,
            },
        ],
    }


@pytest.fixture
async def test_user_duplicate_snapshots(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with duplicate snapshots for same position.

    Simulates the Frax bug scenario where:
    - Same wallet, same protocol, same pool
    - 3 snapshots on same day (should deduplicate to latest)
    - Without fix: $27,689 (3x $9,230)
    - With fix: $9,230

    Returns:
        dict: Test data with user_id, wallet, and expected value
    """
    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet = f"0xFRAX{user_id[:8].upper()}"
    base_time = datetime.now() - timedelta(hours=2)

    # Create user
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"frax-test-{user_id}@example.com"},
    )

    # Create wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Frax Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet},
    )

    # Create 3 snapshots for same position at different times (same day)
    # Only the LATEST one should be counted
    # Oldest to newest (latest snapshot should carry the corrected value)
    for i, minutes_ago in enumerate([30, 60, 120]):
        snapshot_time = base_time + timedelta(minutes=minutes_ago)
        value = 9230.0 if i == 2 else 9000.0  # Latest has correct value

        await integration_db_session.execute(
            text(
                """
                INSERT INTO portfolio_item_snapshots (
                    id, user_id, wallet, snapshot_at, chain, name, name_item,
                    asset_token_list, asset_usd_value, net_usd_value,
                    protocol_type, has_supported_portfolio,
                    created_at, updated_at
                ) VALUES (
                    :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'fraxlend', 'FXS-FRAX',
                    CAST(:asset_token_list AS jsonb), :value, :value,
                    'lending', true,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """
            ),
            {
                "snapshot_id": str(uuid.uuid4()),
                "user_id": user_id,
                "wallet": wallet,
                "snapshot_at": snapshot_time,
                "value": value,
                "asset_token_list": """[
                    {"symbol": "FXS", "amount": "1000", "price": "3.5"},
                    {"symbol": "FRAX", "amount": "5730", "price": "1.0"}
                ]""",
            },
        )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet,
        "expected_groups": [
            {
                "protocol": "fraxlend",
                "chain": "ethereum",
                "pool_symbols": ["FXS", "FRAX"],
                "asset_usd_value": 9230.0,
            }
        ],
    }


@pytest.fixture
async def test_user_mixed_scenario(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """
    Create test user with both cross-wallet and duplicate snapshot scenarios.

    Combines both bug scenarios:
    - Wallet 1: Aave on ethereum (2 snapshots, should take latest)
    - Wallet 2: Aave on ethereum (same pool as wallet 1, but separate position)
    - Wallet 1: Compound on ethereum (1 snapshot)

    Returns:
        dict: Test data with user_id, wallets, and expected values
    """
    user_id = str(uuid.uuid4())
    wallet1_id = str(uuid.uuid4())
    wallet2_id = str(uuid.uuid4())
    wallet1 = f"0xMIX1{user_id[:8].upper()}"
    wallet2 = f"0xMIX2{user_id[:8].upper()}"
    base_time = datetime.now() - timedelta(hours=3)

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

    # Create 2 wallets
    for wallet_id, wallet_addr, label in [
        (wallet1_id, wallet1, "Mixed Wallet 1"),
        (wallet2_id, wallet2, "Mixed Wallet 2"),
    ]:
        await integration_db_session.execute(
            text(
                """
                INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
                VALUES (:wallet_id, :user_id, :wallet, :label, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            ),
            {
                "wallet_id": wallet_id,
                "user_id": user_id,
                "wallet": wallet_addr,
                "label": label,
            },
        )

    # Wallet 1, Aave - Snapshot 1 (older, $5000)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'aave-v3', 'USDC',
                CAST(:asset_token_list AS jsonb), 5000.0, 5000.0,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet1,
            "snapshot_at": base_time + timedelta(minutes=30),
            "asset_token_list": """[{"symbol": "USDC", "amount": "5000", "price": "1.0"}]""",
        },
    )

    latest_time = base_time + timedelta(minutes=90)

    # Wallet 1, Aave - Snapshot 2 (newer, $5500 - THIS should be counted)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'aave-v3', 'USDC',
                CAST(:asset_token_list AS jsonb), 5500.0, 5500.0,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet1,
            "snapshot_at": latest_time,
            "asset_token_list": """[{"symbol": "USDC", "amount": "5500", "price": "1.0"}]""",
        },
    )

    # Wallet 2, Aave - Single snapshot ($3000, separate position from wallet 1)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'aave-v3', 'USDC',
                CAST(:asset_token_list AS jsonb), 3000.0, 3000.0,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet2,
            "snapshot_at": base_time + timedelta(minutes=45),
            "asset_token_list": """[{"symbol": "USDC", "amount": "3000", "price": "1.0"}]""",
        },
    )

    # Wallet 1, Compound - Single snapshot ($2000, different protocol)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'ethereum', 'compound-v3', 'USDC',
                CAST(:asset_token_list AS jsonb), 2000.0, 2000.0,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet1,
            "snapshot_at": latest_time,
            "asset_token_list": """[{"symbol": "USDC", "amount": "2000", "price": "1.0"}]""",
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallets": [wallet1, wallet2],
        "expected_groups": [
            {
                "protocol": "aave-v3",
                "chain": "ethereum",
                "pool_symbols": ["USDC"],
                "asset_usd_value": 5500.0 + 3000.0,
            },
            {
                "protocol": "compound-v3",
                "chain": "ethereum",
                "pool_symbols": ["USDC"],
                "asset_usd_value": 2000.0,
            },
        ],
    }


@pytest.fixture
async def test_user_same_wallet_multi_protocols(
    integration_db_session: AsyncSession,
) -> dict[str, Any]:
    """Create user with multiple protocols on same wallet but different timestamps."""

    user_id = str(uuid.uuid4())
    wallet_id = str(uuid.uuid4())
    wallet = f"0xASTER{user_id[:8].upper()}"
    base_time = datetime.now() - timedelta(hours=1)

    # Create user and wallet
    await integration_db_session.execute(
        text(
            """
            INSERT INTO users (id, email, is_active, created_at, updated_at)
            VALUES (:user_id, :email, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"user_id": user_id, "email": f"same-wallet-{user_id}@example.com"},
    )

    await integration_db_session.execute(
        text(
            """
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at, updated_at)
            VALUES (:wallet_id, :user_id, :wallet, 'Same Wallet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "wallet": wallet},
    )

    latest_time = base_time + timedelta(minutes=2)

    # Latest-day snapshot: Aster on Arbitrum (~$4.2k)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'aster', 'Pool',
                CAST(:asset_token_list AS jsonb), 4244.66, 4244.66,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet,
            "snapshot_at": latest_time,
            "asset_token_list": """
                [
                    {"symbol": "USDC", "amount": "1000", "price": "1.0"},
                    {"symbol": "DAI", "amount": "1000", "price": "1.0"},
                    {"symbol": "USD₮0", "amount": "1000", "price": "1.0"}
                ]
            """,
        },
    )

    # Historical snapshot (previous day) that should be ignored by latest-day filter
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'arb', 'aster', 'Pool',
                '[]'::jsonb, 99999.0, 99999.0,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet,
            "snapshot_at": base_time - timedelta(days=1),
        },
    )

    # Latest-day snapshot: Hyperliquid on Arbitrum (~$23k)
    await integration_db_session.execute(
        text(
            """
            INSERT INTO portfolio_item_snapshots (
                id, user_id, wallet, snapshot_at, chain, name, name_item,
                asset_token_list, asset_usd_value, net_usd_value,
                protocol_type, has_supported_portfolio,
                created_at, updated_at
            ) VALUES (
                :snapshot_id, :user_id, :wallet, :snapshot_at, 'hyperliquid', 'hyperliquid', 'Vault',
                '[]'::jsonb, 23034.07, 23034.07,
                'lending', true,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """
        ),
        {
            "snapshot_id": str(uuid.uuid4()),
            "user_id": user_id,
            "wallet": wallet,
            "snapshot_at": latest_time,
        },
    )

    await integration_db_session.commit()
    await refresh_mv_session(integration_db_session)

    return {
        "user_id": user_id,
        "wallet": wallet,
        "expected_groups": [
            {
                "protocol": "aster",
                "chain": "arb",
                "pool_symbols": ["USDC", "DAI", "USD₮0"],
                "asset_usd_value": 4244.66,
            },
            {
                "protocol": "hyperliquid",
                "chain": "hyperliquid",
                "pool_symbols": [],
                "asset_usd_value": 23034.07,
            },
        ],
    }


@pytest.mark.asyncio
async def test_protocol_totals_sum_across_wallets(
    integration_client: AsyncClient,
    test_user_cross_wallet_pools: dict[str, Any],
):
    """Protocol-level response should sum wallet positions for same protocol."""
    user_id = test_user_cross_wallet_pools["user_id"]

    response = await integration_client.get(f"/api/v2/pools/{user_id}/performance")

    assert response.status_code == 200
    data = response.json()

    _assert_protocol_groups(data, test_user_cross_wallet_pools["expected_groups"])


@pytest.mark.asyncio
async def test_duplicate_snapshots_deduplicated(
    integration_client: AsyncClient,
    test_user_duplicate_snapshots: dict[str, Any],
):
    """
    Test that duplicate snapshots for same position are deduplicated to latest.

    Validates fix for Frax bug where 3 snapshots caused 3x value inflation.
    """
    user_id = test_user_duplicate_snapshots["user_id"]

    response = await integration_client.get(f"/api/v2/pools/{user_id}/performance")

    assert response.status_code == 200
    data = response.json()

    _assert_protocol_groups(data, test_user_duplicate_snapshots["expected_groups"])


@pytest.mark.asyncio
async def test_mixed_scenario_correct_aggregation(
    integration_client: AsyncClient,
    test_user_mixed_scenario: dict[str, Any],
):
    """
    Test mixed scenario with both cross-wallet and duplicate snapshots.

    Validates that both fixes work together correctly:
    - Duplicate snapshots for same wallet/protocol → deduplicate to latest
    - Same protocol across different wallets → keep separate
    """
    user_id = test_user_mixed_scenario["user_id"]

    response = await integration_client.get(f"/api/v2/pools/{user_id}/performance")

    assert response.status_code == 200
    data = response.json()

    _assert_protocol_groups(data, test_user_mixed_scenario["expected_groups"])


@pytest.mark.asyncio
async def test_pool_performance_response_drops_wallet_and_snapshot_id(
    integration_client: AsyncClient,
    test_user_cross_wallet_pools: dict[str, Any],
):
    """Aggregated response should include per-wallet identifiers for detail view consistency."""

    user_id = test_user_cross_wallet_pools["user_id"]

    response = await integration_client.get(f"/api/v2/pools/{user_id}/performance")

    assert response.status_code == 200
    data = response.json()

    for position in data:
        assert "wallet" in position
        assert "snapshot_id" in position
        assert "snapshot_ids" in position


@pytest.mark.asyncio
async def test_same_wallet_multiple_protocols_preserved(
    integration_client: AsyncClient,
    test_user_same_wallet_multi_protocols: dict[str, Any],
):
    """Ensure newer snapshot from other protocol does not erase older protocol holdings."""

    user_id = test_user_same_wallet_multi_protocols["user_id"]

    response = await integration_client.get(f"/api/v2/pools/{user_id}/performance")

    assert response.status_code == 200
    data = response.json()

    _assert_protocol_groups(
        data, test_user_same_wallet_multi_protocols["expected_groups"]
    )

    returned_protocols = {position["protocol"].lower() for position in data}
    assert returned_protocols == {
        group["protocol"].lower()
        for group in test_user_same_wallet_multi_protocols["expected_groups"]
    }

    # Ensure the previous-day snapshot is ignored
    assert all(position["asset_usd_value"] < 50000 for position in data)

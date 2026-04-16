"""
Integration tests for API endpoints using FastAPI test client
"""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text


@pytest.fixture
async def test_user_with_wallets(db_session) -> dict[str, Any]:
    """Create test user data with multiple wallets for API testing"""
    test_user_id = str(uuid.uuid4())
    test_email = "davidtnfsh@gmail.com"
    test_wallet = "0xe4bAc3e44E8080e1491C11119197D33E396EA82B"
    subscription_id = str(uuid.uuid4())
    main_wallet_id = str(uuid.uuid4())

    # Insert test user
    await db_session.execute(
        text("""
            INSERT INTO users (id, email, is_active, created_at)
            VALUES (:id, :email, true, CURRENT_TIMESTAMP)
        """),
        {
            "id": test_user_id,
            "email": test_email,
        },
    )

    # Insert user subscription
    await db_session.execute(
        text("""
            INSERT INTO user_subscriptions (id, user_id, plan_code, starts_at, created_at)
            VALUES (:id, :user_id, 'premium', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """),
        {
            "id": subscription_id,
            "user_id": test_user_id,
        },
    )

    # Insert main wallet
    await db_session.execute(
        text("""
            INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
            VALUES (:id, :user_id, :wallet, true, 'Main Wallet', CURRENT_TIMESTAMP)
        """),
        {
            "id": main_wallet_id,
            "user_id": test_user_id,
            "wallet": test_wallet,
        },
    )

    # Insert additional wallets
    wallet_id_1 = str(uuid.uuid4())
    wallet_id_2 = str(uuid.uuid4())

    await db_session.execute(
        text("""
            INSERT INTO user_crypto_wallets
            (id, user_id, wallet, label, created_at)
            VALUES
            (:id1, :user_id, :wallet1, false, 'Trading Wallet', CURRENT_TIMESTAMP),
            (:id2, :user_id, :wallet2, false, 'Cold Storage', CURRENT_TIMESTAMP)
        """),
        {
            "id1": wallet_id_1,
            "id2": wallet_id_2,
            "user_id": test_user_id,
            "wallet1": "0x1234567890abcdef1234567890abcdef12345678",
            "wallet2": "0x987654321fedcba987654321fedcba9876543210",
        },
    )

    await db_session.commit()

    return {
        "user_id": test_user_id,
        "email": test_email,
        "main_wallet": test_wallet,
        "additional_wallets": [
            "0x1234567890abcdef1234567890abcdef12345678",
            "0x987654321fedcba987654321fedcba9876543210",
        ],
    }


class TestAPIGeneralIntegration:
    """Test general API integration without deleted user endpoints"""

    @pytest.mark.asyncio
    async def test_root_endpoint_accessible(self, client: AsyncClient):
        """Test that root endpoint is accessible"""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert data["service"] == "Quant Engine"

    @pytest.mark.asyncio
    async def test_health_endpoint_accessible(self, client: AsyncClient):
        """Test that health endpoint is accessible"""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "status" in data


class TestAPIErrorHandling:
    """Test API error handling scenarios"""

    @pytest.mark.asyncio
    async def test_invalid_endpoint(self, client: AsyncClient):
        """Test API response to non-existent endpoint"""
        response = await client.get("/api/v2/nonexistent")
        assert response.status_code == 404

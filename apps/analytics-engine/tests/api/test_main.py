"""
Tests for main application endpoints
"""

from httpx import AsyncClient


class TestMainAPI:
    """Test cases for main application endpoints"""

    async def test_root_endpoint(self, client: AsyncClient):
        """Test root endpoint"""
        response = await client.get("/")

        assert response.status_code == 200
        data = response.json()

        assert "service" in data
        assert "version" in data
        assert "status" in data
        assert data["service"] == "Quant Engine"
        assert data["status"] == "healthy"

    async def test_health_check(self, client: AsyncClient):
        """Test health check endpoint"""
        response = await client.get("/health")

        # Might return 503 if DB not initialized; handle both shapes
        assert response.status_code in [200, 503]
        raw = response.json()
        data = raw if response.status_code == 200 else raw.get("detail", {})

        assert "service" in data
        assert "status" in data
        assert "checks" in data
        assert data["service"] == "Quant Engine"

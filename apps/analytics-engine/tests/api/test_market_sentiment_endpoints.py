"""
Tests for market sentiment endpoints in `src.api.routers.market`.

Covers:
- GET /market/sentiment
- GET /market/sentiment/health
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest
from httpx import AsyncClient

from src.main import app
from src.models.market_sentiment import (
    MarketSentimentHealthResponse,
    MarketSentimentResponse,
)
from src.services.dependencies import (
    get_market_sentiment_service,
)


class TestMarketSentimentEndpoints:
    """Tests for generic market sentiment endpoints."""

    @pytest.fixture
    def mock_sentiment_response(self):
        """Standard mock sentiment response."""
        return MarketSentimentResponse(
            value=45,
            status="Fear",
            timestamp=datetime.now(UTC),
            source="alternative.me",
            cached=False,
        )

    @pytest.mark.asyncio
    async def test_get_market_sentiment(
        self, client: AsyncClient, mock_sentiment_response
    ):
        """GET /market/sentiment should return current sentiment."""
        mock_service = Mock()
        mock_service.get_market_sentiment = AsyncMock(
            return_value=mock_sentiment_response
        )

        app.dependency_overrides[get_market_sentiment_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/sentiment")

            assert response.status_code == 200
            data = response.json()
            assert data["value"] == 45
            assert data["status"] == "Fear"

            # Verify cache headers
            assert "cache-control" in response.headers
            assert "max-age=600" in response.headers["cache-control"]
            assert "vary" in response.headers
            assert response.headers["access-control-allow-origin"] == "*"
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

    @pytest.mark.asyncio
    async def test_get_market_sentiment_health(self, client: AsyncClient):
        """GET /market/sentiment/health should return health status."""
        mock_health = MarketSentimentHealthResponse(
            cached=True,
            cache_age_seconds=120,
            cache_ttl_seconds=600,
            last_update=datetime.now(UTC),
        )
        mock_service = Mock()
        mock_service.get_health_status.return_value = mock_health

        app.dependency_overrides[get_market_sentiment_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/sentiment/health")

            assert response.status_code == 200
            data = response.json()
            assert data["cached"] is True
            assert data["cache_age_seconds"] == 120
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

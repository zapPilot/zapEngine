"""
Tests for market sentiment API endpoints and service
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from src.main import app
from src.models.market_sentiment import (
    ExternalSentimentResponse,
    MarketSentimentHealthResponse,
    MarketSentimentResponse,
)
from src.services.dependencies import get_market_sentiment_service
from src.services.market.market_sentiment_service import MarketSentimentService


class TestMarketSentimentService:
    """Test cases for MarketSentimentService - core business logic"""

    @pytest.fixture
    def service(self) -> MarketSentimentService:
        """Create a fresh service instance for each test"""
        return MarketSentimentService()

    @pytest.fixture
    def mock_external_response(self) -> dict:
        """Mock response from alternative.me API"""
        return {
            "data": [
                {
                    "value": "45",
                    "value_classification": "Fear",
                    "timestamp": "1732108800",  # 2024-11-20 12:00:00 UTC
                    "time_until_update": "37712",
                }
            ]
        }

    async def test_fetch_from_external_api_success(
        self, service: MarketSentimentService, mock_external_response: dict
    ):
        """Test successful external API fetch"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_external_response
            mock_response.raise_for_status = MagicMock()
            mock_get.return_value = mock_response

            result = await service._fetch_from_external_api()

            assert isinstance(result, ExternalSentimentResponse)
            assert len(result.data) == 1
            assert result.data[0].value == "45"
            assert result.data[0].value_classification == "Fear"

    async def test_transform_response(
        self, service: MarketSentimentService, mock_external_response: dict
    ):
        """Test response transformation"""
        external_data = ExternalSentimentResponse.model_validate(mock_external_response)
        result = service._transform_response(external_data, cached=False)

        assert isinstance(result, MarketSentimentResponse)
        assert result.value == 45
        assert result.status == "Fear"
        assert result.source == "alternative.me"
        assert result.cached is False
        assert isinstance(result.timestamp, datetime)

    async def test_get_market_sentiment_success(
        self, service: MarketSentimentService, mock_external_response: dict
    ):
        """Test successful market sentiment retrieval"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_external_response
            mock_response.raise_for_status = MagicMock()
            mock_get.return_value = mock_response

            result = await service.get_market_sentiment()

            assert result.value == 45
            assert result.status == "Fear"
            assert result.source == "alternative.me"
            assert result.cached is False

    async def test_cache_behavior(
        self, service: MarketSentimentService, mock_external_response: dict
    ):
        """Test cache hit and miss behavior using CacheService"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = mock_external_response
            mock_response.raise_for_status = MagicMock()
            mock_get.return_value = mock_response

            # First call - cache miss
            with (
                patch("src.core.cache_service.analytics_cache.get", return_value=None),
                patch("src.core.cache_service.analytics_cache.set") as mock_set,
            ):
                result1 = await service.get_market_sentiment()
                assert result1.cached is False
                assert mock_get.call_count == 1
                assert mock_set.call_count == 1

            # Second call - cache hit
            cached_data = {
                "value": 45,
                "status": "Fear",
                "timestamp": "2024-11-20T12:00:00+00:00",
                "source": "alternative.me",
            }
            with patch(
                "src.core.cache_service.analytics_cache.get", return_value=cached_data
            ):
                result2 = await service.get_market_sentiment()
                assert result2.cached is True
                assert result2.value == 45
                assert mock_get.call_count == 1  # No additional API call

    async def test_timeout_error(self, service: MarketSentimentService):
        """Test timeout error handling"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.TimeoutException("Request timeout")

            with pytest.raises(HTTPException) as exc_info:
                await service._fetch_from_external_api()

            assert exc_info.value.status_code == 504
            assert exc_info.value.detail["error"] == "GATEWAY_TIMEOUT"

    async def test_service_unavailable_error(self, service: MarketSentimentService):
        """Test 5xx error from external API"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 503
            mock_response.text = "Service unavailable"
            mock_response.raise_for_status = MagicMock()
            mock_get.return_value = mock_response

            with pytest.raises(HTTPException) as exc_info:
                await service._fetch_from_external_api()

            assert exc_info.value.status_code == 503
            assert exc_info.value.detail["error"] == "SERVICE_UNAVAILABLE"

    async def test_invalid_response_error(self, service: MarketSentimentService):
        """Test invalid response format"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"invalid": "data"}
            mock_response.raise_for_status = MagicMock()
            mock_get.return_value = mock_response

            with pytest.raises(HTTPException) as exc_info:
                await service._fetch_from_external_api()

            assert exc_info.value.status_code == 502
            assert exc_info.value.detail["error"] == "BAD_GATEWAY"

    async def test_empty_data_error(self, service: MarketSentimentService):
        """Test empty data array"""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": []}
            mock_response.raise_for_status = MagicMock()
            mock_get.return_value = mock_response

            external_data = await service._fetch_from_external_api()

            with pytest.raises(HTTPException) as exc_info:
                service._transform_response(external_data, cached=False)

            assert exc_info.value.status_code == 502
            assert exc_info.value.detail["error"] == "BAD_GATEWAY"

    def test_health_status_no_cache(self, service: MarketSentimentService):
        """Test health status with no cached data"""
        with patch("src.core.cache_service.analytics_cache.get", return_value=None):
            health = service.get_health_status()

            assert health.cached is False
            assert health.cache_age_seconds is None
            assert health.cache_ttl_seconds == 600
            assert health.last_update is None

    def test_health_status_with_cache(self, service: MarketSentimentService):
        """Test health status with cached data"""
        cached_data = {
            "value": 45,
            "status": "Fear",
            "timestamp": "2024-11-20T12:00:00+00:00",
            "source": "alternative.me",
        }

        with patch(
            "src.core.cache_service.analytics_cache.get", return_value=cached_data
        ):
            health = service.get_health_status()

            assert health.cached is True
            assert health.cache_age_seconds is not None
            assert health.cache_age_seconds >= 0
            assert health.cache_ttl_seconds == 600
            assert health.last_update is not None


# ==================== TEST DATA FACTORIES ====================


def create_sentiment_response(
    value: int = 45,
    status: str = "Fear",
    cached: bool = False,
) -> MarketSentimentResponse:
    """Factory for market sentiment response."""
    return MarketSentimentResponse(
        value=value,
        status=status,
        timestamp=datetime(2024, 11, 20, 12, 0, 0, tzinfo=UTC),
        source="alternative.me",
        cached=cached,
    )


def create_health_response(
    cached: bool = False,
    cache_age_seconds: int | None = None,
    last_update: datetime | None = None,
) -> MarketSentimentHealthResponse:
    """Factory for health response."""
    return MarketSentimentHealthResponse(
        cached=cached,
        cache_age_seconds=cache_age_seconds,
        cache_ttl_seconds=600,
        last_update=last_update,
    )


# ==================== MOCK SERVICE CLASSES ====================


class MockMarketSentimentService:
    """Mock service for MarketSentimentService with configurable responses."""

    def __init__(
        self,
        sentiment_response: MarketSentimentResponse | None = None,
        health_response: MarketSentimentHealthResponse | None = None,
    ):
        self.sentiment_response = sentiment_response or create_sentiment_response()
        self.health_response = health_response or create_health_response()
        self.sentiment_calls: list[dict] = []
        self.health_calls: list[dict] = []

    async def get_market_sentiment(self) -> MarketSentimentResponse:
        """Mock get_market_sentiment to return configured response."""
        self.sentiment_calls.append({})
        if isinstance(self.sentiment_response, Exception):
            raise self.sentiment_response
        return self.sentiment_response

    def get_health_status(self) -> MarketSentimentHealthResponse:
        """Mock get_health_status to return configured response."""
        self.health_calls.append({})
        if isinstance(self.health_response, Exception):
            raise self.health_response
        return self.health_response


# ==================== HTTP ENDPOINT TESTS ====================


class TestMarketSentimentEndpoint:
    """HTTP endpoint tests for GET /api/v2/market/sentiment."""

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_success_with_valid_response(
        self, client: AsyncClient
    ):
        """Endpoint returns 200 with valid market sentiment data."""
        response_data = create_sentiment_response(value=45, status="Fear", cached=False)
        service = MockMarketSentimentService(sentiment_response=response_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        assert len(service.sentiment_calls) == 1

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_response_structure(self, client: AsyncClient):
        """Endpoint response contains all expected fields."""
        response_data = create_sentiment_response(value=75, status="Greed", cached=True)
        service = MockMarketSentimentService(sentiment_response=response_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        data = response.json()

        # Validate all required fields
        assert "value" in data
        assert "status" in data
        assert "timestamp" in data
        assert "source" in data
        assert "cached" in data

        # Validate field values
        assert data["value"] == 75
        assert data["status"] == "Greed"
        assert data["source"] == "alternative.me"
        assert data["cached"] is True

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_cache_control_header(self, client: AsyncClient):
        """Endpoint sets Cache-Control header correctly."""
        response_data = create_sentiment_response()
        service = MockMarketSentimentService(sentiment_response=response_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        assert "Cache-Control" in response.headers
        assert (
            response.headers["Cache-Control"]
            == "public, max-age=600, stale-while-revalidate=3000"
        )

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_vary_header(self, client: AsyncClient):
        """Endpoint sets Vary: Accept-Encoding header."""
        response_data = create_sentiment_response()
        service = MockMarketSentimentService(sentiment_response=response_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        assert "Vary" in response.headers
        assert response.headers["Vary"] == "Accept-Encoding"

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_503_service_unavailable(
        self, client: AsyncClient
    ):
        """Endpoint handles 503 Service Unavailable error."""
        error = HTTPException(
            status_code=503,
            detail={
                "error": "SERVICE_UNAVAILABLE",
                "message": "Market sentiment data temporarily unavailable",
            },
        )
        service = MockMarketSentimentService(sentiment_response=error)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 503
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_504_gateway_timeout(self, client: AsyncClient):
        """Endpoint handles 504 Gateway Timeout error."""
        error = HTTPException(
            status_code=504,
            detail={
                "error": "GATEWAY_TIMEOUT",
                "message": "Request to sentiment provider timed out",
            },
        )
        service = MockMarketSentimentService(sentiment_response=error)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 504
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_502_bad_gateway(self, client: AsyncClient):
        """Endpoint handles 502 Bad Gateway error."""
        error = HTTPException(
            status_code=502,
            detail={
                "error": "BAD_GATEWAY",
                "message": "Invalid response from sentiment provider",
            },
        )
        service = MockMarketSentimentService(sentiment_response=error)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 502
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_sentiment_endpoint_cached_indicator_flag(self, client: AsyncClient):
        """Endpoint correctly reflects cached data indicator."""
        # Test with cached=True
        cached_response = create_sentiment_response(cached=True)
        service = MockMarketSentimentService(sentiment_response=cached_response)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["cached"] is True

        # Test with cached=False
        fresh_response = create_sentiment_response(cached=False)
        service = MockMarketSentimentService(sentiment_response=fresh_response)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["cached"] is False


class TestMarketSentimentHealthEndpoint:
    """HTTP endpoint tests for GET /api/v2/market/sentiment/health."""

    @pytest.mark.asyncio
    async def test_health_endpoint_without_cache(self, client: AsyncClient):
        """Health endpoint returns correct status when no cache exists."""
        health_data = create_health_response(
            cached=False, cache_age_seconds=None, last_update=None
        )
        service = MockMarketSentimentService(health_response=health_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment/health")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["cached"] is False
        assert data["cache_age_seconds"] is None
        assert data["cache_ttl_seconds"] == 600
        assert data["last_update"] is None

    @pytest.mark.asyncio
    async def test_health_endpoint_with_cache(self, client: AsyncClient):
        """Health endpoint returns correct status when cache exists."""
        last_update = datetime(2024, 11, 20, 12, 0, 0, tzinfo=UTC)
        health_data = create_health_response(
            cached=True, cache_age_seconds=120, last_update=last_update
        )
        service = MockMarketSentimentService(health_response=health_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment/health")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["cached"] is True
        assert data["cache_age_seconds"] == 120
        assert data["cache_ttl_seconds"] == 600
        assert data["last_update"] is not None

    @pytest.mark.asyncio
    async def test_health_endpoint_response_structure(self, client: AsyncClient):
        """Health endpoint response contains all expected fields."""
        last_update = datetime(2024, 11, 20, 12, 0, 0, tzinfo=UTC)
        health_data = create_health_response(
            cached=True, cache_age_seconds=60, last_update=last_update
        )
        service = MockMarketSentimentService(health_response=health_data)
        app.dependency_overrides[get_market_sentiment_service] = lambda: service

        try:
            response = await client.get("/api/v2/market/sentiment/health")
        finally:
            app.dependency_overrides.pop(get_market_sentiment_service, None)

        assert response.status_code == 200
        data = response.json()

        # Validate all required fields exist
        assert "cached" in data
        assert "cache_age_seconds" in data
        assert "cache_ttl_seconds" in data
        assert "last_update" in data

        # Validate field types and values
        assert isinstance(data["cached"], bool)
        assert isinstance(data["cache_age_seconds"], int)
        assert isinstance(data["cache_ttl_seconds"], int)
        assert isinstance(data["last_update"], str)  # ISO format string

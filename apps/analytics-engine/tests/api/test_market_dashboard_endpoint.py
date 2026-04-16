"""
Comprehensive tests for GET /api/v2/market/dashboard endpoint.

Tests cover:
- Successful retrieval with default and custom parameters
- Response structure and data validation
- Cache headers verification
- Error handling (422 validation, 500 database)
- Query parameter validation (days range, token case-insensitivity)
- OpenAPI documentation

Coverage target: 85%+
"""

from datetime import UTC, date, datetime
from unittest.mock import Mock

import pytest
from httpx import AsyncClient

from src.core.exceptions import DatabaseError
from src.main import app
from src.models.market_dashboard import (
    EthBtcRelativeStrengthPoint,
    MarketDashboardPoint,
    MarketDashboardResponse,
)
from src.models.regime_tracking import RegimeId
from src.services.dependencies import get_market_dashboard_service


def _build_dashboard_response(
    *,
    days: int = 365,
    token_symbol: str = "BTC",
    snapshots: list[MarketDashboardPoint] | None = None,
) -> MarketDashboardResponse:
    """Build a minimal valid MarketDashboardResponse for test fixtures."""
    if snapshots is None:
        snapshots = [
            MarketDashboardPoint(
                snapshot_date=date(2025, 1, 15),
                price_usd=95000.0,
                dma_200=85000.0,
                sentiment_value=45,
                regime=RegimeId.f,
                eth_btc_relative_strength=EthBtcRelativeStrengthPoint(
                    ratio=0.0532,
                    dma_200=0.0498,
                    is_above_dma=True,
                ),
            )
        ]
    return MarketDashboardResponse(
        snapshots=snapshots,
        count=len(snapshots),
        token_symbol=token_symbol,
        days_requested=days,
        timestamp=datetime.now(UTC),
    )


class TestMarketDashboardEndpointSuccess:
    """Test successful market dashboard retrieval."""

    @pytest.mark.asyncio
    async def test_default_params(self, client: AsyncClient):
        """GET /dashboard with defaults should call service with (365, 'BTC') and return 200."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()

            assert "snapshots" in data
            assert "count" in data
            assert "token_symbol" in data
            assert "days_requested" in data
            assert "timestamp" in data

            mock_service.get_market_dashboard.assert_called_once_with(
                days=365, token_symbol="BTC"
            )
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_custom_days(self, client: AsyncClient):
        """GET /dashboard?days=30 should pass days=30 to service."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            days=30
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard?days=30")

            assert response.status_code == 200
            mock_service.get_market_dashboard.assert_called_once_with(
                days=30, token_symbol="BTC"
            )
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_custom_token(self, client: AsyncClient):
        """GET /dashboard?token=eth should call service with token_symbol='ETH'."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            token_symbol="ETH"
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard?token=eth")

            assert response.status_code == 200
            mock_service.get_market_dashboard.assert_called_once_with(
                days=365, token_symbol="ETH"
            )
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_token_case_insensitive_lowercase(self, client: AsyncClient):
        """token='eth' (lowercase) should be normalized to 'ETH'."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            token_symbol="ETH"
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard?token=eth")

            assert response.status_code == 200
            call_kwargs = mock_service.get_market_dashboard.call_args
            assert call_kwargs.kwargs["token_symbol"] == "ETH"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_token_case_insensitive_uppercase(self, client: AsyncClient):
        """token='ETH' (uppercase) should also be normalized to 'ETH'."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            token_symbol="ETH"
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard?token=ETH")

            assert response.status_code == 200
            call_kwargs = mock_service.get_market_dashboard.call_args
            assert call_kwargs.kwargs["token_symbol"] == "ETH"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_count_matches_snapshots_length(self, client: AsyncClient):
        """count field should equal len(snapshots)."""
        snapshots = [
            MarketDashboardPoint(
                snapshot_date=date(2025, 1, d),
                price_usd=float(90000 + d * 100),
                dma_200=None,
                sentiment_value=None,
                regime=None,
            )
            for d in range(1, 6)
        ]
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            snapshots=snapshots
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == len(data["snapshots"])
            assert data["count"] == 5
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardResponseStructure:
    """Test response structure and field types."""

    @pytest.mark.asyncio
    async def test_response_top_level_fields(self, client: AsyncClient):
        """Response should contain all expected top-level fields."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()

            assert "snapshots" in data
            assert "count" in data
            assert "token_symbol" in data
            assert "days_requested" in data
            assert "timestamp" in data

            assert isinstance(data["snapshots"], list)
            assert isinstance(data["count"], int)
            assert isinstance(data["token_symbol"], str)
            assert isinstance(data["days_requested"], int)
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_snapshot_fields(self, client: AsyncClient):
        """Each snapshot should contain all expected fields."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()

            assert len(data["snapshots"]) > 0
            snapshot = data["snapshots"][0]

            assert "snapshot_date" in snapshot
            assert "price_usd" in snapshot
            assert "dma_200" in snapshot
            assert "sentiment_value" in snapshot
            assert "regime" in snapshot
            assert "eth_btc_relative_strength" in snapshot
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_empty_snapshots(self, client: AsyncClient):
        """Service returning empty list should yield 200 with count=0."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            snapshots=[]
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()
            assert data["count"] == 0
            assert data["snapshots"] == []
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_snapshot_with_null_dma(self, client: AsyncClient):
        """dma_200=None should be allowed and serialized as null."""
        snapshots = [
            MarketDashboardPoint(
                snapshot_date=date(2025, 1, 1),
                price_usd=90000.0,
                dma_200=None,
                sentiment_value=50,
                regime=RegimeId.n,
            )
        ]
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            snapshots=snapshots
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()
            assert data["snapshots"][0]["dma_200"] is None
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_snapshot_with_null_sentiment_and_regime(self, client: AsyncClient):
        """sentiment_value=None and regime=None should be allowed."""
        snapshots = [
            MarketDashboardPoint(
                snapshot_date=date(2025, 1, 1),
                price_usd=90000.0,
                dma_200=85000.0,
                sentiment_value=None,
                regime=None,
                eth_btc_relative_strength=None,
            )
        ]
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            snapshots=snapshots
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()
            snapshot = data["snapshots"][0]
            assert snapshot["sentiment_value"] is None
            assert snapshot["regime"] is None
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_snapshot_with_relative_strength(self, client: AsyncClient):
        """ETH/BTC relative-strength data should be serialized when present."""
        snapshots = [
            MarketDashboardPoint(
                snapshot_date=date(2025, 1, 1),
                price_usd=90000.0,
                dma_200=85000.0,
                sentiment_value=50,
                regime=RegimeId.n,
                eth_btc_relative_strength=EthBtcRelativeStrengthPoint(
                    ratio=0.0532,
                    dma_200=0.0498,
                    is_above_dma=True,
                ),
            )
        ]
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            snapshots=snapshots
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            snapshot = response.json()["snapshots"][0]
            assert snapshot["eth_btc_relative_strength"] == {
                "ratio": 0.0532,
                "dma_200": 0.0498,
                "is_above_dma": True,
            }
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardCacheHeaders:
    """Test HTTP cache headers on dashboard responses."""

    @pytest.mark.asyncio
    async def test_cache_control_header(self, client: AsyncClient):
        """Response should include correct Cache-Control header values."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            assert "cache-control" in response.headers
            cache_control = response.headers["cache-control"]
            assert "public" in cache_control
            assert "max-age=3600" in cache_control
            assert "stale-while-revalidate=21600" in cache_control
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_cors_header(self, client: AsyncClient):
        """Response should include CORS header allowing all origins."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            assert "access-control-allow-origin" in response.headers
            assert response.headers["access-control-allow-origin"] == "*"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_vary_header(self, client: AsyncClient):
        """Response should include Vary: Accept-Encoding header."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            assert "vary" in response.headers
            assert response.headers["vary"] == "Accept-Encoding"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardErrorHandling:
    """Test error handling and query parameter validation."""

    @pytest.mark.asyncio
    async def test_invalid_days_zero(self, client: AsyncClient):
        """days=0 should return 422 (below minimum of 1)."""
        response = await client.get("/api/v2/market/dashboard?days=0")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_days_not_integer(self, client: AsyncClient):
        """days=abc should return 422 (not a valid integer)."""
        response = await client.get("/api/v2/market/dashboard?days=abc")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_database_error_returns_500(self, client: AsyncClient):
        """Service raising DatabaseError should result in 500 response."""
        mock_service = Mock()
        mock_service.get_market_dashboard.side_effect = DatabaseError(
            message="Failed to fetch market dashboard data", is_transient=False
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 500
            data = response.json()
            assert "error_code" in data or "detail" in data or "message" in data
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardOpenAPIDocumentation:
    """Test that OpenAPI schema documents the endpoint correctly."""

    @pytest.mark.asyncio
    async def test_openapi_schema_includes_endpoint(self, client: AsyncClient):
        """OpenAPI schema should include /api/v2/market/dashboard path."""
        response = await client.get("/openapi.json")

        assert response.status_code == 200
        schema = response.json()

        assert "/api/v2/market/dashboard" in schema["paths"]

    @pytest.mark.asyncio
    async def test_openapi_schema_documents_parameters(self, client: AsyncClient):
        """OpenAPI schema should document days param with range 1-2000."""
        response = await client.get("/openapi.json")
        schema = response.json()

        endpoint = schema["paths"]["/api/v2/market/dashboard"]["get"]
        params = endpoint.get("parameters", [])
        days_param = next((p for p in params if p["name"] == "days"), None)

        assert days_param is not None
        assert days_param["in"] == "query"
        assert days_param["schema"]["default"] == 365
        assert days_param["schema"]["minimum"] == 1
        assert days_param["schema"]["maximum"] == 2000

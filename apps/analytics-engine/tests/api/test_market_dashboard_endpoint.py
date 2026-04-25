"""
Comprehensive tests for GET /api/v2/market/dashboard endpoint.

Tests cover:
- Successful retrieval with default and custom days
- Response structure: series registry, snapshots, meta
- Cache headers
- Validation (422) and database error (500) handling
- OpenAPI documentation

The endpoint no longer accepts a `?token=` query parameter — the response
returns all configured series via the `series` registry.
"""

from datetime import UTC, date, datetime
from unittest.mock import Mock

import pytest
from httpx import AsyncClient

from src.core.exceptions import DatabaseError
from src.main import app
from src.models.market_dashboard import (
    DashboardMeta,
    Indicator,
    MarketDashboardResponse,
    MarketSnapshot,
    SeriesDescriptor,
    SeriesFrequency,
    SeriesKind,
    SeriesPoint,
)
from src.services.dependencies import get_market_dashboard_service


def _build_dashboard_response(
    *,
    days: int = 365,
    snapshots: list[MarketSnapshot] | None = None,
) -> MarketDashboardResponse:
    """Build a minimal valid MarketDashboardResponse for test fixtures."""
    if snapshots is None:
        snapshots = [
            MarketSnapshot(
                snapshot_date=date(2025, 1, 15),
                values={
                    "btc": SeriesPoint(
                        value=95000.0,
                        indicators={"dma_200": Indicator(value=85000.0, is_above=True)},
                    ),
                    "spy": SeriesPoint(
                        value=600.0,
                        indicators={"dma_200": Indicator(value=580.0, is_above=True)},
                    ),
                    "eth_btc": SeriesPoint(
                        value=0.0532,
                        indicators={"dma_200": Indicator(value=0.0498, is_above=True)},
                    ),
                    "fgi": SeriesPoint(value=45.0, tags={"regime": "f"}),
                },
            )
        ]
    series = {
        "btc": SeriesDescriptor(
            kind=SeriesKind.asset,
            unit="usd",
            label="BTC",
            frequency=SeriesFrequency.daily,
            color_hint="#FFFFFF",
        ),
        "spy": SeriesDescriptor(
            kind=SeriesKind.asset,
            unit="usd",
            label="S&P 500 (SPY)",
            frequency=SeriesFrequency.weekdays,
            color_hint="#3B82F6",
        ),
        "eth_btc": SeriesDescriptor(
            kind=SeriesKind.ratio,
            unit="ratio",
            label="ETH/BTC",
            frequency=SeriesFrequency.daily,
            color_hint="#34D399",
        ),
        "fgi": SeriesDescriptor(
            kind=SeriesKind.gauge,
            unit="score",
            label="Fear & Greed",
            frequency=SeriesFrequency.daily,
            color_hint="#10B981",
            scale=(0.0, 100.0),
        ),
    }
    return MarketDashboardResponse(
        series=series,
        snapshots=snapshots,
        meta=DashboardMeta(
            primary_series="btc",
            days_requested=days,
            count=len(snapshots),
            timestamp=datetime.now(UTC),
        ),
    )


class TestMarketDashboardEndpointSuccess:
    """Test successful market dashboard retrieval."""

    @pytest.mark.asyncio
    async def test_default_params(self, client: AsyncClient):
        """GET /dashboard with defaults should call service with days=365 and return 200."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()

            assert "series" in data
            assert "snapshots" in data
            assert "meta" in data

            mock_service.get_market_dashboard.assert_called_once_with(days=365)
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
            mock_service.get_market_dashboard.assert_called_once_with(days=30)
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_token_query_param_is_ignored(self, client: AsyncClient):
        """The legacy ?token= param is no longer accepted by the service signature."""
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            # Extra query params are silently ignored by FastAPI
            response = await client.get("/api/v2/market/dashboard?token=eth")

            assert response.status_code == 200
            mock_service.get_market_dashboard.assert_called_once_with(days=365)
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardResponseStructure:
    """Test response structure and field types."""

    @pytest.mark.asyncio
    async def test_response_top_level_fields(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()

            assert isinstance(data["series"], dict)
            assert isinstance(data["snapshots"], list)
            assert isinstance(data["meta"], dict)
            assert data["meta"]["primary_series"] == "btc"
            assert data["meta"]["days_requested"] == 365
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_series_registry_has_descriptors(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            series = response.json()["series"]

            for sid in ("btc", "spy", "eth_btc", "fgi"):
                assert sid in series
                assert "kind" in series[sid]
                assert "unit" in series[sid]
                assert "label" in series[sid]
                assert "frequency" in series[sid]
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_snapshot_values_uniform_shape(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            snapshot = response.json()["snapshots"][0]
            assert "snapshot_date" in snapshot
            assert "values" in snapshot

            btc = snapshot["values"]["btc"]
            assert "value" in btc
            assert "indicators" in btc
            assert btc["indicators"]["dma_200"]["value"] == 85000.0
            assert btc["indicators"]["dma_200"]["is_above"] is True

            fgi = snapshot["values"]["fgi"]
            assert fgi["tags"]["regime"] == "f"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_empty_snapshots(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response(
            snapshots=[]
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            data = response.json()
            assert data["meta"]["count"] == 0
            assert data["snapshots"] == []
            # Series registry remains even when there are no snapshots
            assert "btc" in data["series"]
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardCacheHeaders:
    """Test HTTP cache headers on dashboard responses."""

    @pytest.mark.asyncio
    async def test_cache_control_header(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            cache_control = response.headers["cache-control"]
            assert "public" in cache_control
            assert "max-age=3600" in cache_control
            assert "stale-while-revalidate=21600" in cache_control
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_cors_header(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == "*"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)

    @pytest.mark.asyncio
    async def test_vary_header(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.return_value = _build_dashboard_response()

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 200
            assert response.headers["vary"] == "Accept-Encoding"
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardErrorHandling:
    """Test error handling and query parameter validation."""

    @pytest.mark.asyncio
    async def test_invalid_days_zero(self, client: AsyncClient):
        response = await client.get("/api/v2/market/dashboard?days=0")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_days_not_integer(self, client: AsyncClient):
        response = await client.get("/api/v2/market/dashboard?days=abc")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_database_error_returns_500(self, client: AsyncClient):
        mock_service = Mock()
        mock_service.get_market_dashboard.side_effect = DatabaseError(
            message="Failed to fetch market dashboard data", is_transient=False
        )

        app.dependency_overrides[get_market_dashboard_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/dashboard")

            assert response.status_code == 500
        finally:
            app.dependency_overrides.pop(get_market_dashboard_service, None)


class TestMarketDashboardOpenAPIDocumentation:
    """Test that OpenAPI schema documents the endpoint correctly."""

    @pytest.mark.asyncio
    async def test_openapi_schema_includes_endpoint(self, client: AsyncClient):
        response = await client.get("/openapi.json")
        assert response.status_code == 200
        schema = response.json()
        assert "/api/v2/market/dashboard" in schema["paths"]

    @pytest.mark.asyncio
    async def test_openapi_schema_documents_parameters(self, client: AsyncClient):
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

        # token param should no longer exist
        token_param = next((p for p in params if p["name"] == "token"), None)
        assert token_param is None

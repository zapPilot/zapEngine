"""
Comprehensive tests for GET /api/v2/market/regime/history endpoint.

Tests cover:
- Successful retrieval with various limit values
- Response structure and data validation
- Cache headers verification
- 404 error when no data exists
- 500 error on database failure
- Query parameter validation
- OpenAPI documentation
- Direction calculation in responses

Coverage target: 85%+
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest
from httpx import AsyncClient

from src.core.exceptions import DatabaseError, DataNotFoundError
from src.main import app
from src.models.regime_tracking import (
    DirectionType,
    DurationInfo,
    RegimeHistoryResponse,
    RegimeId,
    RegimeTransition,
)
from src.services.dependencies import get_regime_tracking_service


class TestRegimeHistoryEndpointSuccess:
    """Test successful regime history retrieval."""

    @pytest.fixture
    def mock_regime_history_response(self):
        """Create mock RegimeHistoryResponse."""
        now = datetime.now(UTC)
        current = RegimeTransition(
            id="550e8400-e29b-41d4-a716-446655440000",
            from_regime=RegimeId.f,
            to_regime=RegimeId.n,
            sentiment_value=48,
            transitioned_at=now,
            duration_hours=None,
        )
        previous = RegimeTransition(
            id="450e8400-e29b-41d4-a716-446655440000",
            from_regime=RegimeId.ef,
            to_regime=RegimeId.f,
            sentiment_value=30,
            transitioned_at=now - timedelta(hours=50),
            duration_hours=50.5,
        )

        return RegimeHistoryResponse(
            current=current,
            previous=previous,
            direction=DirectionType.fromLeft,
            duration_in_current=DurationInfo(
                hours=51.5, days=2.1, human_readable="2 days, 3 hours"
            ),
            transitions=[current, previous],
            timestamp=now,
            cached=False,
        )

    @pytest.mark.asyncio
    async def test_get_regime_history_default_limit(
        self, client: AsyncClient, mock_regime_history_response
    ):
        """GET /regime/history should return regime history with default limit=2."""
        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_regime_history_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()

            # Verify response structure
            assert "current" in data
            assert "previous" in data
            assert "direction" in data
            assert "duration_in_current" in data
            assert "transitions" in data
            assert "timestamp" in data
            assert "cached" in data

            # Verify current regime
            assert data["current"]["to_regime"] == "n"
            assert data["current"]["sentiment_value"] == 48

            # Verify previous regime
            assert data["previous"]["to_regime"] == "f"
            assert data["previous"]["sentiment_value"] == 30

            # Verify direction
            assert data["direction"] == "fromLeft"

            # Verify service was called with default limit
            mock_service.get_regime_history.assert_called_once_with(limit=2)
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_get_regime_history_custom_limit(
        self, client: AsyncClient, mock_regime_history_response
    ):
        """GET /regime/history with custom limit should pass limit to service."""
        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_regime_history_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history?limit=10")

            assert response.status_code == 200
            mock_service.get_regime_history.assert_called_once_with(limit=10)
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_get_regime_history_max_limit(
        self, client: AsyncClient, mock_regime_history_response
    ):
        """GET /regime/history should accept max limit of 100."""
        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_regime_history_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history?limit=100")

            assert response.status_code == 200
            mock_service.get_regime_history.assert_called_once_with(limit=100)
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_get_regime_history_min_limit(
        self, client: AsyncClient, mock_regime_history_response
    ):
        """GET /regime/history should accept min limit of 1."""
        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_regime_history_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history?limit=1")

            assert response.status_code == 200
            mock_service.get_regime_history.assert_called_once_with(limit=1)
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)


class TestRegimeHistoryResponseStructure:
    """Test response structure and data validation."""

    @pytest.fixture
    def mock_single_transition_response(self):
        """Mock response with only current regime (no previous)."""
        now = datetime.now(UTC)
        current = RegimeTransition(
            id="550e8400-e29b-41d4-a716-446655440000",
            from_regime=None,
            to_regime=RegimeId.n,
            sentiment_value=50,
            transitioned_at=now,
            duration_hours=None,
        )

        return RegimeHistoryResponse(
            current=current,
            previous=None,
            direction=DirectionType.default,
            duration_in_current=DurationInfo(
                hours=0.5, days=0.02, human_readable="30 minutes"
            ),
            transitions=[current],
            timestamp=now,
            cached=False,
        )

    @pytest.mark.asyncio
    async def test_regime_history_with_null_previous(
        self, client: AsyncClient, mock_single_transition_response
    ):
        """Response should handle null previous regime (first transition)."""
        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_single_transition_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()

            assert data["previous"] is None
            assert data["direction"] == "default"
            assert len(data["transitions"]) == 1
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_regime_history_duration_structure(self, client: AsyncClient):
        """Duration info should have correct structure."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=None,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=None,
            direction=DirectionType.default,
            duration_in_current=DurationInfo(
                hours=25.5, days=1.06, human_readable="1 day, 1 hour"
            ),
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()
            duration = data["duration_in_current"]

            assert "hours" in duration
            assert "days" in duration
            assert "human_readable" in duration
            assert duration["human_readable"] == "1 day, 1 hour"
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_regime_history_transition_structure(self, client: AsyncClient):
        """Transition objects should have complete structure."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="550e8400-e29b-41d4-a716-446655440000",
                from_regime=RegimeId.f,
                to_regime=RegimeId.n,
                sentiment_value=48,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=None,
            direction=DirectionType.fromLeft,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()
            current = data["current"]

            assert "id" in current
            assert "from_regime" in current
            assert "to_regime" in current
            assert "sentiment_value" in current
            assert "transitioned_at" in current
            assert "duration_hours" in current
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)


class TestRegimeHistoryCacheHeaders:
    """Test HTTP cache headers."""

    @pytest.mark.asyncio
    async def test_cache_control_header(self, client: AsyncClient):
        """Response should include Cache-Control header."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=None,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=None,
            direction=DirectionType.default,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            assert "cache-control" in response.headers
            cache_control = response.headers["cache-control"]
            assert "public" in cache_control
            assert "max-age=60" in cache_control
            assert "stale-while-revalidate=300" in cache_control
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_cors_headers(self, client: AsyncClient):
        """Response should include CORS headers."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=None,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=None,
            direction=DirectionType.default,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            assert "access-control-allow-origin" in response.headers
            assert response.headers["access-control-allow-origin"] == "*"
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_vary_header(self, client: AsyncClient):
        """Response should include Vary header."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=None,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=None,
            direction=DirectionType.default,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            assert "vary" in response.headers
            assert response.headers["vary"] == "Accept-Encoding"
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)


class TestRegimeHistoryErrorHandling:
    """Test error handling and edge cases."""

    @pytest.mark.asyncio
    async def test_no_data_returns_404(self, client: AsyncClient):
        """Should return 404 when no regime transitions exist."""
        mock_service = Mock()
        mock_service.get_regime_history.side_effect = DataNotFoundError(
            message="No regime transitions found. Run backfill script to initialize."
        )

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 404
            data = response.json()

            assert "error_code" in data or "detail" in data or "message" in data
            # Error message should mention backfill
            error_text = str(data).lower()
            assert "regime transitions" in error_text or "not found" in error_text
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_database_error_returns_500(self, client: AsyncClient):
        """Should return 500 on database error."""
        mock_service = Mock()
        mock_service.get_regime_history.side_effect = DatabaseError(
            message="Failed to fetch regime history", is_transient=False
        )

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 500
            data = response.json()

            assert "error_code" in data or "detail" in data or "message" in data
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_invalid_limit_too_low(self, client: AsyncClient):
        """Should reject limit < 1."""
        response = await client.get("/api/v2/market/regime/history?limit=0")
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_invalid_limit_too_high(self, client: AsyncClient):
        """Should reject limit > 100."""
        response = await client.get("/api/v2/market/regime/history?limit=101")
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_invalid_limit_not_integer(self, client: AsyncClient):
        """Should reject non-integer limit."""
        response = await client.get("/api/v2/market/regime/history?limit=abc")
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_invalid_limit_float(self, client: AsyncClient):
        """Should reject float limit."""
        response = await client.get("/api/v2/market/regime/history?limit=5.5")
        assert response.status_code == 422  # Validation error


class TestRegimeHistoryDirectionCalculation:
    """Test direction calculation in API responses."""

    @pytest.mark.asyncio
    async def test_direction_from_left_recovery(self, client: AsyncClient):
        """Response should show fromLeft for recovery transitions."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=RegimeId.ef,
                to_regime=RegimeId.f,
                sentiment_value=30,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=RegimeTransition(
                id="2",
                from_regime=None,
                to_regime=RegimeId.ef,
                sentiment_value=20,
                transitioned_at=now - timedelta(hours=10),
                duration_hours=10.0,
            ),
            direction=DirectionType.fromLeft,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()
            assert data["direction"] == "fromLeft"
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_direction_from_right_decline(self, client: AsyncClient):
        """Response should show fromRight for decline transitions."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=RegimeId.g,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=RegimeTransition(
                id="2",
                from_regime=RegimeId.eg,
                to_regime=RegimeId.g,
                sentiment_value=70,
                transitioned_at=now - timedelta(hours=10),
                duration_hours=10.0,
            ),
            direction=DirectionType.fromRight,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()
            assert data["direction"] == "fromRight"
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_direction_default_first_transition(self, client: AsyncClient):
        """Response should show default for first transition."""
        now = datetime.now(UTC)
        mock_response = RegimeHistoryResponse(
            current=RegimeTransition(
                id="1",
                from_regime=None,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now,
                duration_hours=None,
            ),
            previous=None,
            direction=DirectionType.default,
            duration_in_current=None,
            transitions=[],
            timestamp=now,
            cached=False,
        )

        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history")

            assert response.status_code == 200
            data = response.json()
            assert data["direction"] == "default"
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)


class TestRegimeHistoryOpenAPIDocumentation:
    """Test OpenAPI/Swagger documentation."""

    @pytest.mark.asyncio
    async def test_openapi_schema_includes_endpoint(self, client: AsyncClient):
        """OpenAPI schema should document the endpoint."""
        response = await client.get("/openapi.json")

        assert response.status_code == 200
        schema = response.json()

        # Check endpoint exists in schema
        assert "/api/v2/market/regime/history" in schema["paths"]

    @pytest.mark.asyncio
    async def test_openapi_schema_documents_responses(self, client: AsyncClient):
        """OpenAPI schema should document all response codes."""
        response = await client.get("/openapi.json")
        schema = response.json()

        endpoint = schema["paths"]["/api/v2/market/regime/history"]["get"]

        # Check documented responses
        assert "200" in endpoint["responses"]
        assert "404" in endpoint["responses"]
        assert "500" in endpoint["responses"]

    @pytest.mark.asyncio
    async def test_openapi_schema_documents_parameters(self, client: AsyncClient):
        """OpenAPI schema should document query parameters."""
        response = await client.get("/openapi.json")
        schema = response.json()

        endpoint = schema["paths"]["/api/v2/market/regime/history"]["get"]

        # Check limit parameter
        params = endpoint.get("parameters", [])
        limit_param = next((p for p in params if p["name"] == "limit"), None)

        assert limit_param is not None
        assert limit_param["in"] == "query"
        assert limit_param["schema"]["default"] == 2
        assert limit_param["schema"]["minimum"] == 1
        assert limit_param["schema"]["maximum"] == 100

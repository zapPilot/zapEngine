"""
Tests for market regime and token price endpoints in `src.api.routers.market`.

Covers:
- GET /market/regime
- GET /market/btc/history
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest
from httpx import AsyncClient

from src.main import app
from src.models.regime_tracking import (
    DirectionType,
    DurationInfo,
    RegimeHistoryResponse,
    RegimeId,
    RegimeTransition,
)
from src.models.token_price import TokenPriceSnapshot
from src.services.dependencies import (
    get_regime_tracking_service,
    get_token_price_service,
)


class TestMarketRegimeAndBtcEndpoints:
    """Tests for regime tracking and token price history endpoints."""

    @pytest.fixture
    def mock_regime_history_response(self):
        """Standard mock regime history response."""
        now = datetime.now(UTC)
        return RegimeHistoryResponse(
            current=RegimeTransition(
                id="curr-1",
                from_regime=RegimeId.n,
                to_regime=RegimeId.g,
                sentiment_value=60,
                transitioned_at=now,
            ),
            previous=RegimeTransition(
                id="prev-1",
                from_regime=RegimeId.f,
                to_regime=RegimeId.n,
                sentiment_value=50,
                transitioned_at=now - timedelta(days=1),
                duration_hours=24.0,
            ),
            direction=DirectionType.fromLeft,  # Moving towards Greed
            duration_in_current=DurationInfo(
                hours=24,
                days=1.0,
                human_readable="1 day",
            ),
            transitions=[],
            timestamp=now,
            cached=False,
        )

    @pytest.fixture
    def mock_token_price_history(self):
        """Standard mock token price history list."""
        now = datetime.now(UTC)
        # Dates passed as strings to match model expectation if needed,
        # but model says date: str. Let's ensure consistency.
        # Service returns TokenPriceSnapshot objects where date might be str or date?
        # Model says `date: str`. Service likely constructs it.
        d1 = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        d2 = now.strftime("%Y-%m-%d")

        return [
            TokenPriceSnapshot(
                date=d1,
                price_usd=50000.0,
                volume_24h_usd=1000000.0,
                market_cap_usd=1000000000.0,
                token_symbol="BTC",
                source="coingecko",
                token_id="bitcoin",
            ),
            TokenPriceSnapshot(
                date=d2,
                price_usd=51000.0,
                volume_24h_usd=1100000.0,
                market_cap_usd=1020000000.0,
                token_symbol="BTC",
                source="coingecko",
                token_id="bitcoin",
            ),
        ]

    @pytest.mark.asyncio
    async def test_get_regime_history(
        self, client: AsyncClient, mock_regime_history_response
    ):
        """GET /market/regime should return regime history with direction."""
        mock_service = Mock()
        # Note: get_regime_history might be async or sync depending on implementation.
        # Based on previous file reads, it seemed to be a synchronous method in the service
        # but called in an async path?
        # Check market.py: response = service.get_regime_history(limit=limit)
        # It's likely synchronous based on `RegimeTrackingService` outline.
        mock_service.get_regime_history.return_value = mock_regime_history_response

        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/regime/history?limit=2")

            assert response.status_code == 200
            data = response.json()

            # Verify structure
            assert "current" in data
            assert "previous" in data
            assert "direction" in data
            assert "duration_in_current" in data

            # Verify values
            assert data["current"]["to_regime"] == "g"
            assert data["direction"] == "fromLeft"
            assert data["duration_in_current"]["hours"] == 24

            # Verify service call
            mock_service.get_regime_history.assert_called_once_with(limit=2)

        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_get_regime_history_defaults(
        self, client: AsyncClient, mock_regime_history_response
    ):
        """GET /market/regime should use default limit."""
        mock_service = Mock()
        mock_service.get_regime_history.return_value = mock_regime_history_response
        app.dependency_overrides[get_regime_tracking_service] = lambda: mock_service

        try:
            await client.get("/api/v2/market/regime/history")
            # Default limit is 2 defined in router
            mock_service.get_regime_history.assert_called_with(limit=2)
        finally:
            app.dependency_overrides.pop(get_regime_tracking_service, None)

    @pytest.mark.asyncio
    async def test_get_token_price_history(
        self, client: AsyncClient, mock_token_price_history
    ):
        """GET /market/btc/history should return price snapshots."""
        mock_service = Mock()
        # Service method is get_price_history(days=..., token_symbol=...)
        mock_service.get_price_history.return_value = mock_token_price_history

        app.dependency_overrides[get_token_price_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/btc/history?days=30&token=btc")

            assert response.status_code == 200
            data = response.json()

            assert "snapshots" in data
            assert data["count"] == 2
            assert len(data["snapshots"]) == 2

            assert data["snapshots"][0]["price_usd"] == 50000.0
            assert data["snapshots"][1]["price_usd"] == 51000.0
            assert data["snapshots"][0]["token_symbol"] == "BTC"

            # Verify cache headers
            assert "cache-control" in response.headers
            assert "max-age=3600" in response.headers["cache-control"]

            # Verify validation
            mock_service.get_price_history.assert_called_once_with(
                days=30, token_symbol="BTC"
            )

        finally:
            app.dependency_overrides.pop(get_token_price_service, None)

    @pytest.mark.asyncio
    async def test_get_token_price_history_validation(self, client: AsyncClient):
        """GET /market/btc/history should validate the 1-2000 days range."""
        mock_service = Mock()
        app.dependency_overrides[get_token_price_service] = lambda: mock_service

        try:
            # Test invalid days (too high)
            response = await client.get("/api/v2/market/btc/history?days=2001")
            assert response.status_code == 422  # Validation error

            # Test invalid days (too low)
            response = await client.get("/api/v2/market/btc/history?days=0")
            assert response.status_code == 422

        finally:
            app.dependency_overrides.pop(get_token_price_service, None)

    @pytest.mark.asyncio
    async def test_get_token_price_history_not_found(self, client: AsyncClient):
        """GET /market/btc/history should return 404 if no data found."""
        mock_service = Mock()
        mock_service.get_price_history.return_value = []  # Empty list

        app.dependency_overrides[get_token_price_service] = lambda: mock_service

        try:
            response = await client.get("/api/v2/market/btc/history?days=30&token=sol")
            assert response.status_code == 404
            data = response.json()
            assert "detail" in data
            assert "Run ETL backfill" in data["detail"]
        finally:
            app.dependency_overrides.pop(get_token_price_service, None)

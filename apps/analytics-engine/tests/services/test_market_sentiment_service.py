"""
Unit tests for MarketSentimentService to improve coverage.

Focuses on:
- Error handling (4xx, 5xx)
- Database fallback logic
- Edge cases in response transformation
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from src.services.market.market_sentiment_service import (
    MarketSentimentConfig,
    MarketSentimentService,
)


@pytest.fixture
def mock_config():
    return MarketSentimentConfig(
        api_url="http://test-api.com",
        timeout_seconds=5.0,
        cache_ttl=timedelta(minutes=5),
        user_agent="TestAgent",
    )


@pytest.fixture
def mock_db_service():
    service = Mock()
    service.get_current_sentiment = AsyncMock()
    return service


@pytest.fixture
def service(mock_config, mock_db_service):
    return MarketSentimentService(
        config=mock_config, db_service=mock_db_service, use_database=True
    )


class TestMarketSentimentServiceCoverage:
    """Tests targeting uncovered lines in MarketSentimentService."""

    @pytest.mark.asyncio
    async def test_handle_http_4xx_error(self, service):
        """Test handling of 4xx client errors via _fetch_from_external_api."""
        with patch.object(service, "_http_client") as mock_client_ctx:
            mock_client = AsyncMock()
            mock_client.get.return_value = Mock(
                status_code=429, text="Too Many Requests"
            )
            mock_client_ctx.return_value.__aenter__.return_value = mock_client

            with pytest.raises(HTTPException) as exc:
                await service._fetch_from_external_api()

            assert exc.value.status_code == 502  # BadGatewayError maps to 502
            assert exc.value.detail["error"] == "BAD_GATEWAY"
            assert "429" in exc.value.detail["details"]["reason"]

    @pytest.mark.asyncio
    async def test_handle_unexpected_status_code(self, service):
        """Test handling of unexpected status codes (e.g. 3xx) via _fetch_from_external_api."""
        with patch.object(service, "_http_client") as mock_client_ctx:
            mock_client = AsyncMock()
            mock_client.get.return_value = Mock(
                status_code=300, text="Multiple Choices"
            )
            mock_client_ctx.return_value.__aenter__.return_value = mock_client

            with pytest.raises(HTTPException) as exc:
                await service._fetch_from_external_api()

            assert exc.value.status_code == 500  # InternalError maps to 500
            assert (
                "Unexpected HTTP status: 300" in exc.value.detail["details"]["reason"]
            )

    @pytest.mark.asyncio
    async def test_database_fallback_failure(self, service, mock_db_service):
        """Test that service falls back to API when database fails (and logs warning)."""
        # Mock DB failure
        mock_db_service.get_current_sentiment.side_effect = Exception(
            "DB Connection Failed"
        )

        # Mock External API success
        with patch.object(service, "_fetch_from_external_api") as mock_fetch:
            mock_fetch.return_value = Mock(
                data=[
                    Mock(
                        value="50",
                        value_classification="Neutral",
                        timestamp="1600000000",
                    )
                ]
            )

            # Clear cache to ensure logic runs
            with patch(
                "src.services.market.market_sentiment_service.analytics_cache"
            ) as mock_cache:
                mock_cache.get.return_value = None
                mock_cache.build_key.return_value = "key"

                # Execute
                result = await service.get_market_sentiment()

                # Verify DB called
                mock_db_service.get_current_sentiment.assert_called_once()

                # Verify Fallback to API
                mock_fetch.assert_called_once()

                assert result.value == 50
                assert result.source == "alternative.me"

    @pytest.mark.asyncio
    async def test_health_status_timestamp_parsing_edge_case(self, service):
        """Test health status when cached timestamp is NOT a string (already datetime)."""
        now = datetime.now(UTC)

        with patch(
            "src.services.market.market_sentiment_service.analytics_cache"
        ) as mock_cache:
            mock_cache.build_key.return_value = "key"
            # Return dict with datetime object, not string
            mock_cache.get.return_value = {
                "value": 50,
                "status": "Neutral",
                "timestamp": now,  # Object, not ISO string
                "cached": True,
            }

            health = service.get_health_status()

            assert health.cached is True
            assert health.last_update == now
            # Age should be near 0
            assert health.cache_age_seconds is not None
            assert health.cache_age_seconds < 5

    @pytest.mark.asyncio
    async def test_fetch_exception_handling(self, service):
        """Test exception handling in _fetch_from_external_api."""

        # Test unexpected exception
        with patch.object(service, "_http_client") as mock_client_ctx:
            mock_client_ctx.side_effect = Exception("Unexpected network explosion")

            with pytest.raises(HTTPException) as exc:
                await service._fetch_from_external_api()

            assert exc.value.status_code == 500
            assert "Unexpected error" in str(exc.value.detail)

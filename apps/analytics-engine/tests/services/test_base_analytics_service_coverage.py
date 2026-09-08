"""Supplemental tests for BaseAnalyticsService coverage."""

from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest

from src.core.cache_service import analytics_cache
from src.services.shared.base_analytics_service import BaseAnalyticsService


@pytest.fixture
def service(mock_db, mock_query_service):
    return BaseAnalyticsService(mock_db, mock_query_service)


def test_execute_query_one(service, mock_query_service):
    """Test execute_query_one calls query service correctly."""
    params = {"id": 1}
    service._execute_query_one("test_query", params=params)
    mock_query_service.execute_query_one.assert_called_with(
        service.db, "test_query", params
    )


def test_with_cache_tolerates_store_failure(service):
    """A failing cache write must not lose the freshly computed value."""

    def broken_set(key, value, ttl=None):
        raise Exception("Cache set failed")

    with patch.object(analytics_cache, "set", broken_set):
        assert service._with_cache("key", lambda: "value") == "value"


@patch("src.services.shared.base_analytics_service.settings")
@pytest.mark.asyncio
async def test_with_async_cache_disabled(mock_settings, service):
    """Test _with_async_cache executes fetcher directly when cache disabled."""
    mock_settings.analytics_cache_enabled = False

    mock_fetcher = AsyncMock(return_value="data")

    result = await service._with_async_cache("key", mock_fetcher)

    assert result == "data"
    mock_fetcher.assert_awaited_once()


@patch("src.services.shared.base_analytics_service.analytics_cache")
@pytest.mark.asyncio
async def test_with_async_cache_tolerates_store_failure(mock_cache, service):
    """A failing cache write must not lose the awaited result."""
    mock_cache.get.return_value = None
    mock_cache.set.side_effect = Exception("Cache set failed")

    result = await service._with_async_cache("key", AsyncMock(return_value="data"))

    assert result == "data"
    mock_cache.set.assert_called_once()


def test_json_safe_timedelta(service):
    """Test _json_safe converts timedelta to total seconds."""
    td = timedelta(hours=1, minutes=30)
    result = service._json_safe(td)
    assert result == 5400.0  # 1.5 * 3600

"""Supplemental tests for BaseAnalyticsService coverage."""

from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.shared.base_analytics_service import BaseAnalyticsService


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_query_service():
    service = MagicMock()
    return service


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


@patch("src.services.shared.base_analytics_service.analytics_cache")
def test_store_in_cache_exception(mock_cache, service):
    """Test exception during cache set is logged and suppressed."""
    mock_cache.set.side_effect = Exception("Cache set failed")
    # This shouldn't raise
    service._store_in_cache("key", "value", timedelta(hours=1))
    mock_cache.set.assert_called_once()


@patch("src.services.shared.base_analytics_service.settings")
@pytest.mark.asyncio
async def test_with_async_cache_disabled(mock_settings, service):
    """Test _with_async_cache executes fetcher directly when cache disabled."""
    mock_settings.analytics_cache_enabled = False

    mock_fetcher = AsyncMock(return_value="data")

    result = await service._with_async_cache("key", mock_fetcher)

    assert result == "data"
    mock_fetcher.assert_awaited_once()


def test_json_safe_timedelta(service):
    """Test _json_safe converts timedelta to total seconds."""
    td = timedelta(hours=1, minutes=30)
    result = service._json_safe(td)
    assert result == 5400.0  # 1.5 * 3600

"""
Comprehensive unit tests for BaseAnalyticsService.

Tests cover cache wrapper methods (_with_cache, _with_async_cache), JSON
serialization (_json_safe), and query caching utilities. Targets 95%+ coverage
for base analytics infrastructure used by all analytics services.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.services.shared.base_analytics_service import BaseAnalyticsService

# ==================== FIXTURES ====================


@pytest.fixture
def mock_cache():
    """Mock CacheService with configurable get/set behavior."""
    cache = MagicMock()
    cache.get.return_value = None  # Default: cache miss
    return cache


@pytest.fixture
def mock_db_session():
    """Mock async SQLAlchemy session."""
    return AsyncMock()


@pytest.fixture
def mock_query_service():
    """Mock QueryService for database operations."""
    service = MagicMock()
    service.execute_query.return_value = []
    return service


@pytest.fixture
def analytics_service(mock_db_session, mock_query_service):
    """BaseAnalyticsService with mocked dependencies."""
    service = BaseAnalyticsService(db=mock_db_session, query_service=mock_query_service)
    return service


@pytest.fixture
def sample_query_rows() -> list[dict[str, Any]]:
    """Sample database rows with datetime/Decimal types."""
    return [
        {"date": datetime(2024, 1, 1), "value": Decimal("100.50")},
        {"date": datetime(2024, 1, 2), "value": Decimal("200.75")},
    ]


# ==================== _with_cache() TESTS ====================


@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
def test_with_cache_hit(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify cache hit returns cached value without calling fetcher."""
    mock_settings.analytics_cache_enabled = True
    cached_value = {"data": "from_cache"}
    mock_cache.get.return_value = cached_value

    fetcher_called = False

    def fetcher():
        nonlocal fetcher_called
        fetcher_called = True
        return {"data": "from_fetcher"}

    result = analytics_service._with_cache("test_key", fetcher)

    assert result == cached_value
    assert not fetcher_called  # Fetcher should not be called on cache hit
    mock_cache.get.assert_called_once_with("test_key")


@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
def test_with_cache_miss(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify cache miss calls fetcher and stores result."""
    mock_settings.analytics_cache_enabled = True
    mock_settings.analytics_cache_default_ttl_hours = 12
    mock_cache.get.return_value = None  # Cache miss
    fetcher_result = {"data": "from_fetcher"}

    def fetcher():
        return fetcher_result

    result = analytics_service._with_cache("test_key", fetcher)

    assert result == fetcher_result
    mock_cache.get.assert_called_once_with("test_key")
    mock_cache.set.assert_called_once()


@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
def test_with_cache_exception_fallback(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify cache.get() exception falls back to fetcher."""
    mock_settings.analytics_cache_enabled = True
    mock_settings.analytics_cache_default_ttl_hours = 12
    mock_cache.get.side_effect = Exception("Cache error")
    fetcher_result = {"data": "from_fetcher"}

    def fetcher():
        return fetcher_result

    result = analytics_service._with_cache("test_key", fetcher)

    assert result == fetcher_result
    mock_cache.get.assert_called_once()


@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
def test_with_cache_ttl_override(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify custom ttl_hours is passed to cache.set()."""
    mock_settings.analytics_cache_enabled = True
    mock_cache.get.return_value = None  # Cache miss
    fetcher_result = {"data": "test"}

    def fetcher():
        return fetcher_result

    analytics_service._with_cache("test_key", fetcher, ttl_hours=6)

    # Verify set was called with custom TTL (6 hours = timedelta(hours=6))
    mock_cache.set.assert_called_once()
    call_args = mock_cache.set.call_args
    assert call_args[0][0] == "test_key"  # First positional arg: key
    assert call_args[0][2] == timedelta(hours=6)  # Third positional arg: ttl


@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
def test_with_cache_default_ttl(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify default 12-hour TTL when ttl_hours not specified."""
    mock_settings.analytics_cache_enabled = True
    mock_settings.analytics_cache_default_ttl_hours = 12
    mock_cache.get.return_value = None
    fetcher_result = {"data": "test"}

    def fetcher():
        return fetcher_result

    analytics_service._with_cache("test_key", fetcher)

    # Verify set was called with default TTL (12 hours)
    mock_cache.set.assert_called_once()
    call_args = mock_cache.set.call_args
    assert call_args[0][2] == timedelta(hours=12)


# ==================== _with_async_cache() TESTS ====================


@pytest.mark.asyncio
@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
async def test_async_cache_hit(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify async cache hit returns cached value without calling fetcher."""
    mock_settings.analytics_cache_enabled = True
    cached_value = {"data": "from_cache"}
    mock_cache.get.return_value = cached_value

    fetcher_called = False

    async def async_fetcher():
        nonlocal fetcher_called
        fetcher_called = True
        return {"data": "from_fetcher"}

    result = await analytics_service._with_async_cache("test_key", async_fetcher)

    assert result == cached_value
    assert not fetcher_called
    mock_cache.get.assert_called_once_with("test_key")


@pytest.mark.asyncio
@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
async def test_async_cache_miss_calls_awaitable(
    mock_settings, mock_cache, analytics_service: BaseAnalyticsService
):
    """Verify async cache miss awaits async fetcher."""
    mock_settings.analytics_cache_enabled = True
    mock_settings.analytics_cache_default_ttl_hours = 12
    mock_cache.get.return_value = None
    fetcher_result = {"data": "from_fetcher"}

    async def async_fetcher():
        return fetcher_result

    result = await analytics_service._with_async_cache("test_key", async_fetcher)

    assert result == fetcher_result
    mock_cache.get.assert_called_once()
    mock_cache.set.assert_called_once()


@pytest.mark.asyncio
async def test_async_cache_exception_handling(
    analytics_service: BaseAnalyticsService, mock_cache
):
    """Verify async cache exception falls back to fetcher."""
    mock_cache.get.side_effect = Exception("Cache error")
    fetcher_result = {"data": "from_fetcher"}

    async def async_fetcher():
        return fetcher_result

    result = await analytics_service._with_async_cache("test_key", async_fetcher)

    assert result == fetcher_result


# ==================== _json_safe() TESTS ====================


def test_json_safe_datetime():
    """Verify datetime objects convert to ISO8601 strings."""
    dt = datetime(2024, 1, 15, 10, 30, 45)
    result = BaseAnalyticsService._json_safe(dt)

    assert isinstance(result, str)
    assert result == "2024-01-15T10:30:45"


def test_json_safe_date():
    """Verify date objects convert to YYYY-MM-DD strings."""
    d = date(2024, 1, 15)
    result = BaseAnalyticsService._json_safe(d)

    assert isinstance(result, str)
    assert result == "2024-01-15"


def test_json_safe_decimal():
    """Verify Decimal objects convert to float."""
    dec = Decimal("123.456")
    result = BaseAnalyticsService._json_safe(dec)

    assert isinstance(result, float)
    assert result == 123.456


def test_json_safe_uuid():
    """Verify UUID objects convert to string."""
    test_uuid = uuid4()
    result = BaseAnalyticsService._json_safe(test_uuid)

    assert isinstance(result, str)
    assert result == str(test_uuid)


def test_json_safe_nested_dict():
    """Verify recursive JSON serialization for nested structures."""
    nested_data = {
        "timestamp": datetime(2024, 1, 1, 12, 0, 0),
        "date": date(2024, 1, 1),
        "amount": Decimal("100.50"),
        "user_id": uuid4(),
        "metadata": {
            "created_at": datetime(2024, 1, 2, 10, 0, 0),
            "value": Decimal("50.25"),
        },
        "values": [datetime(2024, 1, 3), Decimal("25.10")],
    }

    result = BaseAnalyticsService._json_safe(nested_data)

    assert isinstance(result, dict)
    assert isinstance(result["timestamp"], str)
    assert isinstance(result["date"], str)
    assert isinstance(result["amount"], float)
    assert isinstance(result["user_id"], str)
    assert isinstance(result["metadata"]["created_at"], str)
    assert isinstance(result["metadata"]["value"], float)
    assert isinstance(result["values"][0], str)
    assert isinstance(result["values"][1], float)


# ==================== _cached_query_with_row_conversion() TESTS ====================


def test_cached_query_with_conversion(
    analytics_service: BaseAnalyticsService,
    mock_cache,
    mock_query_service,
    sample_query_rows,
):
    """Verify cached query execution with row conversion."""
    mock_cache.get.return_value = None  # Cache miss
    mock_query_service.execute_query.return_value = sample_query_rows

    def params_factory(start_date: datetime, end_date: datetime) -> dict[str, Any]:
        return {"start_date": start_date, "end_date": end_date, "user_id": "test_user"}

    result = analytics_service._cached_query_with_row_conversion(
        cache_key_parts=("test", "query"),
        query_name="test_query",
        days=30,
        params_factory=params_factory,
    )

    # Verify query was executed
    mock_query_service.execute_query.assert_called_once()

    # Verify result has JSON-safe converted values
    assert isinstance(result, list)
    assert len(result) == 2
    assert isinstance(result[0]["date"], str)  # datetime converted to string
    assert isinstance(result[0]["value"], float)  # Decimal converted to float


@patch("src.services.shared.base_analytics_service.analytics_cache")
@patch("src.services.shared.base_analytics_service.settings")
def test_cached_query_uses_params_factory(
    mock_settings,
    mock_cache,
    analytics_service: BaseAnalyticsService,
    mock_query_service,
    sample_query_rows,
):
    """Verify params_factory is called with correct date range."""
    mock_settings.analytics_cache_enabled = True
    mock_settings.analytics_cache_default_ttl_hours = 12
    mock_cache.get.return_value = None
    mock_query_service.execute_query.return_value = sample_query_rows

    params_received: dict[str, Any] | None = None

    def params_factory(start_date: datetime, end_date: datetime) -> dict[str, Any]:
        nonlocal params_received
        params_received = {
            "start_date": start_date,
            "end_date": end_date,
            "user_id": "test_user",
        }
        return params_received

    analytics_service._cached_query_with_row_conversion(
        cache_key_parts=("test", "query"),
        query_name="test_query",
        days=30,
        params_factory=params_factory,
    )

    # Verify params_factory was called
    assert params_received is not None
    assert "start_date" in params_received
    assert "end_date" in params_received
    assert isinstance(params_received["start_date"], datetime)
    assert isinstance(params_received["end_date"], datetime)

    # Verify query was called with params (query_service.execute_query takes db, query_name, params)
    mock_query_service.execute_query.assert_called_once()
    call_args = mock_query_service.execute_query.call_args
    # Args are (db, query_name, params)
    assert call_args[0][1] == "test_query"  # query_name is second arg
    assert call_args[0][2] == params_received  # params is third arg

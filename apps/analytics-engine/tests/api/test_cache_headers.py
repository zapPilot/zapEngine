"""
Comprehensive unit tests for cache header utilities.

Tests cover environment-specific behavior, cache control value generation,
and response header application. Targets 100% coverage for HTTP caching
infrastructure.
"""

from unittest.mock import patch

from fastapi import Response

from src.api.cache_headers import apply_cache_headers, get_cache_control_value

# ==================== GET_CACHE_CONTROL_VALUE TESTS ====================


@patch("src.api.cache_headers.settings")
def test_get_cache_control_value_development_mode(mock_settings):
    """Verify development mode returns no-store."""
    mock_settings.is_development = True
    mock_settings.debug = False

    result = get_cache_control_value()

    assert result == "no-store"


@patch("src.api.cache_headers.settings")
def test_get_cache_control_value_debug_mode(mock_settings):
    """Verify debug mode returns no-store."""
    mock_settings.is_development = False
    mock_settings.debug = True

    result = get_cache_control_value()

    assert result == "no-store"


@patch("src.api.cache_headers.settings")
def test_get_cache_control_value_production_mode(mock_settings):
    """Verify production mode returns proper cache control."""
    mock_settings.is_development = False
    mock_settings.debug = False
    mock_settings.http_cache_max_age_seconds = 300
    mock_settings.http_cache_stale_while_revalidate_seconds = 600

    result = get_cache_control_value()

    assert result == "public, max-age=300, stale-while-revalidate=600"
    assert "public" in result
    assert "max-age=300" in result
    assert "stale-while-revalidate=600" in result


@patch("src.api.cache_headers.settings")
def test_get_cache_control_value_production_custom_values(mock_settings):
    """Verify production mode uses settings values correctly."""
    mock_settings.is_development = False
    mock_settings.debug = False
    mock_settings.http_cache_max_age_seconds = 3600
    mock_settings.http_cache_stale_while_revalidate_seconds = 7200

    result = get_cache_control_value()

    assert "max-age=3600" in result
    assert "stale-while-revalidate=7200" in result


# ==================== APPLY_CACHE_HEADERS TESTS ====================


def test_apply_cache_headers_sets_header():
    """Verify apply_cache_headers() sets Cache-Control header."""
    response = Response()

    apply_cache_headers(response)

    assert "Cache-Control" in response.headers
    assert response.headers["Cache-Control"] is not None


@patch("src.api.cache_headers._CACHE_CONTROL_VALUE", "test-cache-value")
def test_apply_cache_headers_uses_cached_value():
    """Verify apply_cache_headers() uses module-level cached value."""
    response = Response()

    apply_cache_headers(response)

    assert response.headers["Cache-Control"] == "test-cache-value"


def test_apply_cache_headers_multiple_calls():
    """Verify multiple calls to apply_cache_headers() work correctly."""
    response = Response()

    apply_cache_headers(response)
    first_value = response.headers["Cache-Control"]

    apply_cache_headers(response)
    second_value = response.headers["Cache-Control"]

    # Should have same value (idempotent)
    assert first_value == second_value
    assert "Cache-Control" in response.headers


def test_apply_cache_headers_with_existing_headers():
    """Verify apply_cache_headers() works with pre-existing headers."""
    response = Response()
    response.headers["Content-Type"] = "application/json"
    response.headers["X-Custom-Header"] = "test"

    apply_cache_headers(response)

    # Cache-Control added
    assert "Cache-Control" in response.headers
    # Existing headers preserved
    assert response.headers["Content-Type"] == "application/json"
    assert response.headers["X-Custom-Header"] == "test"


# ==================== MODULE INITIALIZATION TESTS ====================


def test_module_level_cache_control_value_initialized():
    """Verify _CACHE_CONTROL_VALUE is initialized at module load."""
    from src.api import cache_headers

    assert hasattr(cache_headers, "_CACHE_CONTROL_VALUE")
    assert isinstance(cache_headers._CACHE_CONTROL_VALUE, str)
    assert len(cache_headers._CACHE_CONTROL_VALUE) > 0


@patch("src.api.cache_headers.settings")
def test_cache_control_value_format_consistency(mock_settings):
    """Verify cache control value has consistent format."""
    mock_settings.is_development = False
    mock_settings.debug = False
    mock_settings.http_cache_max_age_seconds = 600
    mock_settings.http_cache_stale_while_revalidate_seconds = 1200

    result = get_cache_control_value()

    # Verify format: "public, max-age=X, stale-while-revalidate=Y"
    parts = [part.strip() for part in result.split(",")]
    assert len(parts) == 3
    assert parts[0] == "public"
    assert parts[1].startswith("max-age=")
    assert parts[2].startswith("stale-while-revalidate=")

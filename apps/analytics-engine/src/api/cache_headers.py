"""Shared helper utilities for HTTP cache headers."""

from fastapi import Response

from src.core.config import settings


def get_cache_control_value() -> str:
    """Return the configured Cache-Control header value."""
    if settings.is_development or settings.debug:
        return "no-store"

    return (
        f"public, max-age={settings.http_cache_max_age_seconds}, "
        f"stale-while-revalidate={settings.http_cache_stale_while_revalidate_seconds}"
    )


_CACHE_CONTROL_VALUE = get_cache_control_value()


def apply_cache_headers(response: Response) -> None:
    """Apply consistent Cache-Control headers to FastAPI responses."""
    response.headers["Cache-Control"] = _CACHE_CONTROL_VALUE


def apply_analytics_cache_headers(response: Response) -> None:
    """Apply Cache-Control + Vary headers for analytics/portfolio endpoints."""
    apply_cache_headers(response)
    response.headers["Vary"] = "Accept-Encoding"

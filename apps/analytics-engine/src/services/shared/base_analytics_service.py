"""Base class for analytics services providing shared helpers."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, TypeVar, cast
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.cache_service import analytics_cache, build_service_cache_key
from src.core.config import settings
from src.core.constants import CACHE_TTL_BUNDLE_HOURS, CACHE_TTL_WALLET_HOURS
from src.core.utils import row_to_dict
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.interfaces import QueryServiceProtocol
from src.services.shared.query_names import QUERY_NAMES

CacheT = TypeVar("CacheT")


logger = logging.getLogger(__name__)


class CacheKeyMixin:
    """Mixin providing standardized cache key generation.

    Use this mixin for services that need cache key generation but don't
    extend BaseAnalyticsService (e.g., LandingPageService, DashboardService).

    Subclasses can override CACHE_VERSION to invalidate cached data after
    business logic changes.
    """

    CACHE_VERSION: str = "v1"

    def _cache_key(self, *parts: Any) -> str:
        """Build a namespaced cache key using the service class name."""
        version = getattr(self, "CACHE_VERSION", "v1")
        return build_service_cache_key(self.__class__.__name__, version, *parts)

    @staticmethod
    def _wallet_cache_config(wallet_address: str | None) -> tuple[str, int]:
        """Return (cache_key_part, ttl_hours) for wallet-aware caching.

        Bundle queries use 12h TTL (daily ETL pattern), wallet-specific use 2h.
        """
        wallet_key = wallet_address or "bundle"
        ttl_hours = CACHE_TTL_WALLET_HOURS if wallet_address else CACHE_TTL_BUNDLE_HOURS
        return wallet_key, ttl_hours


class BaseAnalyticsService(CacheKeyMixin):
    """Lightweight base containing shared analytics helpers."""

    # Bump per-service to invalidate caches after logic changes
    CACHE_VERSION = "v1"

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol,
        context: PortfolioAnalyticsContext | None = None,
    ) -> None:
        self.db = db
        self.query_service = query_service
        self.context = context or PortfolioAnalyticsContext()

    @staticmethod
    def uuid_to_str(user_id: UUID | str) -> str:
        """Normalize UUIDs to strings for query parameters and responses."""
        return str(user_id)

    def _execute_query(
        self,
        query_name: str,
        params: dict[str, Any] | None = None,
        *,
        db: Session | None = None,
    ) -> list[dict[str, Any]]:
        """Convenience wrapper to execute parameterized queries."""
        session = db or self.db
        return self.query_service.execute_query(session, query_name, params)

    def _execute_query_one(
        self,
        query_name: str,
        params: dict[str, Any] | None = None,
        *,
        db: Session | None = None,
    ) -> dict[str, Any] | None:
        """Execute a query expected to return a single record."""
        session = db or self.db
        return self.query_service.execute_query_one(session, query_name, params)

    def _date_range_with_period(
        self, days: int, end_date: datetime | None = None
    ) -> tuple[datetime, datetime, dict[str, Any]]:
        """Return start/end dates and the derived period metadata."""
        start_date, end_date = self.context.calculate_date_range(
            days, end_date=end_date
        )
        period_info = self.context.build_period_info(start_date, end_date, days)
        return start_date, end_date, period_info

    def _build_empty_response(
        self,
        user_id: UUID,
        period_info: dict[str, Any],
        **fields: Any,
    ) -> dict[str, Any]:
        """Create a consistent empty response payload."""
        payload = {
            "user_id": self.uuid_to_str(user_id),
            "period_info": period_info,
        }
        payload.update(fields)
        return payload

    def _perform_cache_operation(
        self,
        cache_key: str,
        ttl_hours: int | None = None,
    ) -> tuple[CacheT | None, timedelta | None]:
        """
        Perform cache retrieval and compute TTL for storage.

        Shared by both sync and async cache methods to eliminate duplication.

        Args:
            cache_key: Unique cache key for lookup
            ttl_hours: Optional TTL in hours (uses default 12 hours if None)

        Returns:
            Tuple of (cached_value, ttl_for_storage)
            - cached_value is None on cache miss or error
            - ttl_for_storage is None on cache hit (not needed), timedelta on miss
        """
        cached: CacheT | None = None
        try:
            cached = cast(CacheT | None, analytics_cache.get(cache_key))
        except Exception:
            logger.exception(
                "Cache get failed; falling back to fresh computation",
                extra={"cache_key": cache_key},
            )

        # Only calculate TTL if cache miss (optimization: avoid unnecessary computation)
        ttl = None
        if cached is None:
            ttl = (
                timedelta(hours=ttl_hours)
                if ttl_hours is not None
                else timedelta(hours=settings.analytics_cache_default_ttl_hours)
            )

        return cached, ttl

    def _store_in_cache(self, cache_key: str, result: CacheT, ttl: timedelta) -> None:
        """
        Store result in cache with error handling.

        Shared by both sync and async cache methods to eliminate duplication.

        Args:
            cache_key: Unique cache key for storage
            result: Computed result to store
            ttl: Time-to-live for the cached value
        """
        try:
            analytics_cache.set(cache_key, result, ttl)
        except Exception:
            logger.exception(
                "Cache set failed; returning fresh result",
                extra={"cache_key": cache_key},
            )

    def _with_cache(
        self,
        cache_key: str,
        fetcher: Callable[[], CacheT],
        ttl_hours: int | None = None,
    ) -> CacheT:
        """
        Execute operation with caching support.

        Checks cache first, executes fetcher on miss, stores result.
        Respects global cache enablement setting.

        Args:
            cache_key: Unique cache key (use ``_cache_key`` for namespaced keys)
            fetcher: Callable that computes the result (only called on cache miss)
            ttl_hours: Optional TTL in hours (uses default 12 hours if None)

        Returns:
            Cached or freshly computed result

        Example:
            >>> def compute_trends():
            ...     return self._execute_query("get_trends", {"user_id": user_id})
            >>> cache_key = self._cache_key("trends", user_id, days)
            >>> return self._with_cache(cache_key, compute_trends)
        """
        if not settings.analytics_cache_enabled:
            return fetcher()

        cached, ttl = self._perform_cache_operation(cache_key, ttl_hours)
        if cached is not None:
            return cached

        result = fetcher()
        self._store_in_cache(cache_key, result, ttl)  # type: ignore[arg-type]

        return result

    async def _with_async_cache(
        self,
        cache_key: str,
        fetcher: Callable[[], Awaitable[CacheT]],
        ttl_hours: int | None = None,
    ) -> CacheT:
        """Async variant of ``_with_cache`` for coroutine-based fetchers."""

        if not settings.analytics_cache_enabled:
            return await fetcher()

        cached, ttl = self._perform_cache_operation(cache_key, ttl_hours)
        if cached is not None:
            return cached

        result = await fetcher()
        self._store_in_cache(cache_key, result, ttl)  # type: ignore[arg-type]

        return result

    def _cached_query_with_row_conversion(
        self,
        cache_key_parts: tuple[Any, ...],
        query_name: str,
        days: int,
        params_factory: Callable[[datetime, datetime], dict[str, Any]],
        ttl_hours: int | None = None,
    ) -> list[dict[str, Any]]:
        """Run a cached query and convert rows to dictionaries.

        Args:
            cache_key_parts: Parts used to build the cache key via ``analytics_cache``
            query_name: Name of the SQL query to execute via ``QueryService``
            days: Period length used to derive date range metadata
            params_factory: Callable that receives the computed ``start`` and
                ``end`` dates and returns the query parameters
            ttl_hours: Optional override for cache TTL in hours

        Returns:
            List of dictionaries produced from the query rows
        """

        cache_key = analytics_cache.build_key(*cache_key_parts)
        start_date, end_date, _ = self._date_range_with_period(days)

        def fetch() -> list[dict[str, Any]]:
            params = params_factory(start_date, end_date)
            raw_rows = self._execute_query(query_name, params)
            if not raw_rows:
                return []
            return [
                {key: self._json_safe(value) for key, value in row_to_dict(row).items()}
                for row in raw_rows
            ]

        return self._with_cache(cache_key, fetch, ttl_hours=ttl_hours)

    @staticmethod
    def _json_safe(value: Any) -> Any:
        """Convert database values into JSON serializable types."""
        result = value
        if isinstance(value, datetime | date):
            result = value.isoformat()
        elif isinstance(value, timedelta):
            result = value.total_seconds()
        elif isinstance(value, Decimal):
            result = float(value)
        elif isinstance(value, UUID):
            result = str(value)
        elif isinstance(value, dict):
            result = {k: BaseAnalyticsService._json_safe(v) for k, v in value.items()}
        elif isinstance(value, list | tuple | set):
            result = [BaseAnalyticsService._json_safe(v) for v in value]

        return result

    def _drawdown_params(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> Callable[[datetime, datetime], dict[str, Any]]:
        """Standardized parameter factory for drawdown-based queries."""

        return lambda start_date, _end_date: {
            "user_id": self.uuid_to_str(user_id),
            "start_date": start_date,
            "end_date": None,
            "wallet_address": wallet_address,
        }

    def _get_drawdown_base_data(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Get base drawdown data shared across risk and drawdown analytics.

        Executes the unified drawdown query once and caches the result with a
        consistent cache key. Both RiskMetricsService (max drawdown calculation)
        and DrawdownAnalysisService (enhanced/underwater analysis) use this
        shared dataset, eliminating duplicate SQL execution.

        This shared method consolidates what were previously separate
        implementations in RiskMetricsService and DrawdownAnalysisService,
        reducing cache storage by 50% and eliminating redundant queries.

        Args:
            user_id: UUID of the user
            days: Number of days for drawdown analysis
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).

        Returns:
            List of drawdown data dictionaries with columns:
            - date, portfolio_value, peak_value, drawdown_pct
            - is_underwater, underwater_pct, recovery_point
        """
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)

        return self._cached_query_with_row_conversion(
            ("drawdown_base", user_id, wallet_key, days),  # Include wallet in cache key
            QUERY_NAMES.PORTFOLIO_DRAWDOWN_UNIFIED,
            days,
            self._drawdown_params(user_id, wallet_address),  # Pass wallet_address
            ttl_hours=ttl_hours,  # Conditional TTL
        )

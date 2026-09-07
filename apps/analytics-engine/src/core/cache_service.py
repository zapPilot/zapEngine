"""
Cache Service - Aggressive Caching for Daily ETL Pattern

Provides in-memory caching optimized for analytics data that updates once daily.
Uses 12-hour default TTL to maximize cache hits while ensuring data freshness.

Key Features:
- Thread-safe operations with RLock
- Configurable TTL per cache key
- Automatic expiration and cleanup
- LRU-style eviction when max entries reached
- Deep copy to prevent reference mutations
- Cache statistics for monitoring

Design Philosophy:
Since ETL updates data once daily, we can cache aggressively (12 hours) without
serving stale data. This reduces database load by 95%+ while maintaining data accuracy.
"""

import copy
import logging
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import Event, Lock, RLock, get_ident
from typing import Any, Generic, TypeVar, cast

from src.core.config import settings

T = TypeVar("T")

logger = logging.getLogger(__name__)

# A waiter blocked longer than this assumes the leader is wedged and computes
# for itself, so one stuck thread can never pin the whole process.
SINGLE_FLIGHT_WAIT_SECONDS = 60.0


class _CachedNone:
    """Marker stored in place of a deliberately cached ``None``.

    ``get`` returns ``None`` for both a miss and a cached ``None``; storing this
    marker instead is what lets ``cache_none=True`` report a genuine hit.
    """

    def __deepcopy__(self, _memo: dict[int, Any]) -> "_CachedNone":
        return self


_CACHED_NONE = _CachedNone()


class _InFlight:
    """One in-progress computation that other threads can wait on."""

    def __init__(self, owner_thread_id: int) -> None:
        self.owner_thread_id = owner_thread_id
        self.done = Event()
        self.result: Any = None
        self.error: BaseException | None = None


class CacheEntry(Generic[T]):
    """Cache entry with value and expiration time"""

    def __init__(self, value: T, expires_at: datetime):
        self.value = value
        self.expires_at = expires_at
        self.created_at = datetime.now(UTC)
        self.hit_count = 0


class CacheService:
    """
    Thread-safe in-memory cache for analytics services.

    Optimized for daily ETL pattern with 12-hour default TTL.
    Uses OrderedDict for LRU-style eviction and quick lookups.
    """

    def __init__(
        self,
        default_ttl: timedelta = timedelta(hours=12),
        max_entries: int = 1000,
    ):
        """
        Initialize cache service.

        Args:
            default_ttl: Default time-to-live for cache entries (12 hours for daily ETL)
            max_entries: Maximum number of entries before eviction starts
        """
        self._cache: OrderedDict[str, CacheEntry[Any]] = OrderedDict()
        self._lock = RLock()
        # Guards only the in-flight registry mutation; never held across compute().
        self._in_flight_lock = Lock()
        self._in_flight: dict[str, _InFlight] = {}
        self._default_ttl = default_ttl
        self._max_entries = max_entries

        # Statistics for monitoring
        self._stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "expirations": 0,
        }

        logger.info(
            "Cache service initialized",
            extra={
                "default_ttl_hours": default_ttl.total_seconds() / 3600,
                "max_entries": max_entries,
            },
        )

    def get(self, key: str) -> Any | None:
        """
        Retrieve value from cache if not expired.

        Args:
            key: Cache key

        Returns:
            Cached value (deep copy) or None if not found/expired
        """
        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._stats["misses"] += 1
                logger.debug("Cache miss", extra={"key": key})
                return None

            # Check expiration
            now = datetime.now(UTC)
            if now >= entry.expires_at:
                # Expired - remove and return None
                del self._cache[key]
                self._stats["expirations"] += 1
                self._stats["misses"] += 1
                logger.debug(
                    "Cache expired",
                    extra={
                        "key": key,
                        "expired_at": entry.expires_at.isoformat(),
                        "age_seconds": (now - entry.created_at).total_seconds(),
                    },
                )
                return None

            # Cache hit - update stats and move to end (LRU)
            entry.hit_count += 1
            self._stats["hits"] += 1
            self._cache.move_to_end(key)

            logger.debug(
                "Cache hit",
                extra={
                    "key": key,
                    "age_seconds": (now - entry.created_at).total_seconds(),
                    "hit_count": entry.hit_count,
                },
            )

            # Return deep copy to prevent mutations
            return copy.deepcopy(entry.value)

    def set(
        self,
        key: str,
        value: Any,
        ttl: timedelta | None = None,
    ) -> None:
        """
        Store value in cache with TTL.

        Args:
            key: Cache key
            value: Value to cache (will be deep copied)
            ttl: Time-to-live (uses default if None)
        """
        ttl = self._default_ttl if ttl is None else ttl
        expires_at = datetime.now(UTC) + ttl

        with self._lock:
            # Evict expired entries first
            self._evict_expired()

            # Evict oldest entry if at capacity
            if len(self._cache) >= self._max_entries:
                # Remove least recently used (first item in OrderedDict)
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
                self._stats["evictions"] += 1
                logger.debug(
                    "Cache eviction (capacity)", extra={"evicted_key": oldest_key}
                )

            # Store entry (deep copy to prevent external mutations)
            self._cache[key] = CacheEntry(
                copy.deepcopy(value),
                expires_at,
            )

            logger.debug(
                "Cache set",
                extra={
                    "key": key,
                    "ttl_hours": ttl.total_seconds() / 3600,
                    "expires_at": expires_at.isoformat(),
                },
            )

    def get_or_compute(
        self,
        key: str,
        compute: Callable[[], T],
        ttl: timedelta | None = None,
        *,
        cache_none: bool = False,
        should_cache: Callable[[T], bool] | None = None,
        wait_timeout: float = SINGLE_FLIGHT_WAIT_SECONDS,
    ) -> T:
        """Return the cached value for ``key``, computing it at most once.

        Concurrent callers for the same key collapse onto one computation: the
        first caller leads, the rest block on an event and receive its result.

        ``compute`` runs outside every cache lock. Holding the process-wide
        cache lock across a blocking database call would stall every other cache
        consumer in the process, which is a worse failure than the stampede this
        method exists to stop.

        Args:
            key: Cache key
            compute: Callable producing the value on a miss
            ttl: Time-to-live for the stored value (cache default if None)
            cache_none: Store ``None`` results so they count as hits
            should_cache: Gate deciding whether the computed value is stored
            wait_timeout: Seconds a follower waits before computing for itself
        """
        if not settings.analytics_cache_enabled:
            return compute()

        hit, value = self._cached_value(key)
        if hit:
            return cast(T, value)

        record, is_leader = self._claim_in_flight(key)
        if record is None:
            # This thread already leads the key; waiting would deadlock it
            # against itself, so it computes directly instead.
            return compute()
        if is_leader:
            return self._compute_as_leader(
                key,
                record,
                compute,
                ttl,
                cache_none=cache_none,
                should_cache=should_cache,
            )
        return self._await_leader(record, compute, wait_timeout=wait_timeout)

    def _cached_value(self, key: str) -> tuple[bool, Any]:
        """Look up ``key`` and report whether it was a hit, unwrapping ``None``."""
        try:
            cached = self.get(key)
        except Exception:
            logger.exception(
                "Cache get failed; falling back to fresh computation",
                extra={"key": key},
            )
            return False, None

        if cached is _CACHED_NONE:
            return True, None
        return cached is not None, cached

    def _claim_in_flight(self, key: str) -> tuple[_InFlight | None, bool]:
        """Register as leader, or return the record to wait on.

        Returns ``(None, False)`` when the calling thread already leads the key.
        """
        thread_id = get_ident()
        with self._in_flight_lock:
            existing = self._in_flight.get(key)
            if existing is None:
                record = _InFlight(thread_id)
                self._in_flight[key] = record
                return record, True
            if existing.owner_thread_id == thread_id:
                return None, False
            return existing, False

    def _compute_as_leader(
        self,
        key: str,
        record: _InFlight,
        compute: Callable[[], T],
        ttl: timedelta | None,
        *,
        cache_none: bool,
        should_cache: Callable[[T], bool] | None,
    ) -> T:
        try:
            result = compute()
        except BaseException as exc:
            record.error = exc
            raise
        else:
            record.result = result
            if should_cache is None or should_cache(result):
                self._store_computed(key, result, ttl, cache_none=cache_none)
            return result
        finally:
            self._release_in_flight(key, record)

    def _store_computed(
        self,
        key: str,
        value: Any,
        ttl: timedelta | None,
        *,
        cache_none: bool,
    ) -> None:
        if value is None and not cache_none:
            return
        try:
            self.set(key, _CACHED_NONE if value is None else value, ttl)
        except Exception:
            logger.exception(
                "Cache set failed; returning fresh result",
                extra={"key": key},
            )

    def _release_in_flight(self, key: str, record: _InFlight) -> None:
        with self._in_flight_lock:
            if self._in_flight.get(key) is record:
                del self._in_flight[key]
        record.done.set()

    def _await_leader(
        self,
        record: _InFlight,
        compute: Callable[[], T],
        *,
        wait_timeout: float,
    ) -> T:
        if not record.done.wait(timeout=wait_timeout):
            logger.warning(
                "Single-flight wait timed out; computing independently",
                extra={"wait_timeout_seconds": wait_timeout},
            )
            return compute()
        if record.error is not None:
            raise record.error
        # Followers get their own copy so one request cannot mutate another's.
        return cast(T, copy.deepcopy(record.result))

    def delete(self, key: str) -> bool:
        """
        Delete specific cache entry.

        Args:
            key: Cache key to delete

        Returns:
            True if entry existed and was deleted, False otherwise
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                logger.debug("Cache delete", extra={"key": key})
                return True
            return False

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            logger.info("Cache cleared", extra={"entries_cleared": count})

    def build_key(self, *parts: Any) -> str:
        """
        Build cache key from components.

        Args:
            *parts: Key components (will be stringified and joined)

        Returns:
            Cache key string

        Example:
            >>> cache.build_key("trends", user_id, days)
            "trends:12345678-1234-1234-1234-123456789012:30"
        """
        return ":".join(str(part) for part in parts)

    def get_stats(self) -> dict[str, Any]:
        """
        Get cache statistics for monitoring.

        Returns:
            Dictionary with cache metrics
        """
        with self._lock:
            total_requests = self._stats["hits"] + self._stats["misses"]
            hit_rate = (
                self._stats["hits"] / total_requests if total_requests > 0 else 0.0
            )

            return {
                "hits": self._stats["hits"],
                "misses": self._stats["misses"],
                "hit_rate": round(hit_rate, 4),
                "evictions": self._stats["evictions"],
                "expirations": self._stats["expirations"],
                "current_entries": len(self._cache),
                "max_entries": self._max_entries,
                "utilization": round(len(self._cache) / self._max_entries, 4),
            }

    def _evict_expired(self) -> None:
        """Remove expired entries (called with lock held)."""
        now = datetime.now(UTC)
        expired_keys = [
            key for key, entry in self._cache.items() if entry.expires_at <= now
        ]

        for key in expired_keys:
            del self._cache[key]
            self._stats["expirations"] += 1

        if expired_keys:
            logger.debug(
                "Expired entries removed",
                extra={"count": len(expired_keys)},
            )


# Global cache instance (can be replaced with DI if needed)
analytics_cache = CacheService(
    default_ttl=timedelta(hours=settings.analytics_cache_default_ttl_hours),
    max_entries=settings.analytics_cache_max_entries,
)


def build_service_cache_key(service_name: str, version: str, *parts: Any) -> str:
    """Build a cache key prefixed with a service name and version."""
    return analytics_cache.build_key(service_name, version, *parts)

"""
Comprehensive unit tests for CacheService.

Tests cover basic operations, deep copy isolation, LRU eviction, TTL expiration,
thread safety, and utility methods. Targets 95%+ code coverage for production-ready
in-memory caching infrastructure.
"""

import threading
import time
from datetime import timedelta
from typing import Any

import pytest

from src.core.cache_service import CacheService, build_service_cache_key

# ==================== FIXTURES ====================


@pytest.fixture
def cache_service() -> CacheService:
    """CacheService with small limits for testing (max_entries=5, default_ttl=1 hour)."""
    return CacheService(max_entries=5, default_ttl=timedelta(hours=1))


@pytest.fixture
def sample_data() -> dict[str, Any]:
    """Complex nested data structure for deep copy testing."""
    return {"user_id": "123", "metrics": {"volatility": 0.15}, "snapshots": [1, 2, 3]}


@pytest.fixture
def cache_with_data(cache_service: CacheService) -> CacheService:
    """Pre-populated cache with 3 entries."""
    cache_service.set("key1", {"value": 100})
    cache_service.set("key2", {"value": 200})
    cache_service.set("key3", {"value": 300})
    return cache_service


# ==================== BASIC OPERATIONS TESTS ====================


def test_set_and_get(cache_service: CacheService):
    """Verify basic set and get operations work correctly."""
    test_value = {"data": "test"}
    cache_service.set("test_key", test_value)

    retrieved = cache_service.get("test_key")

    assert retrieved is not None
    assert retrieved == test_value
    assert isinstance(retrieved, dict)


def test_get_nonexistent_returns_none(cache_service: CacheService):
    """Verify get() returns None for non-existent keys."""
    result = cache_service.get("nonexistent_key")

    assert result is None


def test_delete_existing_key_returns_true(cache_with_data: CacheService):
    """Verify delete() returns True when key exists."""
    result = cache_with_data.delete("key1")

    assert result is True
    assert cache_with_data.get("key1") is None


def test_delete_nonexistent_returns_false(cache_service: CacheService):
    """Verify delete() returns False for non-existent keys."""
    result = cache_service.delete("nonexistent")

    assert result is False


def test_clear_removes_all_entries(cache_with_data: CacheService):
    """Verify clear() removes all entries from cache."""
    cache_with_data.clear()

    assert cache_with_data.get("key1") is None
    assert cache_with_data.get("key2") is None
    assert cache_with_data.get("key3") is None
    stats = cache_with_data.get_stats()
    assert stats["current_entries"] == 0


# ==================== DEEP COPY ISOLATION TESTS ====================


def test_set_creates_deep_copy(
    cache_service: CacheService, sample_data: dict[str, Any]
):
    """Verify set() creates deep copy - modifying original doesn't affect cached."""
    cache_service.set("test_key", sample_data)

    # Modify original after caching
    sample_data["user_id"] = "modified"
    sample_data["metrics"]["volatility"] = 0.99

    # Cached value should be unchanged
    cached = cache_service.get("test_key")
    assert cached["user_id"] == "123"  # Original value
    assert cached["metrics"]["volatility"] == 0.15  # Original value


def test_get_returns_deep_copy(
    cache_service: CacheService, sample_data: dict[str, Any]
):
    """Verify get() returns deep copy - modifying returned value doesn't affect cache."""
    cache_service.set("test_key", sample_data)

    # Get and modify
    retrieved = cache_service.get("test_key")
    assert retrieved is not None
    retrieved["user_id"] = "modified"
    retrieved["metrics"]["volatility"] = 0.99

    # Get again - should be unchanged
    retrieved_again = cache_service.get("test_key")
    assert retrieved_again is not None
    assert retrieved_again["user_id"] == "123"
    assert retrieved_again["metrics"]["volatility"] == 0.15


def test_nested_structure_isolation(cache_service: CacheService):
    """Verify deep copy works for deeply nested structures."""
    nested_data = {
        "level1": {"level2": {"level3": {"value": 100}}, "list": [{"item": 1}]}
    }

    cache_service.set("nested", nested_data)

    # Modify nested structure
    retrieved = cache_service.get("nested")
    assert retrieved is not None
    retrieved["level1"]["level2"]["level3"]["value"] = 999
    retrieved["level1"]["list"][0]["item"] = 999

    # Original in cache should be unchanged
    cached_again = cache_service.get("nested")
    assert cached_again is not None
    assert cached_again["level1"]["level2"]["level3"]["value"] == 100
    assert cached_again["level1"]["list"][0]["item"] == 1


# ==================== LRU EVICTION TESTS ====================


def test_lru_evicts_oldest_when_full(cache_service: CacheService):
    """Verify LRU eviction when cache reaches max_entries (5)."""
    # Fill cache to max (5 entries)
    for i in range(5):
        cache_service.set(f"key{i}", f"value{i}")

    # Add 6th entry - should evict key0 (oldest)
    cache_service.set("key5", "value5")

    assert cache_service.get("key0") is None  # Evicted
    assert cache_service.get("key1") is not None  # Still present
    assert cache_service.get("key5") is not None  # Newly added


def test_lru_get_updates_order(cache_service: CacheService):
    """Verify get() moves entry to end (most recently used)."""
    # Fill cache
    for i in range(5):
        cache_service.set(f"key{i}", f"value{i}")

    # Access key0 - moves it to end
    cache_service.get("key0")

    # Add new entry - should evict key1 (now oldest), not key0
    cache_service.set("key5", "value5")

    assert cache_service.get("key0") is not None  # Still present (was accessed)
    assert cache_service.get("key1") is None  # Evicted


def test_lru_set_existing_updates_order(cache_service: CacheService):
    """Verify set() on existing key moves it to end."""
    # Fill cache
    for i in range(5):
        cache_service.set(f"key{i}", f"value{i}")

    # Update key0 - moves it to end
    cache_service.set("key0", "updated_value0")

    # Add new entry - should evict key1 (now oldest)
    cache_service.set("key5", "value5")

    assert cache_service.get("key0") is not None  # Still present
    assert cache_service.get("key1") is None  # Evicted


def test_lru_eviction_order(cache_service: CacheService):
    """Verify FIFO eviction order across multiple adds."""
    # Fill cache
    for i in range(5):
        cache_service.set(f"key{i}", f"value{i}")

    # Add 3 more entries
    cache_service.set("key5", "value5")  # Evicts key0
    cache_service.set("key6", "value6")  # Evicts key1
    cache_service.set("key7", "value7")  # Evicts key2

    assert cache_service.get("key0") is None
    assert cache_service.get("key1") is None
    assert cache_service.get("key2") is None
    assert cache_service.get("key3") is not None
    assert cache_service.get("key4") is not None


# ==================== TTL EXPIRATION TESTS ====================


def test_ttl_default_from_config(cache_service: CacheService):
    """Verify entries use default_ttl when no custom TTL specified."""
    cache_service.set("test_key", "test_value")

    # Entry should exist
    assert cache_service.get("test_key") is not None


def test_ttl_custom_override():
    """Verify custom TTL overrides default."""
    cache = CacheService(default_ttl=timedelta(hours=1))
    cache.set("short_ttl", "value", ttl=timedelta(seconds=1))

    # Should exist immediately
    assert cache.get("short_ttl") is not None

    # Wait for TTL expiration
    time.sleep(1.1)

    # Should be expired now
    assert cache.get("short_ttl") is None


def test_ttl_expired_entry_returns_none():
    """Verify get() returns None for expired entries."""
    cache = CacheService(default_ttl=timedelta(seconds=1))
    cache.set("expiring_key", "expiring_value")

    # Should exist immediately
    assert cache.get("expiring_key") is not None

    # Wait for expiration
    time.sleep(1.1)

    # Should return None
    assert cache.get("expiring_key") is None


def test_ttl_cleanup_on_get():
    """Verify expired entries return None and eventually get cleaned up."""
    cache = CacheService(default_ttl=timedelta(seconds=1))
    cache.set("key1", "value1")
    cache.set("key2", "value2", ttl=timedelta(seconds=2))

    # Both should exist
    assert cache.get("key1") is not None
    assert cache.get("key2") is not None

    # Wait for key1 to expire
    time.sleep(1.1)

    # key1 should now return None (expired)
    assert cache.get("key1") is None

    # key2 should still be valid
    assert cache.get("key2") is not None

    # Verify expiration was tracked in stats
    stats = cache.get_stats()
    assert stats["expirations"] >= 1


# ==================== THREAD SAFETY TESTS ====================


def test_thread_safe_concurrent_writes(cache_service: CacheService):
    """Verify thread-safe concurrent writes with RLock."""
    num_threads = 10
    threads = []

    def write_to_cache(thread_id: int):
        for i in range(10):
            cache_service.set(f"thread{thread_id}_key{i}", f"value{i}")

    # Launch concurrent writers
    for tid in range(num_threads):
        thread = threading.Thread(target=write_to_cache, args=(tid,))
        threads.append(thread)
        thread.start()

    # Wait for all threads
    for thread in threads:
        thread.join()

    # Cache should have entries (may be evicted due to LRU, but no crashes)
    stats = cache_service.get_stats()
    assert stats["current_entries"] <= stats["max_entries"]


def test_thread_safe_read_write_mix(cache_service: CacheService):
    """Verify thread-safe mix of readers and writers."""
    # Pre-populate cache
    for i in range(5):
        cache_service.set(f"key{i}", f"value{i}")

    threads = []
    read_results: list[Any] = []

    def reader(results_list: list[Any]):
        for _ in range(20):
            val = cache_service.get("key0")
            results_list.append(val)
            time.sleep(0.001)

    def writer():
        for i in range(10):
            cache_service.set("key0", f"updated_{i}")
            time.sleep(0.001)

    # Launch 5 readers and 5 writers
    for _ in range(5):
        t = threading.Thread(target=reader, args=(read_results,))
        threads.append(t)
        t.start()

    for _ in range(5):
        t = threading.Thread(target=writer)
        threads.append(t)
        t.start()

    # Wait for all
    for thread in threads:
        thread.join()

    # No crashes, all reads succeeded
    assert len(read_results) == 100  # 5 readers * 20 reads each


# ==================== STATISTICS & UTILITIES TESTS ====================


def test_get_stats_structure(cache_with_data: CacheService):
    """Verify get_stats() returns correct structure."""
    stats = cache_with_data.get_stats()

    assert isinstance(stats, dict)
    assert "hits" in stats
    assert "misses" in stats
    assert "current_entries" in stats
    assert "max_entries" in stats
    assert "hit_rate" in stats
    assert "evictions" in stats
    assert "expirations" in stats
    assert "utilization" in stats

    assert stats["current_entries"] == 3
    assert stats["max_entries"] == 5


def test_build_key_from_parts(cache_service: CacheService):
    """Verify build_key() creates correct cache keys from parts."""
    key1 = cache_service.build_key("user", 123, "30d")
    assert key1 == "user:123:30d"

    key2 = cache_service.build_key("analytics", "risk", "volatility")
    assert key2 == "analytics:risk:volatility"

    # Single part
    key3 = cache_service.build_key("simple")
    assert key3 == "simple"

    # Test with None and mixed types
    key4 = cache_service.build_key("prefix", None, 42, "suffix")
    assert key4 == "prefix:None:42:suffix"


def test_build_service_cache_key_prefixes_service_and_version():
    """Verify build_service_cache_key() prefixes service name and version."""
    key = build_service_cache_key("AnalyticsService", "v2", "user", 123)
    assert key == "AnalyticsService:v2:user:123"

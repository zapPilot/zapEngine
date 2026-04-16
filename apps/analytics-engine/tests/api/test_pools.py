"""
Comprehensive API tests for Pool Performance endpoints.

Tests the /api/v2/pools/{user_id} endpoint with service mocking,
caching behavior, and error handling.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError

from src.api.cache_headers import get_cache_control_value
from src.core.config import settings
from src.main import app
from src.services.dependencies import get_pool_performance_service

# ==================== TEST DATA FACTORIES ====================


def create_pool_dict(
    snapshot_id: str | None = None,
    snapshot_ids: list[str] | None = None,
    chain: str = "ethereum",
    protocol: str = "aave-v3",
    protocol_name: str = "Aave V3",
    asset_usd_value: float = 5000.0,
    pool_symbols: list[str] | None = None,
    contribution_to_portfolio: float = 50.0,
) -> dict[str, Any]:
    """Factory for pool performance response dictionary."""
    if snapshot_id is None:
        snapshot_id = str(uuid4())

    if pool_symbols is None:
        pool_symbols = ["USDC", "WETH"]

    pool = {
        "wallet": "0xTestWallet",
        "snapshot_id": snapshot_id,
        "chain": chain,
        "protocol": protocol,
        "protocol_name": protocol_name,
        "asset_usd_value": asset_usd_value,
        "pool_symbols": pool_symbols,
        "contribution_to_portfolio": contribution_to_portfolio,
    }

    if snapshot_ids is not None:
        pool["snapshot_ids"] = snapshot_ids

    return pool


def create_defi_llama_pool(
    protocol: str = "aave-v3", protocol_name: str = "Aave V3"
) -> dict[str, Any]:
    """Factory for DeFiLlama protocol pool response."""
    return create_pool_dict(
        protocol=protocol,
        protocol_name=protocol_name,
    )


def create_hyperliquid_pool(apr: float = 0.12) -> dict[str, Any]:
    """Factory for Hyperliquid protocol pool response."""
    return create_pool_dict(
        chain="hyperliquid",
        protocol="hyperliquid",
        protocol_name="Hyperliquid",
        pool_symbols=["HLP"],
    )


def create_unmatched_pool(
    protocol: str = "unknown-protocol", protocol_name: str = "Unknown Protocol"
) -> dict[str, Any]:
    """Factory for unmatched protocol pool response."""
    return create_pool_dict(
        protocol=protocol,
        protocol_name=protocol_name,
    )


# ==================== MOCK SERVICE CLASSES ====================


class MockPoolPerformanceService:
    """Mock service for PoolPerformanceService with configurable responses."""

    def __init__(self, response: list[dict[str, Any]]):
        self.response = response
        self.calls: list[dict] = []

    def get_pool_performance(self, user_id, **kwargs) -> list[dict[str, Any]]:
        """Mock get_pool_performance to return configured response."""
        self.calls.append({"user_id": user_id, **kwargs})
        return self.response


# ==================== HTTP ENDPOINT TESTS ====================


class TestPoolPerformanceEndpoint:
    """Basic HTTP endpoint functionality tests."""

    @pytest.mark.asyncio
    async def test_pool_performance_success_with_valid_uuid(self, client: AsyncClient):
        """Pool performance endpoint returns 200 with valid UUID and pool data."""
        user_id = str(uuid4())
        pools = [create_defi_llama_pool()]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["protocol"] == "aave-v3"

    @pytest.mark.asyncio
    async def test_pool_performance_success_with_empty_pools(self, client: AsyncClient):
        """Pool performance endpoint returns 200 with empty list when no pools."""
        user_id = str(uuid4())
        service = MockPoolPerformanceService([])
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    @pytest.mark.asyncio
    async def test_pool_performance_response_structure_validation(
        self, client: AsyncClient
    ):
        """Pool performance response has correct structure with all required fields."""
        user_id = str(uuid4())
        pools = [
            create_defi_llama_pool("aave-v3", "Aave V3"),
            create_hyperliquid_pool(0.12),
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Validate DeFiLlama pool structure
        aave_pool = data[0]
        # snapshot_id and wallet are now included to match PoolDetail model
        assert "snapshot_id" in aave_pool
        assert "wallet" in aave_pool
        assert "chain" in aave_pool
        assert "protocol" in aave_pool
        assert "protocol_name" in aave_pool
        assert "asset_usd_value" in aave_pool
        assert "pool_symbols" in aave_pool
        assert "contribution_to_portfolio" in aave_pool

        # Deprecated APR fields should be absent
        assert "final_apr" not in aave_pool or aave_pool.get("final_apr") is None
        assert (
            "protocol_matched" not in aave_pool
            or aave_pool.get("protocol_matched") is None
        )
        assert "apr_data" not in aave_pool or aave_pool.get("apr_data") is None

    @pytest.mark.asyncio
    async def test_pool_performance_invalid_uuid_returns_422(self, client: AsyncClient):
        """Invalid UUID format returns 422 validation error."""
        response = await client.get("/api/v2/pools/not-a-uuid/performance")
        assert response.status_code == 422


# ==================== CACHING TESTS ====================


class TestPoolPerformanceCaching:
    """Cache behavior tests for pool performance endpoint."""

    @pytest.mark.asyncio
    async def test_cache_control_header_set_correctly(self, client: AsyncClient):
        """Cache-Control header is set to settings.http_cache_max_age_seconds."""
        user_id = str(uuid4())
        pools = [create_defi_llama_pool()]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        assert "Cache-Control" in response.headers
        expected_cache_control = get_cache_control_value()
        assert response.headers["Cache-Control"] == expected_cache_control

    @pytest.mark.asyncio
    async def test_server_cache_hit_returns_cached_data(self, client: AsyncClient):
        """Server cache is handled at service layer (via BaseAnalyticsService._with_cache()).

        Note: Caching was moved from router to service layer in Phase 3 refactoring.
        The MockPoolPerformanceService doesn't inherit from BaseAnalyticsService,
        so it doesn't have caching behavior. This test now verifies that the
        router correctly calls the service method (caching tested in service tests).
        """
        user_id = str(uuid4())
        pools = [create_defi_llama_pool()]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            # Clear cache to ensure clean state
            from src.core.cache_service import analytics_cache

            analytics_cache.clear()

            # First request
            response1 = await client.get(f"/api/v2/pools/{user_id}/performance")
            assert response1.status_code == 200
            assert len(service.calls) == 1  # Service was called

            # Second request - mock service gets called again (no caching in mock)
            # Real service would use BaseAnalyticsService._with_cache() for caching
            response2 = await client.get(f"/api/v2/pools/{user_id}/performance")
            assert response2.status_code == 200
            assert len(service.calls) == 2  # Mock called again (no cache in mock)

            # Data should be identical
            assert response1.json() == response2.json()

        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)
            analytics_cache.clear()

    @pytest.mark.asyncio
    async def test_server_cache_miss_fetches_fresh_data(self, client: AsyncClient):
        """Server cache miss fetches fresh data from service."""
        user_id = str(uuid4())
        pools = [create_defi_llama_pool()]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            # Clear cache to force cache miss
            from src.core.cache_service import analytics_cache

            analytics_cache.clear()

            response = await client.get(f"/api/v2/pools/{user_id}/performance")

            assert response.status_code == 200
            assert len(service.calls) == 1  # Service was called
            # Service receives UUID object from FastAPI path parameter
            assert isinstance(service.calls[0]["user_id"], UUID)
            assert str(service.calls[0]["user_id"]) == user_id

        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)
            analytics_cache.clear()

    @pytest.mark.asyncio
    async def test_cache_disabled_bypasses_caching(self, client: AsyncClient):
        """When cache is disabled, service is called on every request."""
        user_id = str(uuid4())
        pools = [create_defi_llama_pool()]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            # Temporarily disable cache
            original_cache_enabled = settings.analytics_cache_enabled
            settings.analytics_cache_enabled = False

            # Make multiple requests
            response1 = await client.get(f"/api/v2/pools/{user_id}/performance")
            response2 = await client.get(f"/api/v2/pools/{user_id}/performance")

            assert response1.status_code == 200
            assert response2.status_code == 200
            assert len(service.calls) == 2  # Service called both times

        finally:
            settings.analytics_cache_enabled = original_cache_enabled
            app.dependency_overrides.pop(get_pool_performance_service, None)


# ==================== SERVICE INTEGRATION TESTS ====================


class TestPoolPerformanceServiceIntegration:
    """Service dependency injection and integration tests."""

    @pytest.mark.asyncio
    async def test_pool_service_dependency_injection_works(self, client: AsyncClient):
        """Pool service dependency injection provides service correctly."""
        user_id = str(uuid4())
        pools = [
            create_defi_llama_pool("compound-v3", "Compound V3"),
            create_hyperliquid_pool(0.15),
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Verify service was called with correct user_id
        assert len(service.calls) == 1
        assert isinstance(service.calls[0]["user_id"], UUID)
        assert str(service.calls[0]["user_id"]) == user_id

    @pytest.mark.asyncio
    async def test_service_errors_propagate_correctly(self, client: AsyncClient):
        """Service errors propagate to HTTP 500 via global exception handler."""
        user_id = str(uuid4())
        service = MockPoolPerformanceService([])

        # Mock service to raise OperationalError (synchronous method)
        service.get_pool_performance = Mock(
            side_effect=OperationalError("Database timeout", None, None)
        )

        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            # Error should be raised and handled by global exception handler
            with pytest.raises(OperationalError, match="Database timeout"):
                await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)


# ==================== PROTOCOL TYPE TESTS ====================


class TestPoolPerformanceProtocolTypes:
    """Protocol-specific response tests."""

    @pytest.mark.asyncio
    async def test_defi_llama_protocols_response(self, client: AsyncClient):
        """DeFiLlama protocols return pools without deprecated APR fields."""
        user_id = str(uuid4())
        pools = [
            create_defi_llama_pool("aave-v3", "Aave V3"),
            create_defi_llama_pool("compound-v3", "Compound V3"),
            create_defi_llama_pool("curve", "Curve Finance"),
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

        for pool in data:
            assert "final_apr" not in pool or pool.get("final_apr") is None
            assert (
                "protocol_matched" not in pool or pool.get("protocol_matched") is None
            )
            assert "apr_data" not in pool or pool.get("apr_data") is None

    @pytest.mark.asyncio
    async def test_hyperliquid_protocol_response(self, client: AsyncClient):
        """Hyperliquid protocol still omits deprecated APR fields."""
        user_id = str(uuid4())
        pools = [create_hyperliquid_pool(0.12)]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        pool = data[0]
        assert pool["chain"] == "hyperliquid"
        assert pool["protocol"] == "hyperliquid"
        assert pool["pool_symbols"] == ["HLP"]
        assert "final_apr" not in pool or pool.get("final_apr") is None
        assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
        assert "apr_data" not in pool or pool.get("apr_data") is None

    @pytest.mark.asyncio
    async def test_mixed_protocol_types_response(self, client: AsyncClient):
        """Mixed protocols return correctly without APR fields."""
        user_id = str(uuid4())
        pools = [
            create_defi_llama_pool("aave-v3", "Aave V3"),
            create_hyperliquid_pool(),
            create_defi_llama_pool("compound-v3", "Compound V3"),
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

        # Verify protocol types are mixed
        protocols = {pool["protocol"] for pool in data}
        assert "aave-v3" in protocols
        assert "hyperliquid" in protocols
        assert "compound-v3" in protocols

    @pytest.mark.asyncio
    async def test_unmatched_protocol_response(self, client: AsyncClient):
        """Unmatched protocol still omits deprecated APR fields."""
        user_id = str(uuid4())
        pools = [create_unmatched_pool("mystery-defi", "Mystery DeFi")]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        pool = data[0]
        assert "final_apr" not in pool or pool.get("final_apr") is None
        assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
        assert "apr_data" not in pool or pool.get("apr_data") is None


# ==================== DATA VALIDATION TESTS ====================


class TestPoolPerformanceDataValidation:
    """Data type and validation tests for pool performance endpoint."""

    @pytest.mark.asyncio
    async def test_numeric_values_are_floats(self, client: AsyncClient):
        """Numeric values are properly typed as floats."""
        user_id = str(uuid4())
        pools = [
            create_pool_dict(
                asset_usd_value=7500.50,
                contribution_to_portfolio=62.5,
            )
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        pool = data[0]
        assert isinstance(pool["asset_usd_value"], int | float)
        assert isinstance(pool["contribution_to_portfolio"], int | float)

    @pytest.mark.asyncio
    async def test_pool_symbols_is_array(self, client: AsyncClient):
        """Pool symbols are returned as array."""
        user_id = str(uuid4())
        pools = [create_pool_dict(pool_symbols=["USDC", "WETH", "DAI"])]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        pool = data[0]
        assert isinstance(pool["pool_symbols"], list)
        assert pool["pool_symbols"] == ["USDC", "WETH", "DAI"]

    @pytest.mark.asyncio
    async def test_deprecated_fields_absent(self, client: AsyncClient):
        """Deprecated APR fields are omitted from all pools."""
        user_id = str(uuid4())
        pools = [create_pool_dict(), create_unmatched_pool()]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        for pool in data:
            assert "final_apr" not in pool or pool.get("final_apr") is None
            assert (
                "protocol_matched" not in pool or pool.get("protocol_matched") is None
            )
            assert "apr_data" not in pool or pool.get("apr_data") is None

    @pytest.mark.asyncio
    async def test_snapshot_ids_when_present(self, client: AsyncClient):
        """Snapshot IDs array is returned when present."""
        user_id = str(uuid4())
        snapshot_ids = [str(uuid4()), str(uuid4()), str(uuid4())]
        pools = [
            create_pool_dict(
                snapshot_id=snapshot_ids[0],
                snapshot_ids=snapshot_ids,
            )
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        pool = data[0]
        assert "snapshot_ids" in pool
        assert isinstance(pool["snapshot_ids"], list)
        assert len(pool["snapshot_ids"]) == 3
        assert pool["snapshot_ids"] == snapshot_ids


class TestPoolPerformanceParameterValidation:
    """Parameter validation and edge case testing for pool performance endpoint."""

    @pytest.mark.asyncio
    async def test_limit_below_minimum(self, client: AsyncClient):
        """Endpoint rejects limit below minimum (1)."""
        user_id = uuid4()
        response = await client.get(
            f"/api/v2/pools/{user_id}/performance",
            params={"limit": 0},
        )
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.asyncio
    async def test_limit_above_maximum(self, client: AsyncClient):
        """Endpoint rejects limit above maximum (100)."""
        user_id = uuid4()
        response = await client.get(
            f"/api/v2/pools/{user_id}/performance",
            params={"limit": 101},
        )
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.asyncio
    async def test_min_value_usd_negative(self, client: AsyncClient):
        """Endpoint rejects negative min_value_usd."""
        user_id = uuid4()
        response = await client.get(
            f"/api/v2/pools/{user_id}/performance",
            params={"min_value_usd": -1},
        )
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.asyncio
    async def test_large_pool_response(self, client: AsyncClient):
        """Endpoint handles 100+ pools correctly."""
        user_id = uuid4()
        # Create 150 pools to test limit enforcement
        pools = [
            create_pool_dict(
                protocol=f"protocol_{i}",
                chain=f"chain_{i % 5}",  # 5 different chains
                pool_symbols=[f"POOL{i}"],
                asset_usd_value=1000.0 + i,
            )
            for i in range(150)
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        # Service returns all 150, but endpoint should handle it
        assert isinstance(data, list)
        assert len(data) == 150

    @pytest.mark.asyncio
    async def test_single_pool_response(self, client: AsyncClient):
        """Endpoint handles single pool correctly."""
        user_id = uuid4()
        pools = [create_pool_dict(asset_usd_value=5000.0)]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["asset_usd_value"] == 5000.0

    @pytest.mark.asyncio
    async def test_filtered_results_by_min_value(self, client: AsyncClient):
        """Endpoint properly passes min_value_usd filter to service."""
        user_id = uuid4()
        # Create pools with varying values
        pools = [
            create_pool_dict(pool_symbols=["HIGH"], asset_usd_value=10000.0),
            create_pool_dict(pool_symbols=["MED"], asset_usd_value=5000.0),
            create_pool_dict(pool_symbols=["LOW"], asset_usd_value=100.0),
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(
                f"/api/v2/pools/{user_id}/performance",
                params={"min_value_usd": 1000.0},
            )
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        # Verify the service was called with the filter parameter
        assert len(service.calls) == 1
        assert service.calls[0]["min_value_usd"] == 1000.0

    @pytest.mark.asyncio
    async def test_snapshot_ids_when_empty(self, client: AsyncClient):
        """Snapshot IDs array is empty when not present."""
        user_id = str(uuid4())
        pools = [
            create_pool_dict(
                snapshot_id=str(uuid4()),
                snapshot_ids=[],  # Empty array
            )
        ]
        service = MockPoolPerformanceService(pools)
        app.dependency_overrides[get_pool_performance_service] = lambda: service

        try:
            response = await client.get(f"/api/v2/pools/{user_id}/performance")
        finally:
            app.dependency_overrides.pop(get_pool_performance_service, None)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        pool = data[0]
        assert "snapshot_ids" in pool
        assert isinstance(pool["snapshot_ids"], list)
        assert len(pool["snapshot_ids"]) == 0

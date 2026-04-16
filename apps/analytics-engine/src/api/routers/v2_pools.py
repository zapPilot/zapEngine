"""V2 pools endpoints built on the canonical pool service."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from src.api.cache_headers import apply_analytics_cache_headers
from src.services.dependencies import PoolPerformanceServiceDep

router = APIRouter(prefix="/v2/pools", tags=["Pools V2"])


@router.get("/{user_id}/performance")
def get_pool_performance_v2(
    user_id: UUID,
    response: Response,
    pool_service: PoolPerformanceServiceDep,
    limit: int | None = Query(
        None,
        ge=1,
        le=100,
        description="Maximum number of pools to return",
    ),
    min_value_usd: float = Query(
        0.0,
        ge=0.0,
        description="Filter pools below this USD threshold",
    ),
) -> list[dict[str, Any]]:
    """Return canonical pool performance data with optional filtering."""

    raw_pool_data = pool_service.get_pool_performance(
        user_id, limit=limit, min_value_usd=min_value_usd
    )

    # Return data directly - validation happens via Pydantic response model if strictly enforced,
    # but here we return a list of dicts. The integration tests require "wallet" and "snapshot_id".
    pool_data = raw_pool_data

    apply_analytics_cache_headers(response)

    return pool_data

"""
Pool Performance Service

Provides pool-level performance analytics with APR data from multiple sources.
Follows the specialized service architecture pattern.
"""

from __future__ import annotations

import logging
import time
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.core.exceptions import DatabaseError, ValidationError
from src.services.aggregators.pool_performance_aggregator import (
    PoolPerformanceAggregator,
)
from src.services.interfaces import (
    PoolPerformanceAggregatorProtocol,
    PoolPerformanceServiceProtocol,
    QueryServiceProtocol,
)
from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class PoolPerformanceService(BaseAnalyticsService, PoolPerformanceServiceProtocol):
    """Service for retrieving pool performance metrics.

    Note: APR data has been removed for performance optimization (5-10s latency reduction).
    """

    CACHE_VERSION = "v3"  # Bumped for APR removal optimization

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol,
        aggregator: PoolPerformanceAggregatorProtocol | None = None,
    ) -> None:
        if query_service is None:
            raise ValueError("Query service is required")
        if db is None:
            raise ValueError("Database session is required")
        # Initialize base class without context (PoolPerformanceService doesn't use AnalyticsContext)
        super().__init__(db, query_service, context=None)
        self.aggregator = aggregator or PoolPerformanceAggregator()

    def get_pool_performance(
        self,
        user_id: UUID,
        *,
        snapshot_date: date | None = None,
        limit: int | None = None,
        min_value_usd: float = 0.0,
    ) -> list[dict[str, Any]]:
        """See PoolPerformanceServiceProtocol.get_pool_performance"""
        logger.info(
            "Fetching pool performance for user %s (snapshot_date=%s, limit=%s, min_value=%.2f)",
            user_id,
            snapshot_date,
            limit,
            min_value_usd,
        )

        snapshot_key = snapshot_date.isoformat() if snapshot_date else "latest"
        cache_key = self._cache_key("pool_performance_base", user_id, snapshot_key)

        def fetch_pool_data() -> list[dict[str, Any]]:
            try:
                function_start = time.time()

                # Query execution
                t1 = time.time()
                params = {
                    "user_id": str(user_id),
                    "snapshot_date": snapshot_date.isoformat()
                    if snapshot_date
                    else None,
                }
                results = self.query_service.execute_query(
                    self.db, QUERY_NAMES.POOL_PERFORMANCE_BY_USER, params
                )
                query_time = (time.time() - t1) * 1000
                logger.info(
                    "PERF: [%s] Query execution: %.2fms",
                    self.__class__.__name__,
                    query_time,
                )
                if query_time > 2000:
                    logger.warning(  # pragma: no cover
                        "Slow pool performance query: %.2fms for user %s",
                        query_time,
                        user_id,
                    )

                # Aggregation
                t2 = time.time()
                aggregated = self.aggregator.aggregate_positions(results)
                logger.info(
                    "PERF: [%s] Aggregation: %.2fms (%d positions)",
                    self.__class__.__name__,
                    (time.time() - t2) * 1000,
                    len(aggregated),
                )

                # Sorting
                t3 = time.time()
                aggregated.sort(
                    key=lambda item: item.get("asset_usd_value", 0.0), reverse=True
                )
                logger.info(
                    "PERF: [%s] Sorting: %.2fms",
                    self.__class__.__name__,
                    (time.time() - t3) * 1000,
                )

                logger.info(
                    "PERF: [%s] Total: %.2fms",
                    self.__class__.__name__,
                    (time.time() - function_start) * 1000,
                )

                return aggregated

            except SQLAlchemyError as exc:
                logger.error(
                    "Database error fetching pool performance for user %s: %s",
                    user_id,
                    exc,
                )
                raise DatabaseError(
                    f"Failed to fetch pool performance for user {user_id}: {str(exc)}",
                    context={
                        "user_id": str(user_id),
                        "query_name": QUERY_NAMES.POOL_PERFORMANCE_BY_USER,
                    },
                ) from exc
            except KeyError as exc:
                logger.error(
                    "Missing expected field in query results for user %s: %s",
                    user_id,
                    exc,
                )
                raise ValidationError(
                    f"Invalid query result structure for user {user_id}: missing field {exc}",
                    context={
                        "user_id": str(user_id),
                        "missing_field": str(exc),
                        "query_name": QUERY_NAMES.POOL_PERFORMANCE_BY_USER,
                    },
                ) from exc

        aggregated_positions = self._with_cache(cache_key, fetch_pool_data)

        filtered: list[dict[str, Any]] = []
        for pool in aggregated_positions:
            if float(pool.get("asset_usd_value", 0.0)) < float(min_value_usd):
                continue
            # Use a shallow copy to avoid mutating cached objects returned from _with_cache
            filtered.append(dict(pool))

        if limit is not None and limit >= 0:
            filtered = filtered[:limit]

        return filtered

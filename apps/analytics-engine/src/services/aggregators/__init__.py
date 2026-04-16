"""
Aggregator services for data consolidation and transformation.

Aggregators centralize complex aggregation logic to eliminate duplication
and improve testability. Each aggregator follows the specialized service
architecture pattern with single responsibility.
"""

from src.services.aggregators.pool_performance_aggregator import (
    AggregatedPoolPosition,
    PoolPerformanceAggregator,
    PoolPositionData,
)

__all__ = [
    "PoolPerformanceAggregator",
    "PoolPositionData",
    "AggregatedPoolPosition",
]

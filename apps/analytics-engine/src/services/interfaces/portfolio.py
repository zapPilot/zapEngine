from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any, Protocol
from uuid import UUID

from src.models.portfolio import (
    BorrowingSummary,
    CategoryAllocation,
    PortfolioResponse,
)
from src.services.shared.value_objects import WalletAggregate

from .types import PortfolioROIComputed


class PortfolioAggregatorProtocol(Protocol):
    """Interface for portfolio aggregation services"""

    def aggregate_categories(
        self,
        category_assets: Mapping[str, Any] | None,
        wallet_categories: Mapping[str, Any] | None,
        total_assets: float,
    ) -> dict[str, CategoryAllocation]:
        """Aggregate category data from multiple sources"""
        ...  # pragma: no cover

    def aggregate_wallet_data(
        self, wallet_summaries: Iterable[Mapping[str, Any]]
    ) -> WalletAggregate:
        """Aggregate data across multiple wallets"""
        ...  # pragma: no cover


class PoolPerformanceAggregatorProtocol(Protocol):
    """Interface for pool performance aggregation services"""

    @staticmethod
    def parse_position(row: dict[str, Any]) -> Any:
        """
        Parse raw query row into position value object.

        Args:
            row: Raw query result dictionary

        Returns:
            PoolPositionData value object
        """
        ...  # pragma: no cover

    @classmethod
    def aggregate_positions(
        cls, positions: Iterable[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Aggregate pool positions across wallets.

        Groups by (protocol, chain, pool_symbols) and computes weighted APRs.

        Args:
            positions: Iterable of raw query result dictionaries

        Returns:
            List of aggregated pool position dictionaries
        """
        ...  # pragma: no cover


class PortfolioResponseBuilderProtocol(Protocol):
    """Interface for portfolio response building services"""

    def build_portfolio_response(
        self,
        portfolio_summary: dict[str, Any],
        wallet_summary: WalletAggregate,
        roi_data: PortfolioROIComputed,
        pool_details: list[dict[str, Any]] | None = None,
        positions_count: int = 0,
        protocols_count: int = 0,
        chains_count: int = 0,
        borrowing_summary: BorrowingSummary | None = None,
    ) -> PortfolioResponse:
        """Build a complete PortfolioResponse from aggregated data sources"""
        ...  # pragma: no cover

    def build_empty_response(self, user_id: UUID) -> PortfolioResponse:
        """Build empty response structure for users with no portfolio data"""
        ...  # pragma: no cover


class LandingPageServiceProtocol(Protocol):
    """Interface for landing page data aggregation services"""

    def get_landing_page_data(self, user_id: UUID) -> PortfolioResponse:
        """Get comprehensive landing page data"""
        ...  # pragma: no cover


class PoolPerformanceServiceProtocol(Protocol):
    """Interface for pool performance analytics services."""

    def get_pool_performance(
        self,
        user_id: UUID,
        *,
        snapshot_date: date | None = None,
        limit: int | None = None,
        min_value_usd: float = 0.0,
    ) -> list[dict[str, Any]]:
        """
        Get pool performance data for a user's portfolio.

        Aggregates user positions across all wallets with portfolio contribution metrics.
        Results are cached for 12 hours to match the daily ETL pattern.

        Note: APR fields have been removed for performance optimization (5-10s reduction).

        Args:
            user_id: User UUID
            snapshot_date: Optional date to filter pools to specific calendar day.
                          If provided, only returns pools from snapshots on this date.
                          If None, uses 24-hour rolling window (backward compatible).
            limit: Maximum number of pools to return (optional)
            min_value_usd: Minimum USD value filter (default: 0.0)

        Returns:
            List of pool performance dictionaries with structure:
            {
                "wallet": str,
                "snapshot_id": str,
                "snapshot_ids": list[str],
                "chain": str,
                "protocol_id": str,
                "protocol": str,
                "protocol_name": str,
                "asset_usd_value": float,
                "pool_symbols": list[str],
                "contribution_to_portfolio": float
            }

        Raises:
            DatabaseError: If database query fails
            ValidationError: If query result structure is invalid
        """
        ...  # pragma: no cover


class DashboardServiceProtocol(Protocol):
    """Interface for unified dashboard data aggregation service."""

    CACHE_VERSION: str
    DEFAULT_METRICS: tuple[str, ...]

    async def get_portfolio_dashboard(
        self,
        user_id: UUID,
        wallet_address: str | None = None,
        time_ranges: Any | None = None,
        metrics: tuple[str, ...] | None = None,
    ) -> dict[str, Any]:
        """
        Get comprehensive portfolio analytics dashboard.

        Aggregates all analytics services with individual error handling.

        Args:
            user_id: User identifier
            wallet_address: Optional wallet filter for specific wallet data
            time_ranges: Time range configuration for analytics
            metrics: Tuple of metric names to include

        Returns:
            Unified dashboard payload with all analytics sections
        """
        ...  # pragma: no cover

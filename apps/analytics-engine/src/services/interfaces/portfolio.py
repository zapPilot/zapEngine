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
    def parse_position(row: dict[str, Any]) -> Any: ...  # pragma: no cover

    @classmethod
    def aggregate_positions(
        cls, positions: Iterable[dict[str, Any]]
    ) -> list[dict[str, Any]]: ...  # pragma: no cover


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

    # fmt: off
    def get_pool_performance(self, user_id: UUID, *, snapshot_date: date | None = None, limit: int | None = None, min_value_usd: float = 0.0) -> list[dict[str, Any]]: ...  # pragma: no cover
    # fmt: on


class DashboardServiceProtocol(Protocol):
    """Interface for unified dashboard data aggregation service."""

    CACHE_VERSION: str
    DEFAULT_METRICS: tuple[str, ...]

    # fmt: off
    async def get_portfolio_dashboard(self, user_id: UUID, wallet_address: str | None = None, time_ranges: Any | None = None, metrics: tuple[str, ...] | None = None) -> dict[str, Any]: ...  # pragma: no cover
    # fmt: on

"""Landing Page Service - Lean Orchestrator."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, TypeVar, cast
from uuid import UUID

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session

from src.core.cache_service import analytics_cache
from src.core.config import settings
from src.core.constants import CATEGORIES
from src.core.exceptions import CrossServiceConsistencyError, ValidationError
from src.core.financial_utils import calculate_percentage_rounded
from src.models.analytics_responses import SnapshotInfo
from src.models.portfolio import PortfolioResponse
from src.models.portfolio_snapshot import WalletTrendOverride
from src.services.portfolio.borrowing_service import BorrowingService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.portfolio.pool_performance_service import PoolPerformanceService
from src.services.portfolio.portfolio_aggregator import PortfolioAggregator
from src.services.portfolio.portfolio_response_builder import PortfolioResponseBuilder
from src.services.portfolio.portfolio_snapshot_service import PortfolioSnapshotService
from src.services.portfolio.roi_calculator import ROICalculator
from src.services.portfolio.roi_types import PortfolioROIComputed
from src.services.portfolio.wallet_service import WalletService
from src.services.shared.base_analytics_service import CacheKeyMixin
from src.services.shared.query_service import QueryService
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown

logger = logging.getLogger(__name__)
DependencyT = TypeVar("DependencyT")


@contextmanager
def _timed(label: str) -> Iterator[None]:
    """Log the elapsed time for one landing-page operation."""
    started_at = time.time()
    yield
    logger.info("PERF: %s took %.2fms", label, (time.time() - started_at) * 1000)


@dataclass(frozen=True)
class _LandingComponents:
    """Container for fetched landing-page component payloads."""

    wallet_summary: WalletAggregate
    roi_data: PortfolioROIComputed
    pool_details: list[dict[str, Any]]
    positions_count: int
    protocols_count: int
    chains_count: int
    borrowing_summary: Any


@dataclass(frozen=True)
class _PreparedLandingContext:
    """Prepared snapshot context for landing-page assembly."""

    cache_key: str
    snapshot_date: date
    wallet_addresses: list[str]
    wallet_override: WalletTrendOverride | None
    portfolio_summary: dict[str, Any]


class LandingPageService(CacheKeyMixin):
    """Lean orchestrator for landing page data aggregation."""

    CACHE_VERSION = "v7"

    @staticmethod
    def _require_dependency(value: DependencyT | None, message: str) -> DependencyT:
        """Validate constructor dependency and preserve current error messages."""
        if value is None:
            raise ValueError(message)
        return value

    def __init__(
        self,
        db: Session,
        wallet_service: WalletService,
        query_service: QueryService,
        roi_calculator: ROICalculator | None = None,
        portfolio_aggregator: PortfolioAggregator | None = None,
        response_builder: PortfolioResponseBuilder | None = None,
        portfolio_snapshot_service: PortfolioSnapshotService | None = None,
        pool_performance_service: PoolPerformanceService | None = None,
        canonical_snapshot_service: CanonicalSnapshotService | None = None,
        borrowing_service: BorrowingService | None = None,
    ) -> None:
        self.db = self._require_dependency(db, "Database session is required")
        self.wallet_service = self._require_dependency(
            wallet_service,
            "Wallet service is required",
        )
        query_service = self._require_dependency(
            query_service,
            "Query service is required",
        )
        self.portfolio_snapshot_service = self._require_dependency(
            portfolio_snapshot_service,
            "Portfolio snapshot service is required",
        )
        self.pool_performance_service = self._require_dependency(
            pool_performance_service,
            "Pool performance service is required",
        )
        self.canonical_snapshot_service = self._require_dependency(
            canonical_snapshot_service,
            "Canonical snapshot service is required",
        )

        if borrowing_service is None:
            from src.services.portfolio.borrowing_service import BorrowingService

            borrowing_service = BorrowingService(
                db=self.db,
                query_service=query_service,
                canonical_snapshot_service=self.canonical_snapshot_service,
            )
        self.borrowing_service = borrowing_service

        self.portfolio_aggregator = portfolio_aggregator or PortfolioAggregator()
        self.roi_calculator = roi_calculator or ROICalculator(query_service)
        self.response_builder = response_builder or PortfolioResponseBuilder(
            self.portfolio_aggregator
        )

    def get_landing_page_data(self, user_id: UUID) -> PortfolioResponse:
        """
        Aggregate all data required for the public landing page.

        Uses canonical snapshot date to ensure consistency across all components:
        - Portfolio totals
        - Pool performance details
        - ROI calculations

        Executes service calls synchronously. Async parallelization was removed because:
        - Python GIL prevents true parallelism with synchronous DB calls
        - asyncio.to_thread() adds overhead without performance benefit
        - Connection pooling (QueuePool) makes sequential queries fast enough

        Caching enabled with centralized TTL (12 hours for daily ETL pattern).
        """
        start_time = time.time()
        prepared = self._prepare_landing_context(
            user_id=user_id,
            start_time=start_time,
        )
        if not isinstance(prepared, _PreparedLandingContext):
            return prepared
        try:
            response = self._assemble_landing_response(
                user_id=user_id,
                cache_key=prepared.cache_key,
                wallet_addresses=prepared.wallet_addresses,
                wallet_override=prepared.wallet_override,
                snapshot_date=prepared.snapshot_date,
                portfolio_summary=prepared.portfolio_summary,
            )
            self._log_landing_perf_summary(start_time=start_time)
            return response
        except PydanticValidationError as exc:
            logger.error("Portfolio validation failed for user %s: %s", user_id, exc)
            raise ValidationError(
                f"Portfolio data validation failed for user {user_id}: {str(exc)}",
                context={"user_id": str(user_id)},
            ) from exc
        except ValueError as exc:
            logger.error(
                "Business logic validation failed for user %s: %s", user_id, exc
            )
            raise ValidationError(
                f"Business logic validation failed for user {user_id}: {str(exc)}",
                context={"user_id": str(user_id)},
            ) from exc

    def _prepare_landing_context(
        self,
        *,
        user_id: UUID,
        start_time: float,
    ) -> _PreparedLandingContext | PortfolioResponse:
        snapshot_date, snapshot_info = self._resolve_canonical_snapshot(user_id)
        if snapshot_date is None:
            logger.warning(
                "No snapshot data exists for user %s - returning empty response",
                user_id,
            )
            return self.response_builder.build_empty_response(user_id)
        cache_key = self._cache_key(user_id, snapshot_date)
        cached_result = self._get_cached_landing_response(
            cache_key=cache_key,
            user_id=user_id,
            start_time=start_time,
        )
        if cached_result is not None:
            return cached_result
        snapshot = self._fetch_landing_snapshot(
            user_id=user_id,
            snapshot_date=snapshot_date,
        )
        if snapshot is None:
            return self._build_empty_snapshot_response(
                cache_key=cache_key,
                user_id=user_id,
                start_time=start_time,
            )
        wallet_addresses, portfolio_summary, wallet_override = (
            self._build_snapshot_context(
                snapshot=snapshot,
                snapshot_date=snapshot_date,
                snapshot_info=snapshot_info,
            )
        )
        return _PreparedLandingContext(
            cache_key=cache_key,
            snapshot_date=snapshot_date,
            wallet_addresses=wallet_addresses,
            wallet_override=wallet_override,
            portfolio_summary=portfolio_summary,
        )

    def _assemble_landing_response(
        self,
        *,
        user_id: UUID,
        cache_key: str,
        wallet_addresses: list[str],
        wallet_override: Any,
        snapshot_date: date,
        portfolio_summary: dict[str, Any],
    ) -> PortfolioResponse:
        components = self._fetch_landing_components(
            user_id,
            wallet_addresses=wallet_addresses,
            wallet_override=wallet_override,
            snapshot_date=snapshot_date,
            portfolio_summary=portfolio_summary,
        )
        return self._build_and_cache_landing_response(
            cache_key=cache_key,
            portfolio_summary=portfolio_summary,
            wallet_summary=components.wallet_summary,
            roi_data=components.roi_data,
            pool_details=components.pool_details,
            positions_count=components.positions_count,
            protocols_count=components.protocols_count,
            chains_count=components.chains_count,
            borrowing_summary=components.borrowing_summary,
        )

    def _fetch_landing_snapshot(
        self,
        *,
        user_id: UUID,
        snapshot_date: date,
    ) -> Any:
        """Fetch canonical snapshot payload for landing response assembly."""
        with _timed("portfolio snapshot build"):
            return self.portfolio_snapshot_service.get_portfolio_snapshot(
                user_id,
                snapshot_date=snapshot_date,
            )

    @staticmethod
    def _build_snapshot_context(
        *,
        snapshot: Any,
        snapshot_date: date,
        snapshot_info: SnapshotInfo | None,
    ) -> tuple[list[str], dict[str, Any], Any]:
        """Build wallet/snapshot context used by downstream landing components."""
        wallet_addresses = snapshot.wallet_addresses or []
        portfolio_summary = snapshot.to_portfolio_summary()
        portfolio_summary["snapshot_date"] = snapshot_date
        if snapshot_info is not None and snapshot_info.last_updated:
            portfolio_summary["last_updated"] = snapshot_info.last_updated
        return wallet_addresses, portfolio_summary, snapshot.wallet_override

    def _resolve_canonical_snapshot(
        self,
        user_id: UUID,
    ) -> tuple[date | None, SnapshotInfo | None]:
        """Resolve canonical snapshot date and optional snapshot metadata."""
        with _timed("canonical snapshot info lookup"):
            snapshot_info = self.canonical_snapshot_service.get_snapshot_info(user_id)

        if isinstance(snapshot_info, SnapshotInfo):
            return snapshot_info.snapshot_date, snapshot_info
        return None, None

    def _get_cached_landing_response(
        self,
        *,
        cache_key: str,
        user_id: UUID,
        start_time: float,
    ) -> PortfolioResponse | None:
        """Return cached landing response when available."""
        if not settings.analytics_cache_enabled:
            return None

        cached_result = cast(
            PortfolioResponse | None,
            analytics_cache.get(cache_key),
        )
        if cached_result is None:
            return None

        logger.info(
            "PERF: Returning cached landing page data for user %s (total: %.2fms)",
            user_id,
            (time.time() - start_time) * 1000,
        )
        return cached_result

    def _build_empty_snapshot_response(
        self,
        *,
        cache_key: str,
        user_id: UUID,
        start_time: float,
    ) -> PortfolioResponse:
        """Build and cache empty response for users without snapshot payload."""
        empty_response = self.response_builder.build_empty_response(user_id)
        if settings.analytics_cache_enabled:
            analytics_cache.set(
                cache_key,
                empty_response,
                ttl=timedelta(hours=settings.analytics_cache_default_ttl_hours),
            )
        logger.info(
            "PERF: Empty response (total: %.2fms)",
            (time.time() - start_time) * 1000,
        )
        return empty_response

    def _fetch_landing_components(
        self,
        user_id: UUID,
        *,
        wallet_addresses: list[str],
        wallet_override: WalletTrendOverride | None,
        snapshot_date: date,
        portfolio_summary: dict[str, Any],
    ) -> _LandingComponents:
        """Fetch wallet/ROI/pool/borrowing components with timing capture."""
        with _timed("_fetch_wallet_summary"):
            wallet_summary = self._fetch_wallet_summary(
                user_id,
                wallet_addresses=wallet_addresses,
                wallet_override=wallet_override,
            )

        wallet_assets = portfolio_summary.get("wallet_assets", {})
        snapshot_total_calculated = (
            wallet_assets.get("btc", 0.0)
            + wallet_assets.get("eth", 0.0)
            + wallet_assets.get("stablecoins", 0.0)
            + wallet_assets.get("others", 0.0)
        )
        self._validate_cross_service_consistency(
            user_id,
            snapshot_total=snapshot_total_calculated,
            wallet_total=wallet_summary.total_value,
        )

        with _timed("compute_portfolio_roi"):
            roi_data = self.roi_calculator.compute_portfolio_roi(
                self.db, user_id, current_snapshot_date=snapshot_date
            )

        with _timed("_fetch_pool_details and counting"):
            pool_details = self._fetch_pool_details(
                user_id, snapshot_date=snapshot_date
            )
            positions_count = len(pool_details)
            protocols_count = len(
                {p.get("protocol_id") for p in pool_details if p.get("protocol_id")}
            )
            chains_count = len({p.get("chain") for p in pool_details if p.get("chain")})

        with _timed("borrowing_summary calculation"):
            borrowing_summary = self.borrowing_service.get_borrowing_summary(
                user_id=user_id,
                total_assets_usd=portfolio_summary["total_assets"],
                total_debt_usd=portfolio_summary["total_debt"],
                total_net_usd=portfolio_summary["net_portfolio_value"],
            )

        return _LandingComponents(
            wallet_summary=wallet_summary,
            roi_data=roi_data,
            pool_details=pool_details,
            positions_count=positions_count,
            protocols_count=protocols_count,
            chains_count=chains_count,
            borrowing_summary=borrowing_summary,
        )

    def _build_and_cache_landing_response(
        self,
        *,
        cache_key: str,
        portfolio_summary: dict[str, Any],
        wallet_summary: WalletAggregate,
        roi_data: PortfolioROIComputed,
        pool_details: list[dict[str, Any]],
        positions_count: int,
        protocols_count: int,
        chains_count: int,
        borrowing_summary: Any,
    ) -> PortfolioResponse:
        """Build final landing response and cache it when enabled."""
        with _timed("build_portfolio_response"):
            result = self.response_builder.build_portfolio_response(
                portfolio_summary,
                wallet_summary,
                roi_data,
                pool_details=pool_details,
                positions_count=positions_count,
                protocols_count=protocols_count,
                chains_count=chains_count,
                borrowing_summary=borrowing_summary,
            )

        if settings.analytics_cache_enabled:
            analytics_cache.set(
                cache_key,
                result,
                ttl=timedelta(hours=settings.analytics_cache_default_ttl_hours),
            )
        return result

    def _log_landing_perf_summary(
        self,
        *,
        start_time: float,
    ) -> None:
        """Log total landing-page elapsed duration."""
        total_elapsed = (time.time() - start_time) * 1000
        logger.info("PERF: Landing page total: %.2fms", total_elapsed)

    def _fetch_wallet_summary(
        self,
        user_id: UUID,
        wallet_addresses: list[str] | None = None,
        wallet_override: WalletTrendOverride | None = None,
    ) -> WalletAggregate:
        """
        Collect and aggregate wallet level data for the landing page.

        Uses batch query to fetch all wallets at once, eliminating N+1 pattern.
        """
        wallet_addresses = wallet_addresses or []
        if not wallet_addresses:
            return self.portfolio_aggregator.aggregate_wallet_data([])

        # Batch fetch all wallet summaries in a single query
        wallet_summaries_dict = self.wallet_service.get_wallet_token_summaries_batch(
            self.db, wallet_addresses
        )

        # Convert dict to list maintaining order
        wallet_summaries = [
            wallet_summaries_dict.get(address, WalletAggregate())
            for address in wallet_addresses
        ]

        aggregated = self.portfolio_aggregator.aggregate_wallet_data(wallet_summaries)
        return self._apply_wallet_override(aggregated, wallet_override)

    def _apply_wallet_override(
        self,
        wallet_aggregate: WalletAggregate,
        wallet_override: WalletTrendOverride | None,
    ) -> WalletAggregate:
        if wallet_override is None:
            return wallet_aggregate

        override_categories = dict(wallet_override.categories)
        total_value = wallet_override.total_value

        categories: dict[str, WalletCategoryBreakdown] = {}
        for category in CATEGORIES:
            value = float(override_categories.get(category, 0.0))
            percentage = (
                calculate_percentage_rounded(value, total_value)
                if total_value > 0
                else 0.0
            )
            categories[category] = WalletCategoryBreakdown(
                value=value,
                percentage=percentage,
            )

        return WalletAggregate(
            total_value=total_value,
            token_count=wallet_aggregate.token_count,
            categories=categories,
        )

    def _validate_cross_service_consistency(
        self,
        user_id: UUID,
        snapshot_total: float,
        wallet_total: float,
        *,
        threshold_pct: float = 5.0,
    ) -> None:
        """Validate consistency between snapshot and wallet aggregation totals.

        Raises CrossServiceConsistencyError if the difference exceeds the threshold.

        Args:
            user_id: User identifier for error context
            snapshot_total: Total assets from portfolio snapshot service
            wallet_total: Total value from wallet aggregation
            threshold_pct: Maximum allowed percentage difference (default: 5%)

        Raises:
            CrossServiceConsistencyError: If difference exceeds threshold_pct
        """
        if snapshot_total == 0.0 and wallet_total == 0.0:
            return

        base_value = max(snapshot_total, wallet_total)
        diff_pct = (
            100.0
            if base_value == 0.0
            else abs(snapshot_total - wallet_total) / base_value * 100
        )

        if diff_pct > threshold_pct:
            raise CrossServiceConsistencyError(
                f"Wallet data inconsistency detected: snapshot wallet total "
                f"({snapshot_total:.2f}) differs from wallet service total ({wallet_total:.2f}) "
                f"by {diff_pct:.2f}% (threshold: {threshold_pct}%)",
                context={
                    "user_id": str(user_id),
                    "snapshot_total": snapshot_total,
                    "wallet_total": wallet_total,
                    "difference_pct": round(diff_pct, 2),
                    "threshold_pct": threshold_pct,
                    "difference_usd": abs(snapshot_total - wallet_total),
                },
            )

    def _fetch_pool_details(
        self, user_id: UUID, snapshot_date: date | None = None
    ) -> list[dict[str, Any]]:
        """
        Fetch pool performance details for the landing page.

        Returns ALL pools without filtering. Graceful degradation on error.

        Args:
            user_id: User identifier
            snapshot_date: Optional date to filter pools to specific snapshot date.
                          If None, uses 24-hour rolling window (backward compatible).

        Returns:
            List of pool performance dictionaries (empty list on error)
        """
        try:
            pools = self.pool_performance_service.get_pool_performance(
                user_id,
                snapshot_date=snapshot_date,
                limit=None,  # No limit - return ALL pools
                min_value_usd=0.0,  # No filtering
            )
            logger.info("Retrieved %d pool details for user %s", len(pools), user_id)
            return pools
        except Exception as exc:
            logger.error(
                "Failed to fetch pool details for user %s: %s.",
                user_id,
                exc,
                exc_info=True,
            )
            return []  # Graceful degradation for landing page

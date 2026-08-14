"""
Dashboard Aggregation Service

Consolidates all analytics services into a single unified dashboard endpoint.
Reduces 7+ frontend requests to 1, with aggressive caching for daily ETL pattern.

Key Features:
- Aggregates trends, risk metrics, drawdown, allocation, and rolling analytics
- Single 12-hour cached response (data updates daily)
- Graceful error handling (partial failures still return available data)
- Configurable time periods for different analytics
"""

import inspect
import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.core.cache_service import analytics_cache
from src.models.dashboard import DashboardTimeRanges
from src.services.analytics.drawdown_analysis_service import DrawdownAnalysisService
from src.services.analytics.risk_metrics_service import RiskMetricsService
from src.services.analytics.rolling_analytics_service import RollingAnalyticsService
from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.shared.base_analytics_service import CacheKeyMixin

logger = logging.getLogger(__name__)

DashboardPayload = BaseModel | dict[str, Any] | None
DashboardFetcher = Callable[[], DashboardPayload | Awaitable[DashboardPayload]]
DashboardMethod = Callable[..., DashboardPayload | Awaitable[DashboardPayload]]


@dataclass(frozen=True)
class _SectionEntry:
    path: tuple[str, ...]
    service_name: str
    service_attr: str
    method_name: str
    days_attr: str
    include_snapshot_date: bool = False


_SECTIONS: dict[str, tuple[_SectionEntry, ...]] = {
    "trend": (
        _SectionEntry(
            path=("trends",),
            service_name="trends",
            service_attr="trend_service",
            method_name="get_portfolio_trend",
            days_attr="trend_days",
            include_snapshot_date=True,
        ),
    ),
    "risk": (
        _SectionEntry(
            path=("risk_metrics", "volatility"),
            service_name="risk_volatility",
            service_attr="risk_service",
            method_name="calculate_portfolio_volatility",
            days_attr="trend_days",
        ),
        _SectionEntry(
            path=("risk_metrics", "sharpe_ratio"),
            service_name="risk_sharpe",
            service_attr="risk_service",
            method_name="calculate_sharpe_ratio",
            days_attr="trend_days",
        ),
        _SectionEntry(
            path=("risk_metrics", "max_drawdown"),
            service_name="risk_max_drawdown",
            service_attr="risk_service",
            method_name="calculate_max_drawdown",
            days_attr="drawdown_days",
        ),
    ),
    "drawdown": (
        _SectionEntry(
            path=("drawdown_analysis", "enhanced"),
            service_name="enhanced_drawdown",
            service_attr="drawdown_service",
            method_name="get_enhanced_drawdown_analysis",
            days_attr="drawdown_days",
        ),
        _SectionEntry(
            path=("drawdown_analysis", "underwater_recovery"),
            service_name="underwater_recovery",
            service_attr="drawdown_service",
            method_name="get_underwater_recovery_analysis",
            days_attr="drawdown_days",
        ),
    ),
    "rolling": (
        _SectionEntry(
            path=("rolling_analytics", "sharpe"),
            service_name="rolling_sharpe",
            service_attr="rolling_service",
            method_name="get_rolling_sharpe_analysis",
            days_attr="rolling_days",
        ),
        _SectionEntry(
            path=("rolling_analytics", "volatility"),
            service_name="rolling_volatility",
            service_attr="rolling_service",
            method_name="get_rolling_volatility_analysis",
            days_attr="rolling_days",
        ),
    ),
}


class DashboardService(CacheKeyMixin):
    """
    Aggregates all analytics services for unified dashboard endpoint.

    Reduces frontend request count from 7+ to 1 with server-side aggregation
    and 12-hour caching aligned to daily ETL updates.
    """

    CACHE_VERSION: str = "v2"
    DEFAULT_METRICS: tuple[str, ...] = (
        "trend",
        "risk",
        "drawdown",
        "rolling",
    )

    def __init__(
        self,
        trend_service: TrendAnalysisService,
        risk_service: RiskMetricsService,
        drawdown_service: DrawdownAnalysisService,
        rolling_service: RollingAnalyticsService,
        canonical_snapshot_service: CanonicalSnapshotService,
    ):
        """
        Initialize dashboard service with all analytics dependencies.

        Args:
            trend_service: Historical trend analysis
            risk_service: Risk metrics (volatility, Sharpe, drawdown)
            drawdown_service: Enhanced drawdown analysis
            rolling_service: Rolling window analytics
            canonical_snapshot_service: Canonical snapshot date service for consistency
        """
        self.trend_service = trend_service
        self.risk_service = risk_service
        self.drawdown_service = drawdown_service
        self.rolling_service = rolling_service
        self.canonical_snapshot_service = canonical_snapshot_service

    async def get_portfolio_dashboard(
        self,
        user_id: UUID,
        wallet_address: str | None = None,
        time_ranges: DashboardTimeRanges | None = None,
        metrics: tuple[str, ...] | None = None,
    ) -> dict[str, Any]:
        """
        Get comprehensive portfolio analytics dashboard.

        Aggregates all analytics services with individual error handling.
        If a service fails, its section will contain error info while other
        sections continue to populate.

        Args:
            user_id: User UUID
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).
                           When provided, filters to specific wallet address.
            time_ranges: Time range configuration for all analytics
                        (defaults to standard ranges if not provided)
            metrics: Tuple of metric names to include in the dashboard
                    (defaults to all metrics if not provided)

        Returns:
            Unified dashboard payload with all analytics sections
        """
        if time_ranges is None:
            time_ranges = DashboardTimeRanges()

        normalized_metrics = self._normalize_metrics(metrics)
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        cache_key = self._cache_key(
            user_id,
            wallet_key,
            "|".join(normalized_metrics),
            *time_ranges.to_cache_key_parts(),
        )

        cached = await run_in_threadpool(analytics_cache.get, cache_key)
        if cached is not None:
            logger.debug(
                "Dashboard cache hit",
                extra={"user_id": str(user_id), "cache_key": cache_key},
            )
            return cast(dict[str, Any], cached)

        snapshot_date = await run_in_threadpool(
            self.canonical_snapshot_service.get_snapshot_date,
            user_id,
            wallet_address,
        )
        if snapshot_date is None:
            logger.warning(
                "No snapshot data exists for dashboard request",
                extra={"user_id": str(user_id), "wallet_address": wallet_address},
            )
            return self._build_no_data_dashboard(user_id, time_ranges)

        logger.info(
            "Aggregating dashboard analytics",
            extra={
                "user_id": str(user_id),
                "snapshot_date": str(snapshot_date),
                "wallet_address": wallet_address or "bundle",
                **time_ranges.to_log_dict(),
            },
        )

        dashboard: dict[str, Any] = {
            "user_id": str(user_id),
            "parameters": time_ranges.model_dump(),
        }

        # Keep service calls serialized because the injected services share one
        # SQLAlchemy Session; only move each blocking call off the event loop.
        for metric in normalized_metrics:
            await self._add_dashboard_section(
                dashboard=dashboard,
                metric=metric,
                user_id=user_id,
                time_ranges=time_ranges,
                wallet_address=wallet_address,
                snapshot_date=snapshot_date,
            )

        # Calculate aggregation statistics
        dashboard["_metadata"] = self._calculate_aggregation_stats(
            dashboard, normalized_metrics, snapshot_date
        )

        # Store only fully successful dashboards. Partial failures are useful
        # responses, but caching them can keep transient service errors alive.
        if dashboard["_metadata"]["error_count"] == 0:
            await run_in_threadpool(
                analytics_cache.set,
                cache_key,
                dashboard,
                ttl=timedelta(hours=ttl_hours),
            )
        else:
            logger.info(
                "Dashboard partial failure not cached",
                extra={
                    "user_id": str(user_id),
                    "cache_key": cache_key,
                    "error_count": dashboard["_metadata"]["error_count"],
                },
            )

        logger.info(
            "Dashboard aggregation completed",
            extra={
                "user_id": str(user_id),
                "cache_key": cache_key,
                "success_count": dashboard["_metadata"]["success_count"],
                "error_count": dashboard["_metadata"]["error_count"],
            },
        )

        return dashboard

    def _normalize_metrics(self, metrics: tuple[str, ...] | None) -> tuple[str, ...]:
        requested_metrics = metrics or self.DEFAULT_METRICS
        normalized_metrics = tuple(
            metric for metric in requested_metrics if metric in self.DEFAULT_METRICS
        )
        return normalized_metrics or self.DEFAULT_METRICS

    @staticmethod
    def _build_no_data_dashboard(
        user_id: UUID, time_ranges: DashboardTimeRanges
    ) -> dict[str, Any]:
        return {
            "user_id": str(user_id),
            "parameters": time_ranges.model_dump(),
            "_metadata": {
                "success_count": 0,
                "error_count": 0,
                "total_services": 0,
                "success_rate": 0.0,
                "snapshot_date": None,
                "no_data": True,
            },
        }

    async def _add_dashboard_section(
        self,
        *,
        dashboard: dict[str, Any],
        metric: str,
        user_id: UUID,
        time_ranges: DashboardTimeRanges,
        wallet_address: str | None,
        snapshot_date: Any,
    ) -> None:
        for entry in _SECTIONS[metric]:
            method = cast(
                DashboardMethod,
                getattr(getattr(self, entry.service_attr), entry.method_name),
            )
            kwargs: dict[str, Any] = {"wallet_address": wallet_address}
            if entry.include_snapshot_date:
                kwargs["snapshot_date"] = snapshot_date

            def fetcher(
                method: DashboardMethod = method,
                days: int = getattr(time_ranges, entry.days_attr),
                kwargs: dict[str, Any] = kwargs,
            ) -> DashboardPayload | Awaitable[DashboardPayload]:
                return method(user_id, days=days, **kwargs)

            result = await self._safe_call(entry.service_name, fetcher)
            if len(entry.path) == 1:
                dashboard[entry.path[0]] = result
                continue
            section = cast(
                dict[str, Any],
                dashboard.setdefault(entry.path[0], {}),
            )
            section[entry.path[1]] = result

    async def _safe_call(
        self,
        service_name: str,
        fetcher: DashboardFetcher,
    ) -> dict[str, Any] | None:
        """
        Execute service call with error handling.

        Converts Pydantic models to dicts for JSON serialization.

        Args:
            service_name: Name of the service (for logging)
            fetcher: Callable that executes the service method

        Returns:
            Service result as dict or error payload
        """
        try:
            result = await run_in_threadpool(fetcher)
            if inspect.isawaitable(result):
                result = await result

            if result is None:
                return None

            # Convert Pydantic models to dicts
            if isinstance(result, BaseModel):
                return result.model_dump()  # pragma: no cover

            if isinstance(result, dict):
                return result

            raise TypeError(
                f"Expected BaseModel, dict, or awaitable from service {service_name}, got {type(result)}"
            )
        except Exception as e:
            logger.error(
                "Dashboard service call failed",
                extra={
                    "service": service_name,
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
                exc_info=True,
            )
            return {
                "error": True,
                "error_type": type(e).__name__,
                "error_message": str(e),
                "service": service_name,
            }

    def _calculate_aggregation_stats(
        self, dashboard: dict[str, Any], metrics: tuple[str, ...], snapshot_date: Any
    ) -> dict[str, Any]:
        """
        Calculate aggregation statistics for observability.

        Args:
            dashboard: Aggregated dashboard payload
            metrics: Tuple of metrics included in the dashboard
            snapshot_date: Canonical snapshot date used for this dashboard

        Returns:
            Metadata with success/error counts and snapshot date
        """
        success_count = 0
        error_count = 0

        sections = [
            self._get_dashboard_section_value(dashboard, entry.path)
            for metric in metrics
            for entry in _SECTIONS[metric]
        ]

        for section in sections:
            if isinstance(section, dict) and section.get("error"):
                error_count += 1
            else:
                success_count += 1

        total_sections = len(sections) or 1

        return {
            "success_count": success_count,
            "error_count": error_count,
            "total_services": total_sections,
            "success_rate": round(success_count / total_sections, 4),
            "snapshot_date": str(snapshot_date) if snapshot_date else None,
        }

    @staticmethod
    def _get_dashboard_section_value(
        dashboard: dict[str, Any], path: tuple[str, ...]
    ) -> Any:
        value: Any = dashboard
        for key in path:
            if not isinstance(value, Mapping):
                return None
            value = value.get(key)
        return value

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
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any, cast
from uuid import UUID

from pydantic import BaseModel

from src.core.cache_service import analytics_cache
from src.models.dashboard import DashboardTimeRanges
from src.services.interfaces import (
    CanonicalSnapshotServiceProtocol,
    DrawdownAnalysisServiceProtocol,
    RiskMetricsServiceProtocol,
    RollingAnalyticsServiceProtocol,
    TrendAnalysisServiceProtocol,
)
from src.services.shared.base_analytics_service import CacheKeyMixin

logger = logging.getLogger(__name__)


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
        trend_service: TrendAnalysisServiceProtocol,
        risk_service: RiskMetricsServiceProtocol,
        drawdown_service: DrawdownAnalysisServiceProtocol,
        rolling_service: RollingAnalyticsServiceProtocol,
        canonical_snapshot_service: CanonicalSnapshotServiceProtocol,
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

        cached = analytics_cache.get(cache_key)
        if cached is not None:
            logger.debug(
                "Dashboard cache hit",
                extra={"user_id": str(user_id), "cache_key": cache_key},
            )
            return cast(dict[str, Any], cached)

        snapshot_date = self.canonical_snapshot_service.get_snapshot_date(
            user_id, wallet_address
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

        if "trend" in normalized_metrics:
            await self._add_trend_section(
                dashboard, user_id, time_ranges, wallet_address, snapshot_date
            )

        if "risk" in normalized_metrics:
            await self._add_risk_section(
                dashboard, user_id, time_ranges, wallet_address
            )

        if "drawdown" in normalized_metrics:
            await self._add_drawdown_section(
                dashboard, user_id, time_ranges, wallet_address
            )

        if "rolling" in normalized_metrics:
            await self._add_rolling_section(
                dashboard, user_id, time_ranges, wallet_address
            )

        # Calculate aggregation statistics
        dashboard["_metadata"] = self._calculate_aggregation_stats(
            dashboard, normalized_metrics, snapshot_date
        )

        # Store in cache with conditional TTL (set by _wallet_cache_config above)
        analytics_cache.set(cache_key, dashboard, ttl=timedelta(hours=ttl_hours))

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

    async def _add_trend_section(
        self,
        dashboard: dict[str, Any],
        user_id: UUID,
        time_ranges: DashboardTimeRanges,
        wallet_address: str | None,
        snapshot_date: Any,
    ) -> None:
        dashboard["trends"] = await self._safe_call(
            "trends",
            lambda: self.trend_service.get_portfolio_trend(
                user_id,
                time_ranges.trend_days,
                wallet_address=wallet_address,
                snapshot_date=snapshot_date,
            ),
        )

    async def _add_risk_section(
        self,
        dashboard: dict[str, Any],
        user_id: UUID,
        time_ranges: DashboardTimeRanges,
        wallet_address: str | None,
    ) -> None:
        dashboard["risk_metrics"] = {
            "volatility": await self._safe_call(
                "risk_volatility",
                lambda: self.risk_service.calculate_portfolio_volatility(
                    user_id,
                    days=time_ranges.trend_days,
                    wallet_address=wallet_address,
                ),
            ),
            "sharpe_ratio": await self._safe_call(
                "risk_sharpe",
                lambda: self.risk_service.calculate_sharpe_ratio(
                    user_id,
                    days=time_ranges.trend_days,
                    wallet_address=wallet_address,
                ),
            ),
            "max_drawdown": await self._safe_call(
                "risk_max_drawdown",
                lambda: self.risk_service.calculate_max_drawdown(
                    user_id,
                    days=time_ranges.drawdown_days,
                    wallet_address=wallet_address,
                ),
            ),
        }

    async def _add_drawdown_section(
        self,
        dashboard: dict[str, Any],
        user_id: UUID,
        time_ranges: DashboardTimeRanges,
        wallet_address: str | None,
    ) -> None:
        dashboard["drawdown_analysis"] = {
            "enhanced": await self._safe_call(
                "enhanced_drawdown",
                lambda: self.drawdown_service.get_enhanced_drawdown_analysis(
                    user_id,
                    time_ranges.drawdown_days,
                    wallet_address=wallet_address,
                ),
            ),
            "underwater_recovery": await self._safe_call(
                "underwater_recovery",
                lambda: self.drawdown_service.get_underwater_recovery_analysis(
                    user_id,
                    time_ranges.drawdown_days,
                    wallet_address=wallet_address,
                ),
            ),
        }

    async def _add_rolling_section(
        self,
        dashboard: dict[str, Any],
        user_id: UUID,
        time_ranges: DashboardTimeRanges,
        wallet_address: str | None,
    ) -> None:
        dashboard["rolling_analytics"] = {
            "sharpe": await self._safe_call(
                "rolling_sharpe",
                lambda: self.rolling_service.get_rolling_sharpe_analysis(
                    user_id, time_ranges.rolling_days, wallet_address=wallet_address
                ),
            ),
            "volatility": await self._safe_call(
                "rolling_volatility",
                lambda: self.rolling_service.get_rolling_volatility_analysis(
                    user_id, time_ranges.rolling_days, wallet_address=wallet_address
                ),
            ),
        }

    async def _safe_call(
        self,
        service_name: str,
        fetcher: Callable[
            [],
            BaseModel | dict[str, Any] | Awaitable[BaseModel | dict[str, Any]] | None,
        ],
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
            result = fetcher()
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

        # Check all sections for errors
        sections: list[dict[str, Any] | None] = []
        if "trend" in metrics:
            sections.append(dashboard.get("trends"))
        if "risk" in metrics:
            risk_section = dashboard.get("risk_metrics", {})
            sections.extend(
                [
                    risk_section.get("volatility"),
                    risk_section.get("sharpe_ratio"),
                    risk_section.get("max_drawdown"),
                ]
            )
        if "drawdown" in metrics:
            drawdown_section = dashboard.get("drawdown_analysis", {})
            sections.extend(
                [
                    drawdown_section.get("enhanced"),
                    drawdown_section.get("underwater_recovery"),
                ]
            )
        if "rolling" in metrics:
            rolling_section = dashboard.get("rolling_analytics", {})
            sections.extend(
                [
                    rolling_section.get("sharpe"),
                    rolling_section.get("volatility"),
                ]
            )

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

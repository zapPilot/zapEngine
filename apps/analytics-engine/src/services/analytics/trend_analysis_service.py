"""
Trend Analysis Service - Portfolio trend and historical data analysis

Handles portfolio trend calculations, daily aggregations, and summary statistics
for historical portfolio performance visualization.
"""

import logging
from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, cast
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.database import db_manager
from src.models.analytics_responses import (
    DailyTrendDataPoint,
    PeriodInfo,
    PortfolioTrendResponse,
)
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.analytics.category_trend_base import CategoryTrendBaseService
from src.services.interfaces import QueryServiceProtocol, TrendAnalysisServiceProtocol
from src.services.transformers.category_data_transformer import (
    CategoryDailyAggregate,
)

logger = logging.getLogger(__name__)


def _log_trend_cache_stats(
    user_id: UUID,
    days: int,
    max_cache_days: int,
    data_points: int,
    start_time: datetime,
) -> None:
    """Log cache efficiency metrics for trend queries."""
    elapsed_ms = (datetime.now(UTC) - start_time).total_seconds() * 1000
    cache_efficiency_ratio = max_cache_days / days if days > 0 else 1.0
    cache_overfetch_factor = round(max_cache_days / days, 1) if days > 0 else 1.0

    logger.info(
        "trend_cache_stats",
        extra={
            "user_id": str(user_id),
            "requested_days": days,
            "cached_days": max_cache_days,
            "data_points": data_points,
            "cache_efficiency_ratio": round(cache_efficiency_ratio, 2),
            "elapsed_ms": round(elapsed_ms, 2),
            "likely_cache_hit": elapsed_ms < 50,
            "cache_overfetch_factor": cache_overfetch_factor,
        },
    )


class TrendAnalysisService(CategoryTrendBaseService, TrendAnalysisServiceProtocol):
    """Service for portfolio trend analysis and historical data aggregation."""

    MAX_CACHE_DAYS = 365
    """Maximum cache window for trend data.

    ⚠️ CRITICAL CONFIGURATION WARNING ⚠️

    This value affects cache key construction in the base class via
    fetch_time_range_query(). Changing this constant will:

    1. Invalidate ALL cached trend data
    2. Cause 100% cache miss rate on deployment
    3. Force all requests to hit the database
    4. Increase latency from ~10ms to ~200ms per request
    5. Risk connection pool exhaustion under load
    6. Potentially cause PRODUCTION OUTAGE

    Before modifying this value:
    1. Analyze actual user request patterns (p95, p99 window sizes)
    2. Load test with new value in staging environment
    3. Verify database can handle increased query load
    4. Prepare rollback plan (revert deployment + cache clear)
    5. Monitor cache hit rate for 24 hours post-deployment
    6. Have on-call engineer ready during deployment

    Current value (365) chosen to maximize cache reuse. Smaller windows
    (30d, 90d) are filtered in-memory from the cached 365-day dataset.

    See: fetch_time_range_query() in time_range_fetcher.py for cache key logic
    See: get_portfolio_trend() below for in-memory filtering implementation
    """

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol,
        context: PortfolioAnalyticsContext | None = None,
    ) -> None:
        """Initialize TrendAnalysisService with configuration validation.

        Args:
            db: Database session
            query_service: Query execution service
            context: Optional analytics context (created if not provided)

        Raises:
            ValueError: If MAX_CACHE_DAYS is outside safe range [30, 365]
        """
        super().__init__(db, query_service, context)

        # Validate MAX_CACHE_DAYS to prevent production incidents
        if not (30 <= self.MAX_CACHE_DAYS <= 365):
            raise ValueError(
                f"MAX_CACHE_DAYS must be between 30 and 365 days, got {self.MAX_CACHE_DAYS}. "
                f"This value affects cache key construction and changing it invalidates all cached data. "
                f"See class docstring for details on safe modification procedures."
            )

    def get_portfolio_trend(
        self,
        user_id: UUID,
        days: int = 30,
        wallet_address: str | None = None,
        limit: int = 100,
        snapshot_date: date | datetime | None = None,
    ) -> PortfolioTrendResponse:
        """See TrendAnalysisServiceProtocol.get_portfolio_trend"""
        start_time = datetime.now(UTC)

        anchor_date: date | None = None
        end_date_override: datetime | None = None
        if snapshot_date is not None:
            anchor_date = (
                snapshot_date.date()
                if isinstance(snapshot_date, datetime)
                else snapshot_date
            )
            end_date_override = datetime.combine(
                anchor_date + timedelta(days=1), time.min, tzinfo=UTC
            )

        # Calculate period info once for reuse in both code paths
        start_date, end_date, period_info_dict = self._date_range_with_period(
            days, end_date=end_date_override
        )
        period_info = PeriodInfo(**period_info_dict)

        _wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)

        # Always fetch max window, filter in-memory for smaller windows to reuse cache
        def compute(db_override: Session | None = None) -> PortfolioTrendResponse:
            payload = self._fetch_category_trend_payload(
                user_id,
                self.MAX_CACHE_DAYS,
                wallet_address=wallet_address,
                limit=limit,
                ttl_hours=ttl_hours,
                end_date=end_date_override,
                db_override=db_override,
            )

            trend_rows = payload.rows

            # transformer validates row integrity (non-NULL, non-negative totals)
            aggregates = self._ensure_aggregates(trend_rows)

            if not aggregates:
                summary = self._calculate_trend_summary([])
                response = PortfolioTrendResponse(
                    user_id=str(user_id),
                    period_days=days,
                    data_points=0,
                    daily_values=[],
                    summary=summary,
                    period_info=period_info,
                    snapshot_date=anchor_date,
                    message="No trend data available",
                )

                # Log cache efficiency metrics even for empty results
                _log_trend_cache_stats(
                    user_id, days, self.MAX_CACHE_DAYS, 0, start_time
                )

                return response

            # Filter in-memory for smaller windows (5-10ms vs 150-250ms DB query)
            if days < self.MAX_CACHE_DAYS:
                cutoff_date = start_date.date()
                aggregates = [agg for agg in aggregates if agg.date >= cutoff_date]
                if anchor_date is not None:
                    aggregates = [agg for agg in aggregates if agg.date <= anchor_date]

            # Add validation before building response models
            self._validate_aggregates(aggregates, user_id)
            daily_values_raw = self._build_daily_totals(aggregates)
            summary = self._calculate_trend_summary(aggregates)

            # Transform to Pydantic models
            daily_values = [DailyTrendDataPoint(**item) for item in daily_values_raw]

            snapshot_anchor = anchor_date
            if snapshot_anchor is None and aggregates:
                snapshot_anchor = aggregates[-1].date

            response = PortfolioTrendResponse(
                user_id=str(user_id),
                period_days=days,
                data_points=len(daily_values),
                daily_values=daily_values,
                summary=summary,
                period_info=period_info,
                snapshot_date=snapshot_anchor,
            )

            # Log cache efficiency metrics for monitoring
            _log_trend_cache_stats(
                user_id, days, self.MAX_CACHE_DAYS, len(daily_values), start_time
            )

            return response

        session_local = db_manager.SessionLocal

        # Create a thread-local session when the manager is initialized
        if session_local is not None:
            with session_local() as session:
                return compute(db_override=session)

        # Fallback to the injected session (testing contexts without db_manager)
        return compute()

    def _calculate_trend_summary(
        self,
        trend_data: Sequence[CategoryDailyAggregate] | Sequence[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Calculate summary statistics for portfolio trend data.

        Args:
            trend_data: Aggregated trend data per day or raw rows

        Returns:
            Dictionary with summary statistics based on total portfolio value
        """
        if not trend_data:
            return {
                "data_points": 0,
                "latest_value": 0.0,
                "earliest_value": 0.0,
                "change_usd": 0.0,
                "change_percentage": 0.0,
            }

        input_is_aggregated = isinstance(trend_data[0], CategoryDailyAggregate)
        aggregated_days = self._ensure_aggregates(trend_data)
        if not aggregated_days:
            return {
                "data_points": len(trend_data),
                "latest_value": 0.0,
                "earliest_value": 0.0,
                "change_usd": 0.0,
                "change_percentage": 0.0,
            }

        if input_is_aggregated:
            data_points = sum(len(day.rows) for day in aggregated_days)
        else:
            data_points = len(trend_data)

        earliest_value = float(aggregated_days[0].total_value_usd)
        latest_value = float(aggregated_days[-1].total_value_usd)

        change_usd = latest_value - earliest_value
        change_percentage = (
            (change_usd / earliest_value * 100) if earliest_value > 0 else 0.0
        )

        return {
            "data_points": data_points,
            "latest_value": latest_value,
            "earliest_value": earliest_value,
            "change_usd": change_usd,
            "change_percentage": change_percentage,
        }

    def _build_daily_totals(
        self,
        trend_data: Sequence[CategoryDailyAggregate] | Sequence[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Aggregate daily totals and category breakdowns from trend data.

        Args:
            trend_data: Aggregated trend data per day or raw rows

        Returns:
            List of daily aggregated totals with category breakdowns
        """
        if not trend_data:
            return []

        aggregated_days = self._ensure_aggregates(trend_data)
        if not aggregated_days:
            return []

        results: list[dict[str, Any]] = []
        prev_value: float | None = None

        for aggregate in aggregated_days:
            total_value_usd = float(aggregate.total_value_usd or 0.0)
            change_percentage = 0.0
            if prev_value is not None and prev_value > 0:
                change_percentage = ((total_value_usd - prev_value) / prev_value) * 100

            categories = [
                {
                    "category": row.get("category"),
                    "source_type": row.get("source_type"),
                    "value_usd": self.extract_category_value(row),
                    "assets_usd": float(row.get("category_assets_usd") or 0.0),
                    "debt_usd": float(row.get("category_debt_usd") or 0.0),
                    "pnl_usd": float(row.get("pnl_usd") or 0.0),
                }
                for row in aggregate.rows
            ]

            results.append(
                {
                    "date": aggregate.date,
                    "total_value_usd": total_value_usd,
                    "change_percentage": change_percentage,
                    "categories": categories,
                    "protocols": sorted(aggregate.protocols),
                }
            )

            prev_value = total_value_usd

        return results

    def _ensure_aggregates(
        self,
        data: Sequence[dict[str, Any]] | Sequence[CategoryDailyAggregate],
    ) -> list[CategoryDailyAggregate]:
        """Ensure data is in the form of CategoryDailyAggregate list.

        Args:
            data: Raw rows or partially aggregated list

        Returns:
            list[CategoryDailyAggregate]: Aggregated daily buckets
        """
        if not data:
            return []

        data_list = list(data)

        if isinstance(data_list[0], CategoryDailyAggregate):
            return cast(list[CategoryDailyAggregate], data_list)

        from src.core.exceptions import DataIntegrityError

        try:
            return self._category_transformer.aggregate(
                cast(list[dict[str, Any]], data_list)
            )
        except ValueError as e:
            # Map low-level transformer validation error to structured service error
            logger.error("Data integrity violation during aggregation: %s", str(e))
            raise DataIntegrityError(str(e)) from e

    def _validate_aggregates(
        self,
        aggregates: list[CategoryDailyAggregate],
        user_id: UUID,
    ) -> None:
        """Validate aggregate data integrity before Pydantic model construction.

        Ensures:
        - total_value_usd is not NULL (indicates SQL join failure)
        - total_value_usd is non-negative (portfolio cannot be negative)

        Raises:
            DataIntegrityError: If validation fails with detailed context
        """
        from src.core.exceptions import DataIntegrityError

        for aggregate in aggregates:
            if aggregate.total_value_usd is None:
                logger.error(
                    "Data integrity error: NULL total_value_usd detected",
                    extra={
                        "date": aggregate.date.isoformat(),
                        "user_id": str(user_id),
                        "category_count": len(aggregate.rows),
                    },
                )
                raise DataIntegrityError(
                    f"SQL query returned NULL total_value_usd for date {aggregate.date}. "
                    "This indicates a data quality issue or query logic error.",
                    context={
                        "date": aggregate.date.isoformat(),
                        "user_id": str(user_id),
                        "category_count": len(aggregate.rows),
                    },
                )

            if aggregate.total_value_usd < 0:
                logger.error(
                    "Data integrity error: Negative total_value_usd detected",
                    extra={
                        "date": aggregate.date.isoformat(),
                        "total_value_usd": aggregate.total_value_usd,
                        "user_id": str(user_id),
                    },
                )
                raise DataIntegrityError(
                    f"Portfolio total_value_usd is negative ({aggregate.total_value_usd}) "
                    f"for date {aggregate.date}. Portfolio net worth cannot be negative.",
                    context={
                        "date": aggregate.date.isoformat(),
                        "total_value_usd": aggregate.total_value_usd,
                        "user_id": str(user_id),
                        "category_totals": dict(aggregate.category_totals),
                    },
                )

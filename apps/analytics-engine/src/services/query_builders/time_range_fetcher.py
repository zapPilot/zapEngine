"""Utilities for building and caching time-range based query executions."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.cache_service import analytics_cache


@dataclass(frozen=True)
class TimeRangeQueryPayload:
    """Container for cached time-range query responses."""

    rows: list[dict[str, Any]]
    period_info: dict[str, Any]
    start_date: datetime
    end_date: datetime


class SupportsAnalyticsQueries(Protocol):
    """Protocol describing the BaseAnalyticsService interface we depend on."""

    def uuid_to_str(self, user_id: UUID | str) -> str:  # pragma: no cover - protocol
        ...

    def _date_range_with_period(
        self, days: int, end_date: datetime | None = None
    ) -> tuple[datetime, datetime, dict[str, Any]]:  # pragma: no cover - protocol
        ...

    def _execute_query(
        self,
        query_name: str,
        params: dict[str, Any] | None = None,
        *,
        db: Session | None = None,
    ) -> list[dict[str, Any]]:  # pragma: no cover - protocol
        ...

    def _with_cache(
        self,
        cache_key: str,
        fetcher: Callable[[], TimeRangeQueryPayload],
        ttl_hours: int | None = None,
    ) -> TimeRangeQueryPayload:  # pragma: no cover - protocol
        ...


def _build_time_range_cache_key(
    service: SupportsAnalyticsQueries,
    *,
    cache_namespace: str,
    user_id: UUID,
    wallet_address: str | None,
    days: int,
    limit: int | None,
    end_date: datetime | None,
) -> str:
    """Build cache key for time-range query payloads."""
    user_key = service.uuid_to_str(user_id)
    wallet_key = wallet_address or "bundle"
    key_parts: list[Any] = [cache_namespace, user_key, wallet_key, days]
    if limit is not None:
        key_parts.append(limit)
    if end_date is not None:
        key_parts.append(end_date.isoformat())
    return analytics_cache.build_key(*key_parts)


def _build_time_range_query_params(
    service: SupportsAnalyticsQueries,
    *,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime,
    wallet_address: str | None,
    include_end_date: bool,
    limit: int | None,
) -> dict[str, Any]:
    """Build SQL parameter payload for time-range query execution."""
    query_params: dict[str, Any] = {
        "user_id": service.uuid_to_str(user_id),
        "start_date": start_date,
        "wallet_address": wallet_address,
    }
    if include_end_date:
        query_params["end_date"] = end_date
    if limit is not None:
        query_params["limit"] = limit
    return query_params


def fetch_time_range_query(
    service: SupportsAnalyticsQueries,
    *,
    cache_namespace: str,
    query_name: str,
    user_id: UUID,
    days: int,
    wallet_address: str | None = None,
    limit: int | None = None,
    include_end_date: bool = True,
    end_date: datetime | None = None,
    ttl_hours: int | None = 12,
    db_override: Session | None = None,
) -> TimeRangeQueryPayload:
    """Execute a time-range query once and cache the payload for reuse.

    Args:
        service: Analytics service providing database helpers.
        cache_namespace: Prefix used when constructing the cache key.
        query_name: Registered SQL query name to execute.
        user_id: Target user identifier for the query.
        days: Rolling window length used to derive the time range.
        wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).
                       When provided, filters to specific wallet address.
        limit: Optional row limit to pass to the query.
        include_end_date: Whether to include the computed end date parameter.
        end_date: Optional end date override to anchor the time range.
        ttl_hours: Cache TTL override. Defaults to 12 hours to match analytics cache.

    Returns:
        ``TimeRangeQueryPayload`` containing raw rows and derived metadata.
    """
    cache_key = _build_time_range_cache_key(
        service,
        cache_namespace=cache_namespace,
        user_id=user_id,
        wallet_address=wallet_address,
        days=days,
        limit=limit,
        end_date=end_date,
    )

    def compute() -> TimeRangeQueryPayload:
        computed_start, computed_end, computed_period = service._date_range_with_period(
            days, end_date=end_date
        )

        query_params = _build_time_range_query_params(
            service,
            user_id=user_id,
            start_date=computed_start,
            end_date=computed_end,
            wallet_address=wallet_address,
            include_end_date=include_end_date,
            limit=limit,
        )

        rows = service._execute_query(query_name, query_params, db=db_override)

        return TimeRangeQueryPayload(
            rows=rows,
            period_info=computed_period,
            start_date=computed_start,
            end_date=computed_end,
        )

    return service._with_cache(cache_key, compute, ttl_hours=ttl_hours)

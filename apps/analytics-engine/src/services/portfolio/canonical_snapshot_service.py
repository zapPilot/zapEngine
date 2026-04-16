"""
Canonical Snapshot Service

Provides single source of truth for snapshot date selection across all analytics.
All services should call this FIRST to get the canonical "as-of" date before
querying snapshot data, ensuring consistency across all endpoints.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, cast
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.cache_service import analytics_cache
from src.models.analytics_responses import SnapshotInfo
from src.services.interfaces import (
    CanonicalSnapshotServiceProtocol,
    QueryServiceProtocol,
)
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class CanonicalSnapshotService(CanonicalSnapshotServiceProtocol):
    """
    Single source of truth for snapshot date selection.

    Ensures all analytics endpoints (landing, dashboard, trends, risk) use
    the same "as-of" date, preventing inconsistencies from ETL retries or
    partial data updates.

    Key Features:
    - Returns latest date with ANY snapshot data (wallets without data are excluded)
    - Supports wallet-specific filtering for granular queries
    - Caches results (5min TTL) for recency
    - Optionally validates snapshot completeness when needed

    Usage:
        # Get canonical snapshot date FIRST
        snapshot_date = canonical_service.get_snapshot_date(user_id)

        # Then pass to all downstream services
        portfolio = portfolio_service.get_snapshot(user_id, snapshot_date)
        pools = pool_service.get_performance(user_id, snapshot_date)
        roi = roi_calculator.calculate(user_id, snapshot_date)
    """

    # Cache TTL for snapshot date queries (5 minutes for recency)
    SNAPSHOT_DATE_CACHE_TTL_HOURS = 5 / 60  # 5 minutes in hours

    def __init__(self, db: Session, query_service: QueryServiceProtocol) -> None:
        """
        Initialize CanonicalSnapshotService.

        Args:
            db: Database session
            query_service: Query execution service
        """
        self.db = db
        self.query_service = query_service

    def get_snapshot_info(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> SnapshotInfo | None:
        """See CanonicalSnapshotServiceProtocol.get_snapshot_info."""
        # Build cache key
        wallet_key = wallet_address or "bundle"
        cache_key = analytics_cache.build_key(
            "canonical_snapshot_info", str(user_id), wallet_key
        )

        # Try cache first (5min TTL)
        cached = analytics_cache.get(cache_key)
        if cached is not None:
            # Handle potential legacy cached values or dicts
            if isinstance(cached, date):
                return SnapshotInfo(  # pragma: no cover
                    snapshot_date=cached, wallet_count=0, last_updated=None
                )
            if isinstance(cached, dict):
                return SnapshotInfo(**cached)  # pragma: no cover
            return cast(SnapshotInfo | None, cached)

        # Query database
        result = self.query_service.execute_query_one(
            self.db,
            QUERY_NAMES.CANONICAL_SNAPSHOT_DATE,
            {"user_id": str(user_id), "wallet_address": wallet_address},
        )

        if result is None:
            logger.warning(
                "No snapshot data found for user_id=%s, wallet=%s",
                user_id,
                wallet_address or "all",
            )
            # Cache None to avoid repeated queries
            analytics_cache.set(
                cache_key,
                None,
                ttl=timedelta(hours=self.SNAPSHOT_DATE_CACHE_TTL_HOURS),
            )
            return None

        # Extract fields
        snapshot_date = result.get("snapshot_date")
        max_snapshot_at = result.get("max_snapshot_at")
        wallet_count = result.get("wallet_count", 0)

        if snapshot_date is None:
            logger.error("Query result missing snapshot_date: %s", result)
            return None

        info = SnapshotInfo(
            snapshot_date=snapshot_date,
            wallet_count=wallet_count,
            last_updated=max_snapshot_at,
        )

        logger.info(
            "Canonical snapshot info: %s (user_id=%s, wallet=%s)",
            info,
            user_id,
            wallet_key,
        )

        # Cache the result
        analytics_cache.set(
            cache_key,
            info,
            ttl=timedelta(hours=self.SNAPSHOT_DATE_CACHE_TTL_HOURS),
        )

        return info

    def get_snapshot_date(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> date | None:
        """
        Get the latest snapshot date (backward compatible).
        Delegates to get_snapshot_info.
        """
        info = self.get_snapshot_info(user_id, wallet_address)
        return info.snapshot_date if info else None

    def get_snapshot_date_range(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> tuple[date, date]:
        """See CanonicalSnapshotServiceProtocol.get_snapshot_date_range."""
        latest_date = self.get_snapshot_date(user_id, wallet_address)
        if latest_date is None:
            raise ValueError(f"No snapshot data exists for user_id={user_id}")

        # End date is latest_snapshot + 1 day (exclusive upper bound for SQL queries)
        end_date = latest_date + timedelta(days=1)

        # Start date is days back from end_date
        start_date = end_date - timedelta(days=days)

        logger.debug(
            "Computed snapshot date range: %s to %s (days=%d, user_id=%s)",
            start_date,
            end_date,
            days,
            user_id,
        )

        return start_date, end_date

    def validate_snapshot_consistency(
        self,
        user_id: UUID,
        snapshot_date: date,
        expected_wallet_count: int | None = None,
    ) -> dict[str, Any]:
        """See CanonicalSnapshotServiceProtocol.validate_snapshot_consistency."""
        # Query for this specific date (re-run the canonical query with date filter)
        # For now, this is a simplified version - full validation would require
        # additional SQL queries to check each wallet individually

        result = self.query_service.execute_query_one(
            self.db,
            QUERY_NAMES.CANONICAL_SNAPSHOT_DATE,
            {"user_id": str(user_id), "wallet_address": None},
        )

        if result is None or result.get("snapshot_date") != snapshot_date:
            # Snapshot date doesn't match current canonical date
            return {
                "is_complete": False,
                "wallet_count": 0,
                "missing_wallets": [],
                "has_wallet_tokens": False,
                "error": "Snapshot date does not match canonical snapshot",
            }

        wallet_count = result.get("wallet_count", 0)
        is_complete = True

        if expected_wallet_count is not None:
            is_complete = wallet_count == expected_wallet_count

        return {
            "is_complete": is_complete,
            "wallet_count": wallet_count,
            "missing_wallets": [],  # Would require additional query to determine
            "has_wallet_tokens": True,  # Would require additional query to verify
        }

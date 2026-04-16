"""Service providing the canonical portfolio snapshot calculation."""

from __future__ import annotations

import logging
import time
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.exceptions import ValidationError
from src.models.analytics_responses import DailyTrendDataPoint, PortfolioTrendResponse
from src.models.portfolio_snapshot import (
    CategoryTotals,
    PortfolioSnapshot,
    WalletTrendOverride,
)
from src.services.interfaces import QueryServiceProtocol, TrendAnalysisServiceProtocol
from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class PortfolioSnapshotService(BaseAnalyticsService):
    """Builds portfolio snapshot payloads from trend data."""

    CACHE_VERSION = "v5"  # Bumped for snapshot_date requirement

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol,
        trend_service: TrendAnalysisServiceProtocol,
    ) -> None:
        super().__init__(db, query_service, context=None)
        if trend_service is None:
            raise ValueError("Trend analysis service is required")
        self._trend_service = trend_service

    def get_portfolio_snapshot(
        self,
        user_id: UUID,
        *,
        snapshot_date: date,
    ) -> PortfolioSnapshot | None:
        """Return the canonical snapshot for the supplied user.

        Args:
            user_id: User identifier
            snapshot_date: Explicit snapshot date to use. Callers MUST provide the
                           canonical snapshot date from CanonicalSnapshotService.

        Returns:
            Portfolio snapshot for the specified date, or None if no data exists
        """
        start_time = time.time()

        if snapshot_date is None:  # pragma: no cover - defensive
            raise ValueError("snapshot_date is required for portfolio snapshots")

        cache_key = self._cache_key(
            "portfolio_snapshot", user_id, "date", str(snapshot_date)
        )

        def compute() -> PortfolioSnapshot | None:
            # Fetch user wallets
            t1 = time.time()
            wallet_addresses = self._fetch_user_wallets(user_id)
            logger.info(
                "PERF: [%s] Fetch wallets: %.2fms",
                self.__class__.__name__,
                (time.time() - t1) * 1000,
            )

            # Get trend data
            t2 = time.time()
            trend_response = self._trend_service.get_portfolio_trend(
                user_id, days=1, snapshot_date=snapshot_date
            )
            logger.info(
                "PERF: [%s] Get trend data for snapshot_date=%s: %.2fms",
                self.__class__.__name__,
                snapshot_date,
                (time.time() - t2) * 1000,
            )

            # Build snapshot
            t3 = time.time()
            snapshot = self._build_portfolio_snapshot(
                user_id=user_id,
                trend_response=trend_response,
                wallet_addresses=wallet_addresses,
                snapshot_date=snapshot_date,
            )
            logger.info(
                "PERF: [%s] Build snapshot: %.2fms",
                self.__class__.__name__,
                (time.time() - t3) * 1000,
            )

            return snapshot

        snapshot = self._with_cache(cache_key, compute)

        logger.info(
            "PERF: [%s] Total: %.2fms",
            self.__class__.__name__,
            (time.time() - start_time) * 1000,
        )
        return snapshot

    def _build_portfolio_snapshot(
        self,
        *,
        user_id: UUID,
        trend_response: PortfolioTrendResponse,
        wallet_addresses: list[str],
        snapshot_date: date,
    ) -> PortfolioSnapshot | None:
        """Transform trend response rows into a snapshot payload.

        Args:
            user_id: User identifier
            trend_response: Trend data from TrendAnalysisService
            wallet_addresses: List of user wallet addresses
            snapshot_date: Explicit date to use. If provided, finds the exact day matching this date.
                          If None, uses latest complete day logic (legacy).

        Returns:
            Portfolio snapshot or None if no matching data found
        """

        if not trend_response.daily_values:
            logger.info(
                "No trend data available for snapshot",
                extra={"user_id": str(user_id)},
            )
            return None

        latest_day = self._get_day_by_date(trend_response.daily_values, snapshot_date)
        if latest_day is None:
            logger.warning(
                "No trend data found for snapshot_date=%s",
                snapshot_date,
                extra={"user_id": str(user_id)},
            )
            return None

        if isinstance(latest_day, Mapping):
            categories = latest_day.get("categories") or []
            last_updated = latest_day.get("date")
        else:
            categories = latest_day.categories or []
            last_updated = latest_day.date

        defi_assets = self._initialise_category_totals()
        wallet_assets = self._initialise_category_totals()
        category_debt = self._initialise_category_totals()

        for row in categories:
            category = (row.get("category") or "others").lower()
            if category not in defi_assets:
                category = "others"

            assets = float(row.get("assets_usd") or row.get("value_usd") or 0.0)
            debt = float(row.get("debt_usd") or 0.0)
            source_type = (row.get("source_type") or "").lower()

            if source_type == "wallet":
                wallet_assets[category] += assets
            else:
                defi_assets[category] += assets

            category_debt[category] += debt

        total_assets_defi = sum(defi_assets.values())
        total_assets_wallet = sum(wallet_assets.values())
        total_assets = total_assets_defi + total_assets_wallet
        total_debt = sum(category_debt.values())

        wallet_token_count = sum(1 for value in wallet_assets.values() if value > 0) * 3

        wallet_override = WalletTrendOverride(
            categories=dict(wallet_assets),
            total_value=total_assets_wallet,
        )

        try:
            snapshot = PortfolioSnapshot(
                user_id=str(user_id),
                snapshot_date=snapshot_date,
                wallet_addresses=wallet_addresses,
                wallet_count=len(wallet_addresses),
                last_updated=last_updated,
                total_assets=total_assets,
                total_debt=total_debt,
                net_portfolio_value=total_assets - total_debt,
                category_summary_assets=CategoryTotals.from_mapping(defi_assets),
                category_summary_debt=CategoryTotals.from_mapping(category_debt),
                wallet_assets=CategoryTotals.from_mapping(wallet_assets),
                wallet_token_count=wallet_token_count,
                wallet_override=wallet_override,
            )
        except ValueError as exc:  # pragma: no cover - defensive (Pydantic validation)
            raise ValidationError(
                "Portfolio snapshot validation failed",
                context={"user_id": str(user_id)},
            ) from exc

        return snapshot

    def _fetch_user_wallets(self, user_id: UUID) -> list[str]:
        """Fetch the wallets associated with a user."""

        rows = self.query_service.execute_query(
            self.db,
            QUERY_NAMES.USER_WALLETS,
            {"user_id": str(user_id)},
        )
        return [row["wallet_address"] for row in rows]

    def _get_day_by_date(
        self,
        daily_values: Sequence[DailyTrendDataPoint | Mapping[str, Any]],
        target_date: date,
    ) -> DailyTrendDataPoint | Mapping[str, Any] | None:
        """Find the day matching the exact target_date.

        Args:
            daily_values: List of DailyTrendDataPoint objects
            target_date: Date to find

        Returns:
            Matching day or None if not found
        """
        for day in daily_values:
            # Handle both Pydantic model attributes and dict access
            day_date = day.get("date") if isinstance(day, Mapping) else day.date

            # Check for None explicitly
            if day_date is None:
                continue

            # Compare dates (handle both date and datetime objects)
            day_date_only = day_date.date() if hasattr(day_date, "date") else day_date
            if day_date_only == target_date:
                logger.info(
                    "Found exact day for snapshot_date=%s",
                    target_date,
                )
                return day

        # No exact match found
        return None

    @staticmethod
    def _initialise_category_totals() -> dict[str, float]:
        """Helper to create a zeroed category mapping."""

        return {"btc": 0.0, "eth": 0.0, "stablecoins": 0.0, "others": 0.0}

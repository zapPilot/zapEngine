"""Shared base class for services consuming category trend analytics."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, ClassVar
from uuid import UUID

from sqlalchemy.orm import Session

from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.interfaces import QueryServiceProtocol
from src.services.query_builders.time_range_fetcher import (
    TimeRangeQueryPayload,
    fetch_time_range_query,
)
from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES
from src.services.transformers.category_data_transformer import (
    CategoryDataTransformer,
)

logger = logging.getLogger(__name__)


class CategoryTrendBaseService(BaseAnalyticsService):
    """Base service wiring category trend dependencies."""

    _transformer_cls: ClassVar[type[CategoryDataTransformer]] = CategoryDataTransformer
    _category_trend_cache_namespace: ClassVar[str] = "category_trend_rows"

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol,
        context: PortfolioAnalyticsContext | None = None,
    ) -> None:
        super().__init__(db, query_service, context)
        self._category_transformer = self._transformer_cls()

    @classmethod
    def extract_category_value(cls, row: dict[str, Any]) -> float:
        """Expose consistent value extraction for downstream helpers."""

        return cls._transformer_cls.extract_row_value(row)

    def _fetch_category_trend_payload(
        self,
        user_id: UUID,
        days: int,
        *,
        wallet_address: str | None = None,
        limit: int | None = None,
        end_date: datetime | None = None,
        ttl_hours: int | None = None,
        db_override: Session | None = None,
    ) -> TimeRangeQueryPayload:
        """Shared fetcher for category trend SQL rows with conditional routing.

        Returns the cached query payload used by allocation and trend services.
        Typical usage keeps business logic focused on transform/aggregation steps::

            payload = self._fetch_category_trend_payload(user_id, days, limit=100)
            trend_rows = payload.rows
            period_info = payload.period_info

        Conditional Routing:
            - Bundle queries (wallet_address is None): Use MV for 15-25x performance (5-15ms)
            - Wallet-specific queries: Use runtime query for accurate filtering (150-250ms)

        Args:
            user_id: Portfolio owner to query for.
            days: Rolling window size used to derive the date range.
            wallet_address: Optional wallet filter. When None, returns bundle data (all wallets).
                           When provided, filters to specific wallet address.
            limit: Optional cap on returned rows (forwarded to SQL query).
            end_date: Optional end date override to anchor the time range.
            ttl_hours: Cache TTL override. If None, uses adaptive TTL:
                      - Bundle (wallet_address=None): 12 hours (stable data)
                      - Wallet-specific: 2 hours (more volatile)
        """

        # CONDITIONAL ROUTING:
        # - Bundle queries (wallet_address is None): Use MV (fast, 5-15ms)
        # - Wallet-specific queries: Use runtime query (accurate, 150-250ms)
        if wallet_address is not None:
            # Wallet-specific: use runtime query for accurate filtering
            query_name = QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_BY_USER_ID
            logger.info(
                "Using runtime query for wallet-specific request: "
                "user_id=%s, wallet=%s",
                user_id,
                wallet_address,
            )
        else:
            # Bundle (all wallets): use MV for performance
            query_name = QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
            logger.debug("Using MV query for bundle request: user_id=%s", user_id)

        if ttl_hours is None:
            _, ttl_hours = self._wallet_cache_config(wallet_address)

        return fetch_time_range_query(
            self,
            cache_namespace=self._category_trend_cache_namespace,
            query_name=query_name,
            user_id=user_id,
            days=days,
            wallet_address=wallet_address,
            limit=limit,
            end_date=end_date,
            ttl_hours=ttl_hours,
            db_override=db_override,
        )

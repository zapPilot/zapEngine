"""
Stock Price Database Service - Database integration for S&P500 (SPY) historical price data

Provides read-only access to SPY price snapshots collected
by alpha-etl from the alpha_raw.stock_price_snapshots table.
"""

import logging
from datetime import date, datetime
from typing import Any, TypedDict, cast

from sqlalchemy.orm import Session

from src.services.interfaces import QueryServiceProtocol
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class StockPriceDmaPoint(TypedDict):
    """SPY DMA value and metadata for a single date."""

    price_usd: float
    dma_200: float | None
    is_above_dma: bool | None


class StockPriceService:
    """
    Service for querying S&P500 (SPY) historical price data from the database.

    Reads SPY price snapshots collected by alpha-etl from
    alpha_raw.stock_price_snapshots and stock_price_dma_snapshots tables.
    Used for portfolio rotation decisions (crypto vs S&P500).
    """

    DEFAULT_SYMBOL: str = "SPY"

    def __init__(
        self, db: Session, query_service: QueryServiceProtocol | None = None
    ) -> None:
        """
        Initialize the service with database session and query service.

        Args:
            db: SQLAlchemy Session instance for database operations
            query_service: Service for executing named SQL queries
        """
        self.db = db
        if query_service is None:
            from src.services.dependencies import get_query_service

            self.query_service = get_query_service()
        else:
            self.query_service = query_service

    @staticmethod
    def _coerce_dma_snapshot_date(raw_date: object) -> date:
        """Convert raw DMA row date into ``date``."""
        if isinstance(raw_date, datetime):
            return raw_date.date()
        if isinstance(raw_date, date):
            return raw_date
        if isinstance(raw_date, str):
            return date.fromisoformat(raw_date)
        raise ValueError(f"Invalid snapshot_date in DMA row: {raw_date!r}")

    @staticmethod
    def _coerce_positive_float(
        raw_value: object, snapshot_date: date, field_name: str
    ) -> float:
        """Convert a numeric field into a validated positive finite float."""
        try:
            numeric_value = float(cast(Any, raw_value))
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid {field_name} value for {snapshot_date}: {raw_value!r}"
            ) from exc
        if numeric_value <= 0 or not numeric_value < float("inf"):
            raise ValueError(
                f"{field_name} must be positive for {snapshot_date}: {numeric_value}"
            )
        return numeric_value

    def get_dma_history(
        self,
        start_date: date,
        end_date: date,
        symbol: str = "SPY",
    ) -> dict[date, StockPriceDmaPoint]:
        """
        Get SPY DMA history keyed by snapshot date.

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            symbol: Stock symbol to filter by (default: "SPY")

        Returns:
            Mapping from snapshot date to DMA point dict with price_usd, dma_200, is_above_dma

        Raises:
            ValueError: If any row contains invalid date or dma_200 value
            Exception: If database query fails
        """
        try:
            logger.info(
                "Fetching %s DMA history from %s to %s",
                symbol,
                start_date,
                end_date,
            )

            result = self.query_service.execute_query(
                self.db,
                QUERY_NAMES.STOCK_PRICE_DMA_HISTORY,
                {
                    "start_date": start_date,
                    "end_date": end_date,
                },
            )

            out: dict[date, StockPriceDmaPoint] = {}
            for row in result:
                snapshot_date = self._coerce_dma_snapshot_date(row.get("snapshot_date"))
                price_usd = self._coerce_positive_float(
                    row.get("price_usd"), snapshot_date, "price_usd"
                )

                dma_200: float | None = None
                is_above_dma: bool | None = None

                raw_dma = row.get("dma_200")
                if raw_dma is not None:
                    dma_200 = self._coerce_positive_float(
                        raw_dma, snapshot_date, "dma_200"
                    )

                raw_is_above = row.get("is_above_dma")
                if raw_is_above is not None:
                    is_above_dma = bool(raw_is_above)

                out[snapshot_date] = StockPriceDmaPoint(
                    price_usd=price_usd,
                    dma_200=dma_200,
                    is_above_dma=is_above_dma,
                )

            logger.info(
                "Successfully fetched %d %s DMA snapshots",
                len(out),
                symbol,
            )
            return out

        except Exception as error:
            logger.exception(
                "Failed to fetch %s DMA history from %s to %s: %s",
                symbol,
                start_date,
                end_date,
                error,
            )
            raise

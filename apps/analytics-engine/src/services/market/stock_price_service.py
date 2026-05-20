"""
Stock Price Database Service - Database integration for S&P500 (SPY) historical price data

Provides read-only access to SPY price snapshots collected
by alpha-etl from the alpha_raw.stock_price_snapshots table.
"""

import logging
from datetime import date
from typing import TypedDict

from src.services.market._coercion import (
    coerce_dma_snapshot_date,
    coerce_positive_float,
)
from src.services.market.query_backed_service import QueryBackedMarketService
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class StockPriceDmaPoint(TypedDict):
    """SPY DMA value and metadata for a single date."""

    price_usd: float
    dma_200: float | None
    is_above_dma: bool | None


class StockPriceService(QueryBackedMarketService):
    """
    Service for querying S&P500 (SPY) historical price data from the database.

    Reads SPY price snapshots collected by alpha-etl from
    alpha_raw.stock_price_snapshots and stock_price_dma_snapshots tables.
    Used for portfolio rotation decisions (crypto vs S&P500).
    """

    DEFAULT_SYMBOL: str = "SPY"

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
                snapshot_date = coerce_dma_snapshot_date(row.get("snapshot_date"))
                price_usd = coerce_positive_float(
                    row.get("price_usd"), snapshot_date, "price_usd"
                )

                dma_200: float | None = None
                is_above_dma: bool | None = None

                raw_dma = row.get("dma_200")
                if raw_dma is not None:
                    dma_200 = coerce_positive_float(raw_dma, snapshot_date, "dma_200")

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

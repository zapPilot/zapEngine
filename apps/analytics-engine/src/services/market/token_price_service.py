"""
Token Price Database Service - Database integration for cryptocurrency historical price data

Provides read-only access to token price snapshots (BTC, ETH, SOL, etc.) collected
by alpha-etl from the alpha_raw.token_price_snapshots table.
"""

import logging
import math
from datetime import UTC, date, datetime, timedelta
from typing import Any, TypedDict, cast

from sqlalchemy.orm import Session

from src.models.token_price import TokenPriceSnapshot
from src.services.interfaces import QueryServiceProtocol
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class PairRatioDmaPoint(TypedDict):
    """Pair-ratio value and DMA metadata for a single date."""

    ratio: float
    dma_200: float | None
    is_above_dma: bool | None


class TokenPriceService:
    """
    Service for querying token historical price data from the database.

    Reads token price snapshots collected by alpha-etl from
    alpha_raw.token_price_snapshots table for portfolio benchmarking.
    Supports multiple tokens (BTC, ETH, SOL, etc.) with backward compatibility.
    """

    def __init__(
        self, db: Session, query_service: QueryServiceProtocol | None = None
    ) -> None:
        """
        Initialize the service with database session and query service.

        Args:
            db: SQLAlchemy Session instance for database operations
            query_service: Service for executing named SQL queries (optional for backward compat)
        """
        self.db = db
        # Handle optional query_service for backward compatibility or test ease
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
        if raw_value is None:
            raise ValueError(
                f"Invalid {field_name} value for {snapshot_date}: {raw_value!r}"
            )
        try:
            numeric_value = float(cast(Any, raw_value))
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid {field_name} value for {snapshot_date}: {raw_value!r}"
            ) from exc

        if (
            math.isnan(numeric_value)
            or math.isinf(numeric_value)
            or numeric_value <= 0.0
        ):
            raise ValueError(
                f"Invalid {field_name} value for {snapshot_date}: {raw_value!r}"
            )

        return numeric_value

    @classmethod
    def _coerce_dma_value(cls, raw_dma: object, snapshot_date: date) -> float:
        """Convert raw DMA value into validated positive finite float."""
        return cls._coerce_positive_float(raw_dma, snapshot_date, "dma_200")

    @classmethod
    def _coerce_optional_positive_float(
        cls, raw_value: object, snapshot_date: date, field_name: str
    ) -> float | None:
        """Convert optional numeric field into validated positive finite float."""
        if raw_value is None:
            return None
        return cls._coerce_positive_float(raw_value, snapshot_date, field_name)

    @staticmethod
    def _coerce_optional_bool(raw_value: object) -> bool | None:
        """Convert raw boolean-ish values into ``bool | None``."""
        if raw_value is None or isinstance(raw_value, bool):
            return raw_value
        if isinstance(raw_value, (int, float)):
            return bool(raw_value)
        if isinstance(raw_value, str):
            normalized = raw_value.strip().lower()
            if normalized in {"t", "true", "1"}:
                return True
            if normalized in {"f", "false", "0"}:
                return False
        raise ValueError(f"Invalid is_above_dma value: {raw_value!r}")

    @staticmethod
    def _build_snapshot(row: dict[str, Any]) -> TokenPriceSnapshot:
        """Build ``TokenPriceSnapshot`` from a database row."""
        market_cap = row["market_cap_usd"]
        volume_24h = row["volume_24h_usd"]
        return TokenPriceSnapshot(
            date=str(row["snapshot_date"]),
            price_usd=float(row["price_usd"]),
            market_cap_usd=float(market_cap) if market_cap is not None else None,
            volume_24h_usd=float(volume_24h) if volume_24h is not None else None,
            source=row["source"],
            token_symbol=row["token_symbol"],
            token_id=row["token_id"],
        )

    def get_price_history(
        self,
        days: int = 90,
        token_symbol: str = "BTC",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[TokenPriceSnapshot]:
        """
        Get token price history for the specified number of days or date range.

        Args:
            days: Number of days of history (1-365, default: 90). Used only if start_date/end_date not provided.
            token_symbol: Token symbol to filter by (default: 'BTC')
            start_date: Explicit start date (overrides days calculation)
            end_date: Explicit end date (overrides today)

        Returns:
            List of TokenPriceSnapshot sorted by date (oldest first)

        Raises:
            Exception: If database query fails
        """
        try:
            # If explicit dates provided, use them
            if start_date is not None and end_date is not None:
                query_start = start_date
                query_end = end_date
            else:
                # Fall back to "last N days from today" behavior
                query_end = datetime.now(UTC).date()
                query_start = query_end - timedelta(days=days)

            logger.info(
                f"Fetching {token_symbol} price history from {query_start} to {query_end}"
            )

            result = self.query_service.execute_query(
                self.db,
                QUERY_NAMES.TOKEN_PRICE_HISTORY,
                {
                    "start_date": query_start,
                    "end_date": query_end,
                    "token_symbol": token_symbol,
                },
            )

            snapshots = [self._build_snapshot(row) for row in result]

            logger.info(
                "Successfully fetched %d %s price snapshots",
                len(snapshots),
                token_symbol,
            )

            return snapshots

        except Exception as error:
            logger.exception(
                "Failed to fetch %s price history: %s", token_symbol, error
            )
            raise

    def get_dma_history(
        self,
        start_date: date,
        end_date: date,
        token_symbol: str = "BTC",
    ) -> dict[date, float]:
        """Get token DMA history keyed by snapshot date.

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            token_symbol: Token symbol to filter by (default: "BTC")

        Returns:
            Mapping from snapshot date to DMA200 value

        Raises:
            ValueError: If any row contains invalid date or dma_200 value
            Exception: If database query fails
        """
        try:
            logger.info(
                "Fetching %s DMA200 history from %s to %s",
                token_symbol,
                start_date,
                end_date,
            )

            result = self.query_service.execute_query(
                self.db,
                QUERY_NAMES.TOKEN_PRICE_DMA_HISTORY,
                {
                    "start_date": start_date,
                    "end_date": end_date,
                    "token_symbol": token_symbol,
                },
            )

            out: dict[date, float] = {}
            for row in result:
                snapshot_date = self._coerce_dma_snapshot_date(row.get("snapshot_date"))
                dma_value = self._coerce_dma_value(row.get("dma_200"), snapshot_date)
                out[snapshot_date] = dma_value

            logger.info(
                "Successfully fetched %d %s DMA snapshots",
                len(out),
                token_symbol,
            )
            return out

        except Exception as error:
            logger.exception(
                "Failed to fetch %s DMA history from %s to %s: %s",
                token_symbol,
                start_date,
                end_date,
                error,
            )
            raise

    def get_pair_ratio_dma_history(
        self,
        start_date: date,
        end_date: date,
        base_token_symbol: str = "ETH",
        quote_token_symbol: str = "BTC",
    ) -> dict[date, PairRatioDmaPoint]:
        """Get pair-ratio DMA history keyed by snapshot date."""
        try:
            logger.info(
                "Fetching %s/%s ratio DMA history from %s to %s",
                base_token_symbol,
                quote_token_symbol,
                start_date,
                end_date,
            )

            result = self.query_service.execute_query(
                self.db,
                QUERY_NAMES.TOKEN_PAIR_RATIO_DMA_HISTORY,
                {
                    "start_date": start_date,
                    "end_date": end_date,
                    "base_token_symbol": base_token_symbol,
                    "quote_token_symbol": quote_token_symbol,
                },
            )

            out: dict[date, PairRatioDmaPoint] = {}
            for row in result:
                snapshot_date = self._coerce_dma_snapshot_date(row.get("snapshot_date"))
                out[snapshot_date] = {
                    "ratio": self._coerce_positive_float(
                        row.get("ratio_value"), snapshot_date, "ratio_value"
                    ),
                    "dma_200": self._coerce_optional_positive_float(
                        row.get("dma_200"), snapshot_date, "dma_200"
                    ),
                    "is_above_dma": self._coerce_optional_bool(row.get("is_above_dma")),
                }

            logger.info(
                "Successfully fetched %d %s/%s ratio DMA snapshots",
                len(out),
                base_token_symbol,
                quote_token_symbol,
            )
            return out

        except Exception as error:
            logger.exception(
                "Failed to fetch %s/%s ratio DMA history from %s to %s: %s",
                base_token_symbol,
                quote_token_symbol,
                start_date,
                end_date,
                error,
            )
            raise

    def get_latest_price(self, token_symbol: str = "BTC") -> TokenPriceSnapshot | None:
        """
        Get the most recent token price snapshot.

        Args:
            token_symbol: Token symbol to filter by (default: 'BTC')

        Returns:
            TokenPriceSnapshot: Latest snapshot or None if no data exists

        Raises:
            Exception: If database query fails
        """
        try:
            logger.info("Fetching latest %s price snapshot", token_symbol)

            row = self.query_service.execute_query_one(
                self.db,
                QUERY_NAMES.TOKEN_LATEST_PRICE,
                {"token_symbol": token_symbol},
            )

            if not row:
                logger.warning("No %s price data found in database", token_symbol)
                return None

            snapshot = self._build_snapshot(row)

            logger.info(
                "Latest %s price: $%s on %s",
                token_symbol,
                format(snapshot.price_usd, ",.2f"),
                snapshot.date,
            )

            return snapshot

        except Exception as error:
            logger.exception("Failed to fetch latest %s price: %s", token_symbol, error)
            raise

    def get_price_for_date(
        self, date: str, token_symbol: str = "BTC"
    ) -> TokenPriceSnapshot | None:
        """
        Get token price snapshot for a specific date.

        Args:
            date: Date string in YYYY-MM-DD format
            token_symbol: Token symbol to filter by (default: 'BTC')

        Returns:
            TokenPriceSnapshot: Snapshot for the date or None if not found

        Raises:
            Exception: If database query fails
        """
        try:
            logger.info("Fetching %s price for date: %s", token_symbol, date)

            row = self.query_service.execute_query_one(
                self.db,
                QUERY_NAMES.TOKEN_PRICE_BY_DATE,
                {"date": date, "token_symbol": token_symbol},
            )

            if not row:
                logger.warning(
                    "No %s price data found for date: %s", token_symbol, date
                )
                return None

            snapshot = self._build_snapshot(row)

            logger.info(
                "%s price on %s: $%s",
                token_symbol,
                date,
                format(snapshot.price_usd, ",.2f"),
            )

            return snapshot

        except Exception as error:
            logger.exception(
                "Failed to fetch %s price for date %s: %s", token_symbol, date, error
            )
            raise

    def get_snapshot_count(self, token_symbol: str = "BTC") -> int:
        """
        Get total count of token price snapshots in database.

        Args:
            token_symbol: Token symbol to filter by (default: 'BTC')

        Returns:
            int: Total snapshot count for the token

        Raises:
            Exception: If database query fails
        """
        try:
            row = self.query_service.execute_query_one(
                self.db,
                QUERY_NAMES.TOKEN_SNAPSHOT_COUNT,
                {"token_symbol": token_symbol},
            )

            count = int(row["count"]) if row else 0

            logger.info("Total %s price snapshots in database: %d", token_symbol, count)

            return count

        except Exception as error:
            logger.exception("Failed to get %s snapshot count: %s", token_symbol, error)
            raise

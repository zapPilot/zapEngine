"""
Sentiment Database Service - Database integration for market sentiment data

Provides read-only access to sentiment snapshots collected by alpha-etl
from the alpha_raw.sentiment_snapshots table, replacing external API calls.

Refactored to use:
- SQLAlchemy Session for database queries
- Centralized error handling
- Consistent data transformation
- Comprehensive logging
"""

import logging
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any, TypeVar, cast

from sqlalchemy.orm import Session

from src.exceptions.market_sentiment import (
    InternalError,
    MarketSentimentError,
)
from src.models.market_sentiment import MarketSentimentResponse
from src.services.interfaces import QueryServiceProtocol
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)
SentimentResultT = TypeVar("SentimentResultT")


class SentimentDatabaseService:
    """
    Service for querying market sentiment data from the database.

    Replaces external API calls by reading sentiment snapshots collected
    by alpha-etl from alpha_raw.sentiment_snapshots table.

    All responses have cached=True since data always comes from database.
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

    def _handle_query_error(self, error: Exception, context: str) -> InternalError:
        """
        Handle database query errors.

        Args:
            error: Exception from database query
            context: Description of what operation was attempted

        Returns:
            InternalError: Domain exception for database errors
        """
        logger.exception("Database error during %s: %s", context, error)
        error_msg = f"Database error during {context}: {str(error)[:200]}"
        return InternalError(reason=error_msg)

    def _transform_db_row_to_response(
        self, row: dict[str, object], cached: bool = True
    ) -> MarketSentimentResponse:
        """
        Transform database row to MarketSentimentResponse model.

        Args:
            row: Database row as dictionary with keys:
                - sentiment_value: int (0-100)
                - classification: str (e.g., 'Fear', 'Greed')
                - source: str (e.g., 'alternative.me', 'coinmarketcap')
                - snapshot_time: datetime in UTC
            cached: Always True for database responses

        Returns:
            MarketSentimentResponse: Validated response model

        Raises:
            ValueError: If required fields are missing or invalid
        """
        try:
            # Extract and validate required fields
            value_raw = row.get("sentiment_value")
            if value_raw is not None:
                value = int(cast(int | float | str, value_raw))
            else:
                value = 0
            if not (0 <= value <= 100):
                raise ValueError(f"Invalid sentiment value: {value}")

            classification_raw = row.get("classification", "")
            classification = (
                str(classification_raw).strip() if classification_raw else ""
            )
            if not classification:
                raise ValueError("Classification cannot be empty")

            source_raw = row.get("source", "alternative.me")
            source = str(source_raw).strip() if source_raw else "alternative.me"
            snapshot_time = row.get("snapshot_time")

            # Ensure timestamp is timezone-aware UTC
            if isinstance(snapshot_time, datetime):
                if snapshot_time.tzinfo is None:
                    # Assume UTC if not specified
                    snapshot_time = snapshot_time.replace(tzinfo=UTC)
                else:
                    # Convert to UTC if needed
                    snapshot_time = snapshot_time.astimezone(UTC)
            else:
                raise ValueError(f"Invalid timestamp type: {type(snapshot_time)}")

            return MarketSentimentResponse(
                value=value,
                status=classification,
                timestamp=snapshot_time,
                source=source,
                cached=cached,
            )

        except Exception as transformation_error:
            logger.error("Failed to transform database row: %s", transformation_error)
            raise

    def _run_query_operation(
        self,
        context: str,
        operation: Callable[[], SentimentResultT],
        *,
        passthrough_errors: tuple[type[Exception], ...] = (),
    ) -> SentimentResultT:
        try:
            return operation()
        except passthrough_errors:
            raise
        except MarketSentimentError:
            raise
        except Exception as query_error:
            error = self._handle_query_error(query_error, context)
            raise error from query_error

    def get_current_sentiment_sync(self) -> MarketSentimentResponse:
        """
        Get the most recent market sentiment snapshot from database.

        Queries alpha_raw.sentiment_snapshots table for the latest entry
        ordered by snapshot_time DESC with LIMIT 1.

        Returns:
            MarketSentimentResponse: Most recent sentiment data

        Raises:
            HTTPException: 500 if query fails or no data available
        """

        def operation() -> MarketSentimentResponse:
            logger.info("Querying database for current sentiment snapshot")

            # Execute named query via QueryService
            row = self.query_service.execute_query_one(
                self.db, QUERY_NAMES.SENTIMENT_CURRENT
            )

            if row is None:
                logger.warning("No sentiment snapshots found in database")
                raise ValueError("No sentiment data available in database")

            response = self._transform_db_row_to_response(row, cached=True)

            logger.info(
                "Current sentiment retrieved: value=%s, status=%s, timestamp=%s",
                response.value,
                response.status,
                response.timestamp,
            )

            return response

        return self._run_query_operation("get_current_sentiment", operation)

    async def get_current_sentiment(self) -> MarketSentimentResponse:
        """Async wrapper for protocol compatibility. Delegates to sync implementation."""
        return self.get_current_sentiment_sync()

    async def get_sentiment_history(
        self, hours: int = 24
    ) -> list[MarketSentimentResponse]:
        """
        Get historical sentiment snapshots within the specified time range.

        Queries alpha_raw.sentiment_snapshots for all entries from the last
        N hours, ordered by snapshot_time ASC.

        Args:
            hours: Number of hours of history to retrieve (default: 24)

        Returns:
            list[MarketSentimentResponse]: List of historical snapshots

        Raises:
            ValueError: If hours is invalid
            HTTPException: 500 if query fails
        """

        def operation() -> list[MarketSentimentResponse]:
            if hours < 1:
                raise ValueError("Hours must be >= 1")

            logger.info("Querying sentiment history for last %d hours", hours)

            # Calculate start timestamp for query
            min_timestamp = datetime.now(UTC) - timedelta(hours=hours)

            # Execute named query
            rows = self.query_service.execute_query(
                self.db,
                QUERY_NAMES.SENTIMENT_HISTORY,
                {"min_timestamp": min_timestamp},
            )

            if not rows:
                logger.info("No sentiment snapshots found for last %d hours", hours)
                return []

            # Transform each row to response model
            responses = []
            for row in rows:
                try:
                    response = self._transform_db_row_to_response(row, cached=True)
                    responses.append(response)
                except Exception as row_error:
                    logger.warning(
                        "Skipping malformed row in sentiment history: %s",
                        row_error,
                    )
                    continue

            logger.info(
                "Retrieved %d sentiment snapshots from last %d hours",
                len(responses),
                hours,
            )

            return responses

        return self._run_query_operation(
            "get_sentiment_history",
            operation,
            passthrough_errors=(ValueError,),
        )

    async def get_sentiment_at_time(
        self, target_time: datetime
    ) -> MarketSentimentResponse | None:
        """
        Get sentiment snapshot closest to the specified time.

        Queries for the snapshot with the minimum time difference from
        the target time within a reasonable window.

        Args:
            target_time: The time to find sentiment data for

        Returns:
            MarketSentimentResponse: Closest sentiment snapshot, or None if not found

        Raises:
            ValueError: If target_time is invalid
            HTTPException: 500 if query fails
        """

        def operation() -> MarketSentimentResponse | None:
            if not isinstance(target_time, datetime):
                raise ValueError("target_time must be a datetime object")

            # Ensure UTC timezone
            if target_time.tzinfo is None:
                normalized_time = target_time.replace(tzinfo=UTC)
            else:
                normalized_time = target_time.astimezone(UTC)

            logger.info("Querying sentiment snapshot closest to %s", normalized_time)

            # Execute named query
            row = self.query_service.execute_query_one(
                self.db,
                QUERY_NAMES.SENTIMENT_AT_TIME,
                {"target_time": normalized_time},
            )

            if row is None:
                logger.info("No sentiment snapshot found near time %s", normalized_time)
                return None

            response = self._transform_db_row_to_response(row, cached=True)

            logger.info(
                "Found sentiment near %s: value=%s, timestamp=%s",
                normalized_time,
                response.value,
                response.timestamp,
            )

            return response

        return self._run_query_operation(
            "get_sentiment_at_time",
            operation,
            passthrough_errors=(ValueError,),
        )

    def get_daily_sentiment_aggregates(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get daily aggregated sentiment values for time series alignment.

        Aggregates intraday sentiment snapshots to daily averages, min, max
        for alignment with daily token price data. If no date range provided,
        fetches all available data.

        Args:
            start_date: Start date (inclusive, optional - fetches all if None)
            end_date: End date (inclusive, optional - fetches all if None)

        Returns:
            List of daily sentiment aggregates with:
            - snapshot_date: date
            - avg_sentiment: Decimal (aggregated average)
            - min_sentiment: int
            - max_sentiment: int
            - snapshot_count: int
            - primary_classification: str

        Raises:
            MarketSentimentError: If data fetch fails
        """
        try:
            logger.info(
                "Fetching daily sentiment aggregates: start=%s, end=%s",
                start_date,
                end_date,
            )

            rows = self.query_service.execute_query(
                self.db,
                QUERY_NAMES.SENTIMENT_DAILY_AGGREGATES,
                {"start_date": start_date, "end_date": end_date},
            )

            logger.info("Retrieved %d daily sentiment aggregates", len(rows))

            return rows

        except Exception as error:
            logger.exception("Failed to fetch daily sentiment aggregates: %s", error)
            raise InternalError(
                f"Failed to fetch daily sentiment aggregates: {error}"
            ) from error

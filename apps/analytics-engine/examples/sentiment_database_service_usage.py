"""
Examples of using SentimentDatabaseService in the analytics-engine application.

This file demonstrates:
1. Direct service usage with database sessions
2. FastAPI endpoint integration
3. Integration with other services
4. Error handling patterns
5. Timezone handling
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from src.services.sentiment_database_service import SentimentDatabaseService

from src.core.database import get_db
from src.models.market_sentiment import MarketSentimentResponse

# ============================================================================
# Example 1: Direct Service Usage
# ============================================================================


async def example_basic_usage(db: Session) -> None:
    """Basic usage pattern for getting sentiment data."""
    service = SentimentDatabaseService(db)

    # Get current sentiment (most recent snapshot)
    current_sentiment = await service.get_current_sentiment()
    print(f"Current sentiment: {current_sentiment.value}")
    print(f"Status: {current_sentiment.status}")
    print(f"Timestamp: {current_sentiment.timestamp}")
    print(f"From cache: {current_sentiment.cached}")


async def example_historical_data(db: Session) -> None:
    """Get historical sentiment data over a time range."""
    service = SentimentDatabaseService(db)

    # Get last 24 hours (144 snapshots at 10-min intervals)
    day_history = await service.get_sentiment_history(hours=24)
    print(f"Day history: {len(day_history)} snapshots")

    # Get last 7 days (1,008 snapshots)
    week_history = await service.get_sentiment_history(hours=168)
    print(f"Week history: {len(week_history)} snapshots")

    # Get last 30 days (4,320 snapshots)
    month_history = await service.get_sentiment_history(hours=720)
    print(f"Month history: {len(month_history)} snapshots")

    # Calculate average sentiment over period
    if week_history:
        avg_value = sum(s.value for s in week_history) / len(week_history)
        print(f"Week average sentiment: {avg_value:.1f}")


async def example_point_in_time(db: Session) -> None:
    """Get sentiment data at a specific point in time."""
    service = SentimentDatabaseService(db)

    # Find sentiment closest to a specific time
    target_time = datetime(2025, 1, 15, 12, 30, 0, tzinfo=UTC)
    sentiment = await service.get_sentiment_at_time(target_time)

    if sentiment:
        print(f"Sentiment at {target_time}: {sentiment.value}")
        print(f"Closest snapshot time: {sentiment.timestamp}")
    else:
        print(f"No sentiment data found near {target_time}")


# ============================================================================
# Example 2: FastAPI Endpoints
# ============================================================================


router = APIRouter(prefix="/api/sentiment", tags=["sentiment"])


@router.get("/current", response_model=MarketSentimentResponse)
async def get_current_sentiment(
    db: Session = Depends(get_db),
) -> MarketSentimentResponse:
    """
    Get the current market sentiment.

    Returns the most recent sentiment snapshot from the database.
    """
    service = SentimentDatabaseService(db)
    return await service.get_current_sentiment()


@router.get("/history", response_model=list[MarketSentimentResponse])
async def get_sentiment_history(
    hours: int = 24,
    db: Session = Depends(get_db),
) -> list[MarketSentimentResponse]:
    """
    Get historical sentiment data.

    Args:
        hours: Number of hours of history (default: 24)

    Returns:
        List of sentiment snapshots ordered by timestamp
    """
    if hours < 1:
        raise ValueError("Hours must be >= 1")

    service = SentimentDatabaseService(db)
    return await service.get_sentiment_history(hours=hours)


@router.get("/at-time", response_model=MarketSentimentResponse | None)
async def get_sentiment_at_time(
    timestamp: str,
    db: Session = Depends(get_db),
) -> MarketSentimentResponse | None:
    """
    Get sentiment closest to a specific timestamp.

    Args:
        timestamp: ISO 8601 timestamp string

    Returns:
        Closest sentiment snapshot, or None if not found
    """
    target_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    service = SentimentDatabaseService(db)
    return await service.get_sentiment_at_time(target_time)


# ============================================================================
# Example 3: Integration with Other Services
# ============================================================================


class LandingPageBuilderWithSentiment:
    """Example of integrating sentiment service with other services."""

    def __init__(self, db: Session):
        self.db = db
        self.sentiment_service = SentimentDatabaseService(db)

    async def build_landing_page_data(self) -> dict:
        """Build landing page with current sentiment data."""
        try:
            # Get current sentiment
            current_sentiment = await self.sentiment_service.get_current_sentiment()

            # Get recent trend (last 7 days)
            week_history = await self.sentiment_service.get_sentiment_history(hours=168)

            # Calculate statistics
            if week_history:
                values = [s.value for s in week_history]
                avg = sum(values) / len(values)
                trend = "up" if values[-1] > values[0] else "down"
            else:
                avg = current_sentiment.value
                trend = "stable"

            return {
                "current_sentiment": {
                    "value": current_sentiment.value,
                    "status": current_sentiment.status,
                    "timestamp": current_sentiment.timestamp.isoformat(),
                },
                "statistics": {
                    "week_average": avg,
                    "trend": trend,
                    "data_points": len(week_history),
                },
            }

        except Exception as e:
            # Handle gracefully
            return {
                "error": f"Failed to load sentiment data: {str(e)}",
                "current_sentiment": None,
                "statistics": None,
            }


# ============================================================================
# Example 4: Error Handling Patterns
# ============================================================================


async def example_error_handling(db: Session) -> None:
    """Demonstrate error handling patterns."""
    service = SentimentDatabaseService(db)

    # Pattern 1: Handle missing data
    try:
        sentiment = await service.get_current_sentiment()
    except Exception as e:
        print(f"Failed to get sentiment: {e}")
        # Provide default or cached value
        sentiment = None

    # Pattern 2: Handle parameter validation
    try:
        history = await service.get_sentiment_history(hours=-1)
    except ValueError as e:
        print(f"Invalid parameters: {e}")
        # Retry with valid parameters
        history = await service.get_sentiment_history(hours=24)

    print(f"Retrieved {len(history)} history records after validation retry")

    # Pattern 3: Handle timeout in point-in-time query
    try:
        very_old_time = datetime(2020, 1, 1, tzinfo=UTC)
        sentiment = await service.get_sentiment_at_time(very_old_time)
        if sentiment is None:
            print("No data available for the requested time period")
    except Exception as e:
        print(f"Failed to query at time: {e}")


# ============================================================================
# Example 5: Timezone Handling
# ============================================================================


async def example_timezone_handling(db: Session) -> None:
    """Demonstrate timezone handling."""
    service = SentimentDatabaseService(db)
    from datetime import timezone

    # Naive datetime (assumed UTC)
    naive_time = datetime(2025, 1, 15, 12, 0, 0)
    sentiment1 = await service.get_sentiment_at_time(naive_time)
    print(f"Naive datetime: {sentiment1}")

    # UTC timezone explicitly
    utc_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
    sentiment2 = await service.get_sentiment_at_time(utc_time)
    print(f"UTC datetime: {sentiment2}")

    # Other timezone (e.g., UTC+2)
    utc_plus_2 = timezone(timedelta(hours=2))
    other_time = datetime(2025, 1, 15, 14, 0, 0, tzinfo=utc_plus_2)
    sentiment3 = await service.get_sentiment_at_time(other_time)
    # This converts 14:00 UTC+2 = 12:00 UTC
    print(f"UTC+2 datetime: {sentiment3}")

    # Response timestamps always UTC
    if sentiment3:
        assert sentiment3.timestamp.tzinfo == UTC
        print("Response timestamp is always UTC")


# ============================================================================
# Example 6: Data Transformation and Statistics
# ============================================================================


class SentimentAnalytics:
    """Helper class for analyzing sentiment data."""

    def __init__(self, db: Session):
        self.db = db
        self.service = SentimentDatabaseService(db)

    async def get_sentiment_statistics(self, hours: int = 24) -> dict:
        """Calculate sentiment statistics over a time period."""
        history = await self.service.get_sentiment_history(hours=hours)

        if not history:
            return {"error": "No data available"}

        values = [s.value for s in history]

        return {
            "count": len(history),
            "min": min(values),
            "max": max(values),
            "average": sum(values) / len(values),
            "latest": values[-1],
            "oldest": values[0],
            "trend": "increasing" if values[-1] > values[0] else "decreasing",
            "volatility": self._calculate_volatility(values),
        }

    @staticmethod
    def _calculate_volatility(values: list[int]) -> float:
        """Calculate volatility (standard deviation) of sentiment values."""
        if len(values) < 2:
            return 0.0

        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        return variance**0.5


# ============================================================================
# Example 7: FastAPI Route with Full Error Handling
# ============================================================================


@router.get("/dashboard", response_model=dict)
async def get_sentiment_dashboard(
    days: int = 7,
    db: Session = Depends(get_db),
) -> dict:
    """
    Complete sentiment dashboard endpoint.

    Combines current sentiment, historical data, and statistics.
    """
    try:
        if days < 1 or days > 365:
            raise ValueError("Days must be between 1 and 365")

        service = SentimentDatabaseService(db)
        hours = days * 24

        # Get current sentiment
        current = await service.get_current_sentiment()

        # Get history
        history = await service.get_sentiment_history(hours=hours)

        # Calculate statistics
        if history:
            values = [s.value for s in history]
            stats = {
                "min": min(values),
                "max": max(values),
                "average": sum(values) / len(values),
                "count": len(values),
            }
        else:
            stats = {
                "min": current.value,
                "max": current.value,
                "average": current.value,
                "count": 1,
            }

        return {
            "status": "success",
            "current": {
                "value": current.value,
                "status": current.status,
                "timestamp": current.timestamp.isoformat(),
            },
            "statistics": stats,
            "trend": {
                "direction": "up" if history[-1].value > current.value else "down",
                "data_points": len(history),
            },
        }

    except ValueError as e:
        return {
            "status": "error",
            "error": str(e),
            "current": None,
            "statistics": None,
            "trend": None,
        }

    except Exception as e:
        return {
            "status": "error",
            "error": f"Unexpected error: {str(e)[:100]}",
            "current": None,
            "statistics": None,
            "trend": None,
        }


# ============================================================================
# Usage Instructions
# ============================================================================

"""
To use these examples in your application:

1. Basic usage:
   from examples.sentiment_database_service_usage import example_basic_usage
   await example_basic_usage(db_session)

2. Add endpoints to your FastAPI app:
   from examples.sentiment_database_service_usage import router
   app.include_router(router)

3. Integrate with services:
   from examples.sentiment_database_service_usage import LandingPageBuilderWithSentiment
   builder = LandingPageBuilderWithSentiment(db)
   data = await builder.build_landing_page_data()

4. Use analytics:
   from examples.sentiment_database_service_usage import SentimentAnalytics
   analytics = SentimentAnalytics(db)
   stats = await analytics.get_sentiment_statistics(hours=24)
"""

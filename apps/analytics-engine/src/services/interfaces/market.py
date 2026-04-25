import typing
from datetime import date, datetime
from typing import Any, Protocol, TypedDict

if typing.TYPE_CHECKING:
    from src.services.market.token_price_service import PairRatioDmaPoint

from src.models.market_dashboard import MarketDashboardResponse
from src.models.market_sentiment import (
    MarketSentimentHealthResponse,
    MarketSentimentResponse,
)
from src.models.regime_tracking import RegimeHistoryResponse
from src.models.token_price import TokenPriceSnapshot


class MarketSentimentServiceProtocol(Protocol):
    """Interface for market sentiment data services."""

    async def get_market_sentiment(self) -> MarketSentimentResponse:
        """
        Get current market sentiment with caching.

        Returns cached data if available and valid, otherwise fetches from external API.

        Returns:
            MarketSentimentResponse: Current market sentiment data

        Raises:
            HTTPException: Various HTTP errors based on failure mode
        """
        ...  # pragma: no cover

    def get_health_status(self) -> MarketSentimentHealthResponse:
        """
        Get health status of the sentiment service including cache information.

        Returns:
            MarketSentimentHealthResponse: Service health status
        """
        ...  # pragma: no cover


class SentimentDatabaseServiceProtocol(Protocol):
    """Interface for database sentiment query services."""

    def get_current_sentiment_sync(self) -> MarketSentimentResponse:
        """
        Get the most recent market sentiment snapshot from database (sync).

        Returns:
            MarketSentimentResponse: Most recent sentiment data

        Raises:
            HTTPException: 503 if no sentiment data available
        """
        ...  # pragma: no cover

    async def get_current_sentiment(self) -> MarketSentimentResponse:
        """
        Get the most recent market sentiment snapshot from database.

        Returns:
            MarketSentimentResponse: Most recent sentiment data

        Raises:
            HTTPException: 503 if no sentiment data available
        """
        ...  # pragma: no cover

    async def get_sentiment_history(
        self, hours: int = 24
    ) -> list[MarketSentimentResponse]:
        """
        Get historical sentiment snapshots within the specified time range.

        Args:
            hours: Number of hours of history to retrieve (default: 24)

        Returns:
            list[MarketSentimentResponse]: List of historical sentiment snapshots
                                           in descending order (most recent first)

        Raises:
            HTTPException: 503 if database query fails
        """
        ...  # pragma: no cover

    async def get_sentiment_at_time(
        self, target_time: datetime
    ) -> MarketSentimentResponse | None:
        """
        Get sentiment snapshot closest to the specified time.

        Args:
            target_time: Target datetime to find nearest sentiment for

        Returns:
            MarketSentimentResponse | None: Nearest sentiment snapshot or None if not found

        Raises:
            HTTPException: 503 if database query fails
        """
        ...  # pragma: no cover

    def get_daily_sentiment_aggregates(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get daily aggregated sentiment values for time series alignment.

        Args:
            start_date: Start date (inclusive, optional)
            end_date: End date (inclusive, optional)

        Returns:
            List of daily sentiment aggregates with snapshot_date,
            avg_sentiment, min_sentiment, max_sentiment, snapshot_count,
            primary_classification
        """
        ...  # pragma: no cover


class TokenPriceServiceProtocol(Protocol):
    """Interface for token price data retrieval service."""

    def get_latest_price(self, token_symbol: str = "BTC") -> TokenPriceSnapshot | None:
        """
        Get latest price for a token.

        Args:
            token_symbol: Token symbol (e.g., "BTC", "ETH") (default: "BTC")

        Returns:
            TokenPriceSnapshot or None if not found
        """
        ...  # pragma: no cover

    def get_price_history(
        self,
        days: int = 90,
        token_symbol: str = "BTC",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[TokenPriceSnapshot]:
        """
        Get historical price data for a token.

        Args:
            days: Number of days of history (1-365, default: 90)
            token_symbol: Token symbol (default: "BTC")
            start_date: Explicit start date (optional)
            end_date: Explicit end date (optional)

        Returns:
            List of TokenPriceSnapshot sorted by date (oldest first)
        """
        ...  # pragma: no cover

    def get_price_for_date(
        self, date: str, token_symbol: str = "BTC"
    ) -> TokenPriceSnapshot | None:
        """
        Get price for a specific date.

        Args:
            date: Date string in YYYY-MM-DD format
            token_symbol: Token symbol (default: "BTC")

        Returns:
            TokenPriceSnapshot or None if not found
        """
        ...  # pragma: no cover

    def get_dma_history(
        self,
        start_date: date,
        end_date: date,
        token_symbol: str = "BTC",
    ) -> dict[date, float]:
        """Get 200DMA values indexed by date.

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            token_symbol: Token symbol (default: "BTC")

        Returns:
            Mapping from snapshot date to DMA200 value
        """
        ...  # pragma: no cover

    def get_pair_ratio_dma_history(
        self,
        start_date: date,
        end_date: date,
        base_token_symbol: str = "ETH",
        quote_token_symbol: str = "BTC",
    ) -> dict[date, "PairRatioDmaPoint"]:
        """Get pair-ratio values indexed by date.

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            base_token_symbol: Base token symbol (default: "ETH")
            quote_token_symbol: Quote token symbol (default: "BTC")

        Returns:
            Mapping from snapshot date to ratio, DMA200, and above/below flag
        """
        ...  # pragma: no cover

    def get_snapshot_count(self, token_symbol: str = "BTC") -> int:
        """
        Get count of price snapshots for a token.

        Args:
            token_symbol: Token symbol (default: "BTC")

        Returns:
            Number of snapshots available
        """
        ...  # pragma: no cover


class RegimeTrackingServiceProtocol(Protocol):
    """Interface for market regime tracking service."""

    def get_regime_history(
        self, limit: int = 2, since: datetime | None = None
    ) -> RegimeHistoryResponse:
        """
        Get market regime transition history with direction calculation.

        Args:
            limit: Maximum number of regime transitions to return (default: 2)
            since: Optional timestamp to filter transitions (default: None)

        Returns:
            RegimeHistoryResponse with current, previous, direction, and transitions
        """
        ...  # pragma: no cover


class StockPriceDmaPoint(TypedDict):
    """SPY DMA value and metadata for a single date."""

    price_usd: float
    dma_200: float | None
    is_above_dma: bool | None


class StockPriceServiceProtocol(Protocol):
    """Interface for stock price (SPY) data services."""

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
        """
        ...  # pragma: no cover


class MarketDashboardServiceProtocol(Protocol):
    """Interface for market dashboard aggregation service."""

    def get_market_dashboard(
        self, days: int = 365, token_symbol: str = "BTC"
    ) -> MarketDashboardResponse:
        """
        Get combined market data for dashboard visualization.

        Args:
            days: Days of history (default: 365)
            token_symbol: Token symbol (default: "BTC")

        Returns:
            MarketDashboardResponse with merged Price, DMA, and Sentiment
        """
        ...  # pragma: no cover

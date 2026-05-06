import typing
from datetime import date, datetime
from typing import Any, Protocol, TypedDict

if typing.TYPE_CHECKING:
    from src.services.market.macro_fear_greed_service import MacroFearGreedPoint
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

    async def get_market_sentiment(
        self,
    ) -> MarketSentimentResponse: ...  # pragma: no cover

    def get_health_status(
        self,
    ) -> MarketSentimentHealthResponse: ...  # pragma: no cover


class SentimentDatabaseServiceProtocol(Protocol):
    """Interface for database sentiment query services."""

    def get_current_sentiment_sync(
        self,
    ) -> MarketSentimentResponse: ...  # pragma: no cover

    async def get_current_sentiment(
        self,
    ) -> MarketSentimentResponse: ...  # pragma: no cover

    # fmt: off
    async def get_sentiment_history(self, hours: int = 24, *, start_time: datetime | date | None = None, end_time: datetime | date | None = None) -> list[MarketSentimentResponse]: ...  # pragma: no cover

    async def get_sentiment_at_time(self, target_time: datetime) -> MarketSentimentResponse | None: ...  # pragma: no cover

    def get_daily_sentiment_aggregates(self, start_date: date | None = None, end_date: date | None = None) -> list[dict[str, Any]]: ...  # pragma: no cover
    # fmt: on


class MacroFearGreedDatabaseServiceProtocol(Protocol):
    """Interface for read-only CNN macro Fear & Greed data."""

    def get_current_macro_fear_greed(
        self,
    ) -> "MacroFearGreedPoint | None": ...  # pragma: no cover

    # fmt: off
    def get_daily_macro_fear_greed(self, start_date: date | None = None, end_date: date | None = None) -> dict[date, "MacroFearGreedPoint"]: ...  # pragma: no cover
    # fmt: on


class TokenPriceServiceProtocol(Protocol):
    """Interface for token price data retrieval service."""

    def get_latest_price(
        self, token_symbol: str = "BTC"
    ) -> TokenPriceSnapshot | None: ...  # pragma: no cover

    # fmt: off
    def get_price_history(self, days: int = 90, token_symbol: str = "BTC", start_date: date | None = None, end_date: date | None = None) -> list[TokenPriceSnapshot]: ...  # pragma: no cover

    def get_price_for_date(self, date: str, token_symbol: str = "BTC") -> TokenPriceSnapshot | None: ...  # pragma: no cover

    def get_dma_history(self, start_date: date, end_date: date, token_symbol: str = "BTC") -> dict[date, float]: ...  # pragma: no cover

    def get_pair_ratio_dma_history(self, start_date: date, end_date: date, base_token_symbol: str = "ETH", quote_token_symbol: str = "BTC") -> dict[date, "PairRatioDmaPoint"]: ...  # pragma: no cover
    # fmt: on

    def get_snapshot_count(
        self, token_symbol: str = "BTC"
    ) -> int: ...  # pragma: no cover


class RegimeTrackingServiceProtocol(Protocol):
    """Interface for market regime tracking service."""

    def get_regime_history(
        self, limit: int = 2, since: datetime | None = None
    ) -> RegimeHistoryResponse: ...  # pragma: no cover


class StockPriceDmaPoint(TypedDict):
    """SPY DMA value and metadata for a single date."""

    price_usd: float
    dma_200: float | None
    is_above_dma: bool | None


class StockPriceServiceProtocol(Protocol):
    """Interface for stock price (SPY) data services."""

    def get_dma_history(
        self, start_date: date, end_date: date, symbol: str = "SPY"
    ) -> dict[date, StockPriceDmaPoint]: ...  # pragma: no cover


class MarketDashboardServiceProtocol(Protocol):
    """Interface for market dashboard aggregation service."""

    def get_market_dashboard(
        self, days: int = 365
    ) -> MarketDashboardResponse: ...  # pragma: no cover

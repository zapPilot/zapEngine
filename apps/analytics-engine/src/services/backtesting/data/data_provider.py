"""Data provider for backtesting simulations.

This module handles fetching and normalizing market data (prices, sentiments)
for use in backtesting strategies. It abstracts the data access layer from
the simulation logic.
"""

from __future__ import annotations

import logging
from collections.abc import Collection
from datetime import date
from typing import TYPE_CHECKING, Any

from src.services.backtesting.data.feature_loader import resolve_price_feature_history
from src.services.backtesting.data.forward_fill import forward_fill_daily
from src.services.backtesting.features import (
    ETH_BTC_RATIO_FEATURE,
    ETH_USD_PRICE_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_PRICE_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.utils import coerce_to_date
from src.services.market.macro_fear_greed_history import (
    resolve_macro_fear_greed_history,
)

if TYPE_CHECKING:  # pragma: no cover
    from src.services.interfaces import (
        MacroFearGreedDatabaseServiceProtocol,
        SentimentDatabaseServiceProtocol,
        TokenPriceServiceProtocol,
    )
    from src.services.interfaces.market import StockPriceServiceProtocol

logger = logging.getLogger(__name__)


class BacktestDataProvider:
    """Provides normalized market data for backtesting simulations.

    This class encapsulates data fetching logic, converting service-specific
    response formats into standardized dicts for simulation consumption.

    Attributes:
        token_price_service: Service for fetching historical token prices.
        sentiment_service: Service for fetching historical market sentiment.
    """

    def __init__(
        self,
        token_price_service: TokenPriceServiceProtocol,
        sentiment_service: SentimentDatabaseServiceProtocol,
        stock_price_service: StockPriceServiceProtocol | None = None,
        macro_fear_greed_service: MacroFearGreedDatabaseServiceProtocol | None = None,
    ):
        """Initialize data provider with required services.

        Args:
            token_price_service: Service for token price history.
            sentiment_service: Service for sentiment history.
            stock_price_service: Optional service for stock (SPY) price history.
                Required when a strategy declares ``SPY_AUX_SERIES``.
        """
        self.token_price_service = token_price_service
        self.sentiment_service = sentiment_service
        self.stock_price_service = stock_price_service
        self.macro_fear_greed_service = macro_fear_greed_service

    @staticmethod
    def _extract_snapshot_date(snapshot: Any) -> date | None:
        """Extract snapshot date from service object variants."""
        raw = getattr(snapshot, "snapshot_date", None) or getattr(
            snapshot, "date", None
        )
        if raw is None:
            return None
        return coerce_to_date(raw)

    @staticmethod
    def _extract_snapshot_price(snapshot: Any) -> Any | None:
        """Extract snapshot price from service object variants."""
        price_value = getattr(snapshot, "price", None)
        if price_value is None:
            price_value = getattr(snapshot, "price_usd", None)
        return price_value

    @staticmethod
    def _is_within_date_range(
        snapshot_date: date, start_date: date, end_date: date
    ) -> bool:
        """Return True when snapshot_date is within the inclusive range."""
        return start_date <= snapshot_date <= end_date

    @classmethod
    def _build_price_entry(
        cls,
        *,
        snapshot: Any,
        start_date: date,
        end_date: date,
        price_feature_history: dict[str, dict[date, Any]],
    ) -> dict[str, Any] | None:
        """Normalize one snapshot row into a standard price entry."""
        snapshot_date = cls._extract_snapshot_date(snapshot)
        if snapshot_date is None:
            return None
        if not cls._is_within_date_range(snapshot_date, start_date, end_date):
            return None

        price_value = cls._extract_snapshot_price(snapshot)
        if price_value is None:
            return None

        entry: dict[str, Any] = {
            "date": snapshot_date,
            "price": float(price_value),
        }
        extra_data = {
            feature_name: feature_values[snapshot_date]
            for feature_name, feature_values in price_feature_history.items()
            if snapshot_date in feature_values
        }
        if extra_data:
            entry["extra_data"] = extra_data
        prices = cls._build_price_map(
            primary_price=float(price_value),
            extra_data=extra_data,
        )
        if prices:
            entry["prices"] = prices
        return entry

    @staticmethod
    def _build_price_map(
        *,
        primary_price: float,
        extra_data: dict[str, Any],
    ) -> dict[str, float]:
        prices: dict[str, float] = {}
        eth_price_value = extra_data.get(ETH_USD_PRICE_FEATURE)
        if isinstance(eth_price_value, int | float) and float(eth_price_value) > 0:
            prices = {
                "btc": primary_price,
                "eth": float(eth_price_value),
            }
        else:
            ratio_value = extra_data.get(ETH_BTC_RATIO_FEATURE)
            if isinstance(ratio_value, int | float) and float(ratio_value) > 0:
                prices = {
                    "btc": primary_price,
                    "eth": primary_price * float(ratio_value),
                }
        spy_price_value = extra_data.get(SPY_PRICE_FEATURE)
        if isinstance(spy_price_value, int | float) and float(spy_price_value) > 0:
            prices["spy"] = float(spy_price_value)
        return prices

    @staticmethod
    def _build_sentiment_entry(sentiment: Any, sentiment_date: date) -> dict[str, Any]:
        """Normalize one sentiment row into the map payload shape."""
        return {
            "date": sentiment_date,
            "value": sentiment.value,
            "label": sentiment.status.lower().replace(" ", "_"),
            "timestamp": sentiment.timestamp,
        }

    @staticmethod
    def _should_replace_sentiment(
        existing: dict[str, Any] | None,
        candidate_timestamp: Any,
    ) -> bool:
        """Return True when candidate sentiment is newer than existing one."""
        if existing is None:
            return True
        return bool(candidate_timestamp > existing["timestamp"])

    def _resolve_price_features(
        self,
        *,
        market_data_requirements: MarketDataRequirements | None,
        required_price_features: Collection[str] | None,
        start_date: date,
        end_date: date,
        token_symbol: str,
    ) -> dict[str, dict[date, Any]]:
        feature_history = resolve_price_feature_history(
            token_price_service=self.token_price_service,
            stock_price_service=self.stock_price_service,
            market_data_requirements=market_data_requirements,
            required_price_features=required_price_features,
            start_date=start_date,
            end_date=end_date,
            token_symbol=token_symbol,
        )
        requires_macro_fear_greed = (
            market_data_requirements is not None
            and market_data_requirements.requires_macro_fear_greed
        )
        macro_history = self._resolve_macro_fear_greed_history(
            start_date=start_date,
            end_date=end_date,
            required=requires_macro_fear_greed,
        )
        if macro_history:
            feature_history[MACRO_FEAR_GREED_FEATURE] = forward_fill_daily(
                macro_history,
                start_date=start_date,
                end_date=end_date,
            )
        return feature_history

    def _resolve_macro_fear_greed_history(
        self,
        *,
        start_date: date,
        end_date: date,
        required: bool,
    ) -> dict[date, Any]:
        return resolve_macro_fear_greed_history(
            macro_fear_greed_service=self.macro_fear_greed_service,
            start_date=start_date,
            end_date=end_date,
            logger=logger,
            required=required,
            missing_service_message=(
                "macro_fear_greed_service is required when macro FGI is requested"
            ),
            failure_log_message="Failed to fetch optional macro Fear & Greed data: %s",
        )

    async def fetch_token_prices(
        self,
        token_symbol: str,
        start_date: date,
        end_date: date,
        market_data_requirements: MarketDataRequirements | None = None,
        required_price_features: Collection[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch token prices from database.

        Fetches historical price data and normalizes it into a standard format.
        Handles various attribute names from different snapshot formats.

        Args:
            token_symbol: Token symbol (e.g., "BTC", "ETH").
            start_date: Start of date range (inclusive).
            end_date: End of date range (inclusive).

        Returns:
            List of price dicts sorted by date, each containing:
            - date: The snapshot date
            - price: The token price in USD
        """
        feature_history = self._resolve_price_features(
            market_data_requirements=market_data_requirements,
            required_price_features=required_price_features,
            start_date=start_date,
            end_date=end_date,
            token_symbol=token_symbol,
        )
        try:
            # Calculate days between start and end (add buffer for safety)
            days_diff = (end_date - start_date).days + 7  # Add buffer
            # Get price history (returns TokenPriceSnapshot objects)
            price_snapshots = self.token_price_service.get_price_history(
                days=days_diff,
                token_symbol=token_symbol,
                start_date=start_date,
                end_date=end_date,
            )

            price_entries: list[dict[str, Any]] = []
            for snapshot in price_snapshots:
                entry = self._build_price_entry(
                    snapshot=snapshot,
                    start_date=start_date,
                    end_date=end_date,
                    price_feature_history=feature_history,
                )
                if entry is not None:
                    price_entries.append(entry)

            return sorted(price_entries, key=lambda row: row["date"])
        except Exception as error:
            if feature_history:
                logger.error(
                    "Failed to fetch strict feature-backed prices for %s: %s",
                    token_symbol,
                    error,
                )
                raise
            logger.error("Failed to fetch prices for %s: %s", token_symbol, error)
            return []

    async def fetch_sentiments(
        self, start_date: date, end_date: date
    ) -> dict[date, dict[str, Any]]:
        """Fetch sentiment data and map by date.

        Fetches historical sentiment data and deduplicates to keep only
        the most recent sentiment value for each day.

        Args:
            start_date: Start of date range (inclusive).
            end_date: End of date range (inclusive).

        Returns:
            Dict mapping dates to sentiment info, each containing:
            - date: The sentiment date
            - value: Numeric sentiment value (0-100)
            - label: Normalized label (e.g., "extreme_fear", "neutral")
            - timestamp: Original timestamp for deduplication
        """
        try:
            days_diff = (end_date - start_date).days + 1
            hours = days_diff * 24

            sentiments = await self.sentiment_service.get_sentiment_history(
                hours=hours,
                start_time=start_date,
                end_time=end_date,
            )

            # Map by date, taking most recent sentiment per day
            sentiment_map: dict[date, dict[str, Any]] = {}
            for sentiment in sentiments:
                sentiment_date = sentiment.timestamp.date()
                if not self._is_within_date_range(sentiment_date, start_date, end_date):
                    continue

                existing = sentiment_map.get(sentiment_date)
                if not self._should_replace_sentiment(existing, sentiment.timestamp):
                    continue
                sentiment_map[sentiment_date] = self._build_sentiment_entry(
                    sentiment, sentiment_date
                )

            return sentiment_map
        except Exception as error:
            logger.warning("Failed to fetch sentiment data: %s", error)
            return {}

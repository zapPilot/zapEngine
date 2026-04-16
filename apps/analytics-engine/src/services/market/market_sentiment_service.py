"""
Market Sentiment Service - External API integration for Fear & Greed Index

Provides cached proxy access to the alternative.me Fear & Greed Index API
with proper error handling and data transformation.

Refactored to use:
- Centralized CacheService
- Environment-based configuration
- Custom domain exceptions
- HTTP client factory pattern
- Dedicated error handlers with match statements
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
from fastapi import HTTPException

if TYPE_CHECKING:  # pragma: no cover
    from src.services.interfaces import SentimentDatabaseServiceProtocol

from src.core.cache_service import analytics_cache
from src.core.config import settings
from src.core.utils import parse_iso_datetime
from src.exceptions.market_sentiment import (
    BadGatewayError,
    GatewayTimeoutError,
    InternalError,
    MarketSentimentError,
    ServiceUnavailableError,
)
from src.models.market_sentiment import (
    ExternalSentimentResponse,
    MarketSentimentHealthResponse,
    MarketSentimentResponse,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MarketSentimentConfig:
    """
    Configuration for Market Sentiment Service.

    Encapsulates all external API and caching configuration
    with validation from settings.
    """

    api_url: str
    timeout_seconds: float
    cache_ttl: timedelta
    user_agent: str

    @classmethod
    def from_settings(cls) -> "MarketSentimentConfig":
        """
        Create configuration from application settings.

        Returns:
            MarketSentimentConfig: Validated configuration instance
        """
        return cls(
            api_url=settings.market_sentiment_api_url,
            timeout_seconds=settings.market_sentiment_timeout_seconds,
            cache_ttl=timedelta(seconds=settings.market_sentiment_cache_ttl_seconds),
            user_agent=settings.market_sentiment_user_agent,
        )


class MarketSentimentService:
    """
    Service for fetching and caching market sentiment data from external API.

    Uses:
    - MarketSentimentConfig dataclass for configuration
    - HTTP client factory pattern for reusable clients
    - Custom exceptions with dedicated error handlers
    - Python 3.11+ match statements for status code handling
    """

    def __init__(
        self,
        config: MarketSentimentConfig | None = None,
        db_service: "SentimentDatabaseServiceProtocol | None" = None,
        use_database: bool = True,
    ) -> None:
        """
        Initialize the service with configuration.

        Args:
            config: Optional configuration. Defaults to loading from settings.
            db_service: Optional database service for sentiment queries.
            use_database: Whether to use database-first approach (default: True).
        """
        self._config = config or MarketSentimentConfig.from_settings()
        self._db_service = db_service
        self._use_database = use_database

    @asynccontextmanager
    async def _http_client(self) -> AsyncIterator[httpx.AsyncClient]:
        """
        Create configured HTTP client for external API requests.

        Yields:
            httpx.AsyncClient: Configured async HTTP client

        Usage:
            async with self._http_client() as client:
                response = await client.get(url)
        """
        headers = {"User-Agent": self._config.user_agent}
        async with httpx.AsyncClient(
            timeout=self._config.timeout_seconds, headers=headers
        ) as client:
            yield client

    async def _fetch_from_external_api(self) -> ExternalSentimentResponse:
        """
        Fetch sentiment data from external API with timeout and error handling.

        Returns:
            ExternalSentimentResponse: Validated response from external API

        Raises:
            HTTPException: 502/503/504/500 based on failure mode
        """
        try:
            async with self._http_client() as client:
                response = await client.get(self._config.api_url)

                if response.status_code != 200:
                    status_code = response.status_code
                    response_text = response.text
                    match status_code:
                        case code if code >= 500:
                            logger.error(
                                "External API returned %d: %s",
                                status_code,
                                response_text,
                            )
                            error: MarketSentimentError = ServiceUnavailableError(
                                status_code=status_code,
                                response_text=response_text,
                            )
                        case code if 400 <= code < 500:
                            logger.warning(
                                "External API client error %d: %s",
                                status_code,
                                response_text,
                            )
                            error = BadGatewayError(
                                reason=f"External API client error: {status_code}"
                            )
                        case _:
                            logger.error(
                                "Unexpected status code %d: %s",
                                status_code,
                                response_text,
                            )
                            error = InternalError(
                                reason=f"Unexpected HTTP status: {status_code}"
                            )
                    raise HTTPException(
                        status_code=error.status_code, detail=error.to_detail_dict()
                    ) from error

                try:
                    return ExternalSentimentResponse.model_validate(response.json())
                except Exception as validation_error:
                    logger.error(
                        "Invalid response format from external API: %s",
                        validation_error,
                    )
                    error = BadGatewayError(
                        reason=f"Invalid response format: {str(validation_error)[:200]}"
                    )
                    raise HTTPException(
                        status_code=error.status_code, detail=error.to_detail_dict()
                    ) from error

        except httpx.TimeoutException as timeout_error:
            logger.error("Timeout calling external API: %s", timeout_error)
            error = GatewayTimeoutError(timeout_seconds=self._config.timeout_seconds)
            raise HTTPException(
                status_code=error.status_code, detail=error.to_detail_dict()
            ) from error

        except HTTPException:
            raise

        except Exception as unexpected_error:
            logger.exception(
                "Unexpected error calling external API: %s", unexpected_error
            )
            error = InternalError(
                reason=f"Unexpected error: {str(unexpected_error)[:200]}"
            )
            raise HTTPException(
                status_code=error.status_code, detail=error.to_detail_dict()
            ) from error

    def _transform_response(
        self, external_data: ExternalSentimentResponse, cached: bool = False
    ) -> MarketSentimentResponse:
        """
        Transform external API response to internal format.

        Args:
            external_data: Validated external API response
            cached: Whether the data came from cache

        Returns:
            MarketSentimentResponse: Transformed response

        Raises:
            HTTPException: 502 if data transformation fails
        """
        try:
            # Extract first data point (API always returns single item with limit=1)
            if not external_data.data:
                raise ValueError("External API returned empty data array")

            data_point = external_data.data[0]

            # Convert Unix timestamp to ISO 8601 datetime
            timestamp = datetime.fromtimestamp(int(data_point.timestamp), tz=UTC)

            return MarketSentimentResponse(
                value=int(data_point.value),
                status=data_point.value_classification,
                timestamp=timestamp,
                source="alternative.me",
                cached=cached,
            )

        except Exception as transformation_error:
            logger.error(
                "Invalid response format from external API: %s",
                transformation_error,
            )
            error = BadGatewayError(
                reason=f"Invalid response format: {str(transformation_error)[:200]}"
            )
            raise HTTPException(
                status_code=error.status_code, detail=error.to_detail_dict()
            ) from error

    async def get_market_sentiment(self) -> MarketSentimentResponse:
        """
        Get current market sentiment with caching and database-first approach.

        Priority order:
        1. In-memory cache (fastest)
        2. Database query (if enabled and available)
        3. External API fallback

        Returns:
            MarketSentimentResponse: Current market sentiment data

        Raises:
            HTTPException: Various HTTP errors based on failure mode
        """
        cache_key = analytics_cache.build_key("MarketSentiment", "current")

        # 1. Try to get from cache
        cached_data = analytics_cache.get(cache_key)
        if cached_data is not None:
            logger.info("Returning cached market sentiment data")
            # Cached data is already a dict, reconstruct with cached=True
            return MarketSentimentResponse.model_validate(
                {**cached_data, "cached": True}
            )

        # 2. Try database (if enabled and service available)
        if self._use_database and self._db_service:
            try:
                logger.info("Fetching sentiment from database")
                db_response = await self._db_service.get_current_sentiment()

                # Cache the database result
                cache_data = db_response.model_dump(exclude={"cached"})
                analytics_cache.set(cache_key, cache_data, self._config.cache_ttl)

                logger.info(
                    "Database sentiment cached: value=%s, status=%s",
                    db_response.value,
                    db_response.status,
                )
                return db_response
            except Exception as db_error:
                logger.warning(
                    "Database query failed, falling back to external API: %s",
                    db_error,
                )

        # 3. Fall back to external API
        logger.info("Fetching fresh market sentiment data from external API")
        external_data = await self._fetch_from_external_api()

        # Transform and cache response
        response = self._transform_response(external_data, cached=False)

        # Update cache with TTL from config
        cache_data = response.model_dump(exclude={"cached"})
        analytics_cache.set(cache_key, cache_data, self._config.cache_ttl)

        logger.info(
            "Market sentiment data cached successfully: value=%s, status=%s",
            response.value,
            response.status,
        )

        return response

    def get_health_status(self) -> MarketSentimentHealthResponse:
        """
        Get health status of the sentiment service including cache information.

        Returns:
            MarketSentimentHealthResponse: Service health status
        """
        cache_key = analytics_cache.build_key("MarketSentiment", "current")
        cache_ttl_seconds = int(self._config.cache_ttl.total_seconds())

        # Try to get cached data to check if it exists
        cached_data = analytics_cache.get(cache_key)

        if cached_data is None:
            return MarketSentimentHealthResponse(
                cached=False,
                cache_age_seconds=None,
                cache_ttl_seconds=cache_ttl_seconds,
                last_update=None,
            )

        # Cache exists - calculate age from timestamp in cached data
        timestamp = cached_data.get("timestamp")
        if timestamp:
            # timestamp is ISO string, parse it
            if isinstance(timestamp, str):
                last_update = parse_iso_datetime(timestamp)
            else:
                last_update = timestamp

            age_seconds = int((datetime.now(UTC) - last_update).total_seconds())

            return MarketSentimentHealthResponse(
                cached=True,
                cache_age_seconds=age_seconds,
                cache_ttl_seconds=cache_ttl_seconds,
                last_update=last_update,
            )

        return MarketSentimentHealthResponse(
            cached=True,
            cache_age_seconds=None,
            cache_ttl_seconds=cache_ttl_seconds,
            last_update=None,
        )

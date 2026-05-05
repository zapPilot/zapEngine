"""
Market Data API endpoints - External market data proxy

Provides proxy endpoints for external market data sources with caching
and error handling.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from src.models.market_dashboard import MarketDashboardResponse
from src.models.market_sentiment import (
    MarketSentimentHealthResponse,
    MarketSentimentResponse,
)
from src.models.regime_tracking import RegimeHistoryResponse
from src.models.token_price import TokenPriceHistoryResponse
from src.services.dependencies import (
    MarketDashboardServiceDep,
    MarketSentimentServiceDep,
    SentimentDatabaseServiceDep,
    TokenPriceServiceDep,
    get_regime_tracking_service,
)
from src.services.market.regime_tracking_service import RegimeTrackingService

router = APIRouter(prefix="/market")


def _apply_market_cache_headers(
    response: Response,
    max_age: int = 3600,
    stale_revalidate: int = 7200,
) -> None:
    """Apply standard cache headers for market data endpoints."""
    response.headers["Cache-Control"] = (
        f"public, max-age={max_age}, stale-while-revalidate={stale_revalidate}"
    )
    response.headers["Vary"] = "Accept-Encoding"
    response.headers["Access-Control-Allow-Origin"] = "*"


def _normalize_token_symbol(token: str) -> str:
    """Normalize token query value to canonical symbol representation."""
    return token.upper()


def _raise_token_history_not_found(token_symbol: str) -> None:
    """Raise standardized not-found error for token history endpoint."""
    raise HTTPException(
        status_code=404,
        detail=f"No {token_symbol} price data found. Run ETL backfill first.",
    )


@router.get(
    "/sentiment",
    response_model=MarketSentimentResponse,
    responses={
        200: {
            "description": "Current market sentiment data",
            "content": {
                "application/json": {
                    "example": {
                        "value": 45,
                        "status": "Fear",
                        "timestamp": "2025-11-20T12:00:00.000Z",
                        "source": "alternative.me",
                        "cached": False,
                    }
                }
            },
        },
        502: {
            "description": "Invalid response from sentiment provider",
            "content": {
                "application/json": {
                    "example": {
                        "error": "BAD_GATEWAY",
                        "message": "Invalid response from sentiment provider",
                    }
                }
            },
        },
        503: {
            "description": "Market sentiment data temporarily unavailable",
            "content": {
                "application/json": {
                    "example": {
                        "error": "SERVICE_UNAVAILABLE",
                        "message": "Market sentiment data temporarily unavailable",
                        "details": {"retryAfter": 60},
                    }
                }
            },
        },
        504: {
            "description": "Request to sentiment provider timed out",
            "content": {
                "application/json": {
                    "example": {
                        "error": "GATEWAY_TIMEOUT",
                        "message": "Request to sentiment provider timed out",
                        "details": {"retryAfter": 60},
                    }
                }
            },
        },
        500: {
            "description": "An unexpected error occurred",
            "content": {
                "application/json": {
                    "example": {
                        "error": "INTERNAL_ERROR",
                        "message": "An unexpected error occurred",
                    }
                }
            },
        },
    },
)
async def get_market_sentiment(
    response: Response,
    sentiment_service: MarketSentimentServiceDep,
) -> MarketSentimentResponse:
    """
    Get current market sentiment (Fear & Greed Index).

    Proxies the alternative.me Fear & Greed Index API with:
    - 10-minute backend caching
    - 10-minute HTTP cache with 50-minute stale-while-revalidate
    - Proper error handling and transformation

    No authentication required (public data).

    Returns:
        MarketSentimentResponse: Current market sentiment with value (0-100),
                                status classification, and timestamp
    """
    sentiment_data = await sentiment_service.get_market_sentiment()
    _apply_market_cache_headers(response, max_age=600, stale_revalidate=3000)
    return sentiment_data


@router.get(
    "/sentiment/health",
    response_model=MarketSentimentHealthResponse,
    responses={
        200: {
            "description": "Service health status with cache information",
            "content": {
                "application/json": {
                    "example": {
                        "cached": True,
                        "cache_age_seconds": 120,
                        "cache_ttl_seconds": 600,
                        "last_update": "2025-11-20T12:00:00.000Z",
                    }
                }
            },
        },
    },
)
def get_market_sentiment_health(
    sentiment_service: MarketSentimentServiceDep,
) -> MarketSentimentHealthResponse:
    """
    Get health status of the market sentiment service.

    Returns cache status, age, and last update time for monitoring purposes.

    Returns:
        MarketSentimentHealthResponse: Service health and cache status
    """
    return sentiment_service.get_health_status()


@router.get(
    "/sentiment/history",
    response_model=list[MarketSentimentResponse],
    responses={
        200: {
            "description": "Historical sentiment data from database",
            "content": {
                "application/json": {
                    "example": [
                        {
                            "value": 45,
                            "status": "Fear",
                            "timestamp": "2025-11-20T12:00:00.000Z",
                            "source": "alternative.me",
                            "cached": True,
                        },
                        {
                            "value": 48,
                            "status": "Neutral",
                            "timestamp": "2025-11-20T11:50:00.000Z",
                            "source": "alternative.me",
                            "cached": True,
                        },
                    ]
                }
            },
        },
    },
)
async def get_sentiment_history(
    response: Response,
    db_service: SentimentDatabaseServiceDep,
    hours: int = Query(
        default=24,
        ge=1,
        le=168,
        description="Hours of history to retrieve (max 7 days)",
    ),
) -> list[MarketSentimentResponse]:
    """
    Get historical sentiment data from database.

    Returns sentiment snapshots collected by alpha-etl over the specified time range.
    Data is collected every 10 minutes, providing granular sentiment history.

    Args:
        hours: Number of hours of history to retrieve (1-168, default: 24)

    Returns:
        list[MarketSentimentResponse]: List of historical sentiment snapshots
                                       in descending order (most recent first)
    """
    history = await db_service.get_sentiment_history(hours=hours)
    _apply_market_cache_headers(response, max_age=3600, stale_revalidate=7200)
    return history


@router.get(
    "/regime/history",
    response_model=RegimeHistoryResponse,
    responses={
        200: {
            "description": "Market regime transition history with direction calculation",
            "content": {
                "application/json": {
                    "example": {
                        "current": {
                            "id": "550e8400-e29b-41d4-a716-446655440000",
                            "from_regime": "f",
                            "to_regime": "n",
                            "sentiment_value": 48,
                            "transitioned_at": "2025-12-12T10:30:00Z",
                            "duration_hours": None,
                        },
                        "previous": {
                            "id": "450e8400-e29b-41d4-a716-446655440000",
                            "from_regime": "ef",
                            "to_regime": "f",
                            "sentiment_value": 30,
                            "transitioned_at": "2025-12-10T08:00:00Z",
                            "duration_hours": 50.5,
                        },
                        "direction": "fromLeft",
                        "duration_in_current": {
                            "hours": 51.5,
                            "days": 2.1,
                            "human_readable": "2 days, 3 hours",
                        },
                        "transitions": [],
                        "timestamp": "2025-12-12T11:00:00Z",
                        "cached": False,
                    }
                }
            },
        },
        404: {
            "description": "No regime transitions found",
            "content": {
                "application/json": {
                    "example": {
                        "error_code": "DATA_NOT_FOUND",
                        "message": "Resource not found",
                        "detail": "No regime transitions found. Run backfill script to initialize.",
                    }
                }
            },
        },
        500: {
            "description": "Database error occurred",
            "content": {
                "application/json": {
                    "example": {
                        "error_code": "DATABASE_ERROR",
                        "message": "A database error occurred",
                        "detail": "Failed to fetch regime history",
                    }
                }
            },
        },
    },
)
async def get_regime_history(
    response: Response,
    regime_service: RegimeTrackingService = Depends(get_regime_tracking_service),
    limit: int = Query(
        default=2,
        ge=1,
        le=100,
        description="Maximum number of transitions to return (default: 2)",
    ),
) -> RegimeHistoryResponse:
    """
    Get market regime transition history with directional strategy calculation.

    Returns the current regime, previous regime, and computed direction for
    contextual portfolio strategy display. Direction indicates whether the
    market is recovering (fromLeft) or declining (fromRight).

    **Direction Logic:**
    - `fromLeft`: Moving toward greed (ef → f → n → g → eg)
      - Example: ef → f is recovery, "Hold positions, zero rebalancing"
    - `fromRight`: Moving toward fear (eg → g → n → f → ef)
      - Example: n → f is decline, "Unwind LP positions, shift to spot"
    - `default`: No previous regime (first transition)

    **Regime IDs:**
    - `ef`: Extreme Fear (sentiment 0-25)
    - `f`: Fear (sentiment 26-45)
    - `n`: Neutral (sentiment 46-54)
    - `g`: Greed (sentiment 55-75)
    - `eg`: Extreme Greed (sentiment 76-100)

    Args:
        limit: Maximum number of transitions to return (1-100, default: 2)

    Returns:
        RegimeHistoryResponse: Current regime, previous regime, direction,
                              duration metadata, and transitions list

    Raises:
        404: No regime transitions found (run backfill script)
        500: Database error occurred
    """
    history = regime_service.get_regime_history(limit=limit)
    _apply_market_cache_headers(response, max_age=60, stale_revalidate=300)
    return history


@router.get(
    "/btc/history",
    response_model=TokenPriceHistoryResponse,
    responses={
        200: {
            "description": "Token historical price data (BTC, ETH, SOL, etc.)",
            "content": {
                "application/json": {
                    "example": {
                        "snapshots": [
                            {
                                "date": "2024-12-15",
                                "price_usd": 42000.00,
                                "market_cap_usd": 820000000000.0,
                                "volume_24h_usd": 25000000000.0,
                                "source": "coingecko",
                                "token_symbol": "BTC",
                                "token_id": "bitcoin",
                            },
                            {
                                "date": "2024-12-16",
                                "price_usd": 42500.00,
                                "market_cap_usd": 830000000000.0,
                                "volume_24h_usd": 27000000000.0,
                                "source": "coingecko",
                                "token_symbol": "BTC",
                                "token_id": "bitcoin",
                            },
                        ],
                        "count": 90,
                        "days_requested": 90,
                        "oldest_date": "2024-10-17",
                        "latest_date": "2025-01-15",
                        "cached": False,
                    }
                }
            },
        },
        404: {
            "description": "No token price data found",
            "content": {
                "application/json": {
                    "example": {
                        "error_code": "DATA_NOT_FOUND",
                        "message": "Resource not found",
                        "detail": "No BTC price data found. Run ETL backfill first.",
                    }
                }
            },
        },
        500: {
            "description": "Database error occurred",
            "content": {
                "application/json": {
                    "example": {
                        "error_code": "DATABASE_ERROR",
                        "message": "A database error occurred",
                        "detail": "Failed to fetch token price history",
                    }
                }
            },
        },
    },
)
async def get_token_price_history(
    response: Response,
    token_price_service: TokenPriceServiceDep,
    days: int = Query(
        default=90,
        ge=1,
        le=2000,
        description="Days of history (1-2000, default: 90)",
    ),
    token: str = Query(
        default="btc",
        description="Token symbol (btc, eth, sol, etc.) - case insensitive",
    ),
) -> TokenPriceHistoryResponse:
    """
    Get token historical price data for portfolio benchmarking.

    Returns daily token price snapshots collected by alpha-etl from CoinGecko.
    Data is stored at midnight UTC daily via Pipedream scheduled workflows.
    Supports multiple tokens (BTC, ETH, SOL, etc.) with backward compatibility.

    This endpoint provides real token price data to replace mock benchmarks
    in the portfolio performance chart tooltip.

    Args:
        days: Number of days of history (1-365, default: 90)
        token: Token symbol to fetch (default: 'btc')
               Examples: 'btc', 'eth', 'sol' (case insensitive)

    Returns:
        TokenPriceHistoryResponse: Historical token prices sorted chronologically
                                (oldest first) with metadata

    Raises:
        404: No token price data found (run ETL backfill first)
        500: Database error occurred

    Cache-Control: 1 hour cache, 6 hour stale-while-revalidate
    """
    token_symbol = _normalize_token_symbol(token)
    snapshots = token_price_service.get_price_history(
        days=days, token_symbol=token_symbol
    )

    if not snapshots:
        _raise_token_history_not_found(token_symbol)

    payload = TokenPriceHistoryResponse(
        snapshots=snapshots,
        count=len(snapshots),
        days_requested=days,
        oldest_date=snapshots[0].date,
        latest_date=snapshots[-1].date,
        cached=False,
    )
    _apply_market_cache_headers(response, max_age=3600, stale_revalidate=21600)
    return payload


@router.get(
    "/dashboard",
    response_model=MarketDashboardResponse,
    responses={
        200: {
            "description": "Self-describing market dashboard payload (series registry + dated snapshots)",
        },
    },
)
async def get_market_dashboard(
    response: Response,
    dashboard_service: MarketDashboardServiceDep,
    days: int = Query(
        default=365,
        ge=1,
        le=2000,
        description="Days of history (1-2000, default: 365)",
    ),
) -> MarketDashboardResponse:
    """
    Get aggregated market data for dashboard visualization.

    Returns a `series` registry declaring each series (BTC, ETH, SPY, ETH/BTC,
    FGI) plus a chronological list of `snapshots`, where each snapshot's
    `values` map carries a uniform SeriesPoint per series id.
    """
    payload = dashboard_service.get_market_dashboard(days=days)

    _apply_market_cache_headers(response, max_age=3600, stale_revalidate=21600)
    return payload

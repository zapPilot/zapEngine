"""
Custom exceptions for Analytics Engine services.
"""

from src.exceptions.market_sentiment import (
    BadGatewayError,
    ExternalAPIError,
    GatewayTimeoutError,
    InternalError,
    MarketSentimentError,
    ServiceUnavailableError,
)

__all__ = [
    "MarketSentimentError",
    "ExternalAPIError",
    "ServiceUnavailableError",
    "GatewayTimeoutError",
    "BadGatewayError",
    "InternalError",
]

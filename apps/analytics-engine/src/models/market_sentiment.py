"""
Pydantic models for market sentiment data validation and serialization.

This module contains data validation models for the Fear & Greed Index
from alternative.me API.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MarketSentimentResponse(BaseModel):
    """Market sentiment response model."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "value": 45,
                "status": "Fear",
                "timestamp": "2025-11-20T12:00:00.000Z",
                "source": "alternative.me",
                "cached": False,
            }
        }
    )

    value: int = Field(
        ge=0,
        le=100,
        description="Fear & Greed Index value (0-100)",
    )
    status: str = Field(
        description="Sentiment classification (e.g., Fear, Greed, Extreme Fear)",
    )
    timestamp: datetime = Field(
        description="ISO 8601 timestamp of the sentiment data",
    )
    source: str = Field(
        default="alternative.me",
        description="Data source identifier",
    )
    cached: bool = Field(
        default=False,
        description="Whether the data was served from cache",
    )


class MarketSentimentHealthResponse(BaseModel):
    """Health check response for market sentiment service."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "cached": True,
                "cache_age_seconds": 120,
                "cache_ttl_seconds": 600,
                "last_update": "2025-11-20T12:00:00.000Z",
            }
        }
    )

    cached: bool = Field(
        description="Whether cached data is available",
    )
    cache_age_seconds: int | None = Field(
        default=None,
        description="Age of cached data in seconds (null if no cache)",
    )
    cache_ttl_seconds: int = Field(
        default=600,
        description="Cache TTL in seconds",
    )
    last_update: datetime | None = Field(
        default=None,
        description="Timestamp of last successful update (null if no cache)",
    )


class ExternalSentimentData(BaseModel):
    """External API data model for alternative.me response."""

    value: str = Field(description="Fear & Greed Index value as string")
    value_classification: str = Field(description="Sentiment classification")
    timestamp: str = Field(description="Unix timestamp as string")
    time_until_update: str = Field(description="Seconds until next update")


class ExternalSentimentResponse(BaseModel):
    """External API response wrapper."""

    data: list[ExternalSentimentData] = Field(
        description="List of sentiment data points (typically one)"
    )

"""
Market Dashboard Models

Defines data models for the combined market dashboard view, joining
BTC price, 200 DMA, and Fear & Greed Index sentiment.
"""

import datetime

from pydantic import BaseModel, ConfigDict, Field

from src.models.regime_tracking import RegimeId


class EthBtcRelativeStrengthPoint(BaseModel):
    """ETH/BTC relative-strength metrics for a single date."""

    ratio: float = Field(..., description="ETH/BTC ratio for the snapshot date", gt=0)
    dma_200: float | None = Field(
        None, description="200-day DMA of the ETH/BTC ratio", gt=0
    )
    is_above_dma: bool | None = Field(
        None,
        description="Whether the ETH/BTC ratio is above its 200-day DMA",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "ratio": 0.0532,
                "dma_200": 0.0498,
                "is_above_dma": True,
            }
        }
    )


class Sp500Point(BaseModel):
    """S&P500 (SPY ETF) metrics for a single date."""

    price_usd: float = Field(..., description="SPY price in USD", gt=0)
    dma_200: float | None = Field(None, description="200-day DMA of SPY price", gt=0)
    is_above_dma: bool | None = Field(
        None,
        description="Whether SPY price is above its 200-day DMA",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "price_usd": 485.0,
                "dma_200": 475.0,
                "is_above_dma": True,
            }
        }
    )


class MarketDashboardPoint(BaseModel):
    """
    Single daily data point for the market dashboard.
    """

    snapshot_date: datetime.date = Field(..., description="Date of the snapshot")
    price_usd: float = Field(..., description="Token price in USD at midnight UTC")
    dma_200: float | None = Field(
        None, description="200-day Daily Moving Average in USD"
    )
    sentiment_value: int | None = Field(
        None, ge=0, le=100, description="Fear & Greed Index value (0-100)"
    )
    regime: RegimeId | None = Field(
        None, description="Market regime classification based on sentiment"
    )
    eth_btc_relative_strength: EthBtcRelativeStrengthPoint | None = Field(
        None,
        description="Optional ETH/BTC relative-strength metrics aligned to the same date",
    )
    sp500: Sp500Point | None = Field(
        None,
        description="Optional S&P500 (SPY) metrics aligned to the same date",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "snapshot_date": "2024-12-15",
                "price_usd": 42500.0,
                "dma_200": 41000.0,
                "sentiment_value": 45,
                "regime": "f",
                "eth_btc_relative_strength": {
                    "ratio": 0.0532,
                    "dma_200": 0.0498,
                    "is_above_dma": True,
                },
            }
        }
    )


class MarketDashboardResponse(BaseModel):
    """
    API response for market dashboard data.
    """

    snapshots: list[MarketDashboardPoint] = Field(
        ..., description="Chronological list of market data points"
    )
    count: int = Field(..., description="Number of snapshots returned")
    token_symbol: str = Field(..., description="Token symbol (e.g., BTC)")
    days_requested: int = Field(..., description="Number of days requested")
    timestamp: datetime.datetime = Field(
        ..., description="Server timestamp when response was generated"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "snapshots": [
                    {
                        "snapshot_date": "2024-12-15",
                        "price_usd": 42500.0,
                        "dma_200": 41000.0,
                        "sentiment_value": 45,
                        "regime": "f",
                        "eth_btc_relative_strength": {
                            "ratio": 0.0532,
                            "dma_200": 0.0498,
                            "is_above_dma": True,
                        },
                    }
                ],
                "count": 1,
                "token_symbol": "BTC",
                "days_requested": 365,
                "timestamp": "2025-01-20T12:00:00Z",
            }
        }
    )

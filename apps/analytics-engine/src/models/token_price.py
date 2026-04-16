"""Token Price Data Models

Pydantic models for token historical price data endpoints.
"""

from pydantic import BaseModel, Field


class TokenPriceSnapshot(BaseModel):
    """Single token price snapshot (supports BTC, ETH, SOL, etc.)"""

    date: str = Field(..., description="Snapshot date (YYYY-MM-DD)")
    price_usd: float = Field(..., description="Token price in USD", gt=0)
    market_cap_usd: float | None = Field(None, description="Market cap in USD", ge=0)
    volume_24h_usd: float | None = Field(
        None, description="24h trading volume in USD", ge=0
    )
    source: str = Field(default="coingecko", description="Data source")
    token_symbol: str = Field(
        default="BTC", description="Token symbol (e.g., BTC, ETH, SOL)"
    )
    token_id: str = Field(
        default="bitcoin",
        description="CoinGecko token ID (e.g., bitcoin, ethereum, solana)",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "date": "2025-01-15",
                "price_usd": 43250.50,
                "market_cap_usd": 847000000000.0,
                "volume_24h_usd": 28500000000.0,
                "source": "coingecko",
                "token_symbol": "BTC",
                "token_id": "bitcoin",
            }
        }
    }


class TokenPriceHistoryResponse(BaseModel):
    """Token price history response"""

    snapshots: list[TokenPriceSnapshot] = Field(
        ..., description="Historical price snapshots sorted by date (oldest first)"
    )
    count: int = Field(..., description="Number of snapshots returned", ge=0)
    days_requested: int = Field(..., description="Number of days requested", ge=1)
    oldest_date: str | None = Field(None, description="Oldest snapshot date")
    latest_date: str | None = Field(None, description="Latest snapshot date")
    cached: bool = Field(default=False, description="Whether response was cached")

    model_config = {
        "json_schema_extra": {
            "example": {
                "snapshots": [
                    {
                        "date": "2024-12-15",
                        "price_usd": 42000.00,
                        "market_cap_usd": 820000000000.0,
                        "volume_24h_usd": 25000000000.0,
                        "source": "coingecko",
                    },
                    {
                        "date": "2024-12-16",
                        "price_usd": 42500.00,
                        "market_cap_usd": 830000000000.0,
                        "volume_24h_usd": 27000000000.0,
                        "source": "coingecko",
                    },
                ],
                "count": 90,
                "days_requested": 90,
                "oldest_date": "2024-10-17",
                "latest_date": "2025-01-15",
                "cached": False,
            }
        }
    }

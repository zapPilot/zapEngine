"""
Pydantic models for borrowing position data validation and serialization.

This module contains models for per-position debt tracking and liquidation risk analysis.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from src.models.types import Float4dpRounded, USDRounded


class TokenDetail(BaseModel):
    """Token detail with calculated USD value."""

    symbol: str = Field(description="Token symbol (e.g., 'ETH', 'USDC')")
    amount: float = Field(description="Token quantity")
    value_usd: USDRounded = Field(
        description="USD value (amount × price, rounded to 2 decimals)"
    )


class BorrowingPosition(BaseModel):
    """Individual borrowing position risk metrics."""

    protocol_id: str = Field(description="Protocol identifier (e.g., 'aave_v3')")
    protocol_name: str = Field(
        description="Human-readable protocol name (e.g., 'Aave V3')"
    )
    chain: str = Field(description="Blockchain name (e.g., 'ethereum', 'arbitrum')")

    health_rate: Float4dpRounded = Field(
        gt=0.0,
        description=(
            "Position health rate (protocol-reported when available; "
            "fallback: (collateral + debt) * 0.75 / debt)"
        ),
    )
    health_status: Literal["HEALTHY", "WARNING", "CRITICAL"] = Field(
        description="Risk classification (HEALTHY ≥2.0, WARNING 1.5-2.0, CRITICAL <1.5)"
    )

    collateral_usd: USDRounded = Field(
        ge=0.0,
        description="Total collateral value in USD for this position",
    )
    debt_usd: USDRounded = Field(
        gt=0.0,
        description="Total debt value in USD for this position",
    )
    net_value_usd: USDRounded = Field(
        description="Net value (collateral - debt) for this position"
    )

    collateral_tokens: list[TokenDetail] = Field(
        default_factory=list,
        description="List of collateral tokens with symbol, amount, value_usd",
    )
    debt_tokens: list[TokenDetail] = Field(
        default_factory=list,
        description="List of debt tokens with symbol, amount, value_usd",
    )

    updated_at: datetime = Field(description="Timestamp of last snapshot update")


class BorrowingPositionsResponse(BaseModel):
    """Response model for borrowing positions endpoint."""

    positions: list[BorrowingPosition] = Field(
        description="List of borrowing positions sorted by health rate (riskiest first)"
    )

    total_collateral_usd: USDRounded = Field(
        ge=0.0,
        description="Total collateral across all positions",
    )
    total_debt_usd: USDRounded = Field(
        gt=0.0,
        description="Total debt across all positions",
    )
    worst_health_rate: Float4dpRounded = Field(
        gt=0.0,
        description="Lowest health rate across all positions (primary risk metric)",
    )

    last_updated: datetime = Field(
        description="Timestamp of most recent position update"
    )

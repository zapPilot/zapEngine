"""Typed models for canonical portfolio snapshot responses."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.core.constants import CATEGORIES


class CategoryTotals(BaseModel):
    """Normalized totals for the four canonical asset categories."""

    btc: float = 0.0
    eth: float = 0.0
    stablecoins: float = 0.0
    others: float = 0.0

    model_config = ConfigDict(extra="ignore")

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any] | None) -> CategoryTotals:
        """Construct totals from an arbitrary mapping, defaulting missing keys."""

        data = data or {}
        return cls(
            btc=float(data.get("btc", 0.0) or 0.0),
            eth=float(data.get("eth", 0.0) or 0.0),
            stablecoins=float(data.get("stablecoins", 0.0) or 0.0),
            others=float(data.get("others", 0.0) or 0.0),
        )

    def as_dict(self) -> dict[str, float]:
        """Return a plain dictionary representation with primitive floats."""

        return {
            "btc": float(self.btc),
            "eth": float(self.eth),
            "stablecoins": float(self.stablecoins),
            "others": float(self.others),
        }

    def total(self) -> float:
        """Return the summed total across all categories."""

        return float(self.btc + self.eth + self.stablecoins + self.others)


class WalletTrendOverride(BaseModel):
    """Wallet category override derived from trend rows for display alignment."""

    categories: dict[str, float] = Field(default_factory=dict)
    total_value: float = 0.0

    def ensure_categories(self) -> dict[str, float]:
        """Return categories with guaranteed keys for downstream calculations."""

        return {
            category: float(self.categories.get(category, 0.0))
            for category in CATEGORIES
        }


class PortfolioSnapshot(BaseModel):
    """Canonical single-day portfolio snapshot used across V2 endpoints."""

    user_id: str
    snapshot_date: date
    wallet_addresses: list[str] = Field(default_factory=list)
    wallet_count: int = 0
    last_updated: datetime | None = None
    total_assets: float = 0.0
    total_debt: float = 0.0
    net_portfolio_value: float = 0.0
    category_summary_assets: CategoryTotals = Field(default_factory=CategoryTotals)
    category_summary_debt: CategoryTotals = Field(default_factory=CategoryTotals)
    wallet_assets: CategoryTotals = Field(default_factory=CategoryTotals)
    wallet_token_count: int = 0
    wallet_override: WalletTrendOverride | None = None

    model_config = ConfigDict(extra="ignore")

    @property
    def has_data(self) -> bool:
        """Whether the snapshot contains any portfolio assets."""

        return bool(self.total_assets or self.total_debt)

    def to_portfolio_summary(self) -> dict[str, Any]:
        """Return dict payload compatible with legacy landing page builder."""

        return {
            "user_id": self.user_id,
            "snapshot_date": self.snapshot_date,
            "wallet_count": self.wallet_count,
            "last_updated": self.last_updated,
            "category_summary_assets": self.category_summary_assets.as_dict(),
            "category_summary_debt": self.category_summary_debt.as_dict(),
            "total_assets": self.total_assets,
            "total_debt": self.total_debt,
            "net_portfolio_value": self.net_portfolio_value,
            "wallet_token_count": self.wallet_token_count,
            "wallet_assets": self.wallet_assets.as_dict(),
        }

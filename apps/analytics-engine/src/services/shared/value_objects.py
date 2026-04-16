"""Value objects shared across service implementations."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class WalletCategoryBreakdown(Mapping[str, float]):
    """Aggregated totals for a single wallet category."""

    value: float = 0.0
    percentage: float = 0.0

    def __getitem__(self, key: str) -> float:
        if key == "value":
            return self.value
        if key == "percentage":
            return self.percentage
        raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        yield from ("value", "percentage")

    def __len__(self) -> int:
        return 2


@dataclass(slots=True)
class WalletAggregate(Mapping[str, Any]):
    """Aggregated wallet metrics consumed by landing-page orchestration."""

    total_value: float = 0.0
    token_count: int = 0
    categories: dict[str, WalletCategoryBreakdown] = field(default_factory=dict)
    apr: dict[str, Any] = field(default_factory=dict)

    def __getitem__(self, key: str) -> Any:
        if key == "total_value":
            return self.total_value
        if key == "token_count":
            return self.token_count
        if key == "categories":
            return self.categories
        if key == "apr":
            return self.apr
        raise KeyError(key)

    def __iter__(self) -> Iterator[str]:
        yield from ("total_value", "token_count", "categories", "apr")

    def __len__(self) -> int:
        return 4


def create_empty_category_breakdown() -> dict[str, WalletCategoryBreakdown]:
    """
    Create initialized category breakdown dictionary.

    Returns:
        Dictionary mapping each category to an empty WalletCategoryBreakdown
        with value=0.0 and percentage=0.0.

    Categories:
        - btc: Bitcoin holdings
        - eth: Ethereum holdings
        - stablecoins: Stablecoin holdings
        - others: All other token holdings
    """
    from src.core.constants import CATEGORIES

    return {category: WalletCategoryBreakdown() for category in CATEGORIES}

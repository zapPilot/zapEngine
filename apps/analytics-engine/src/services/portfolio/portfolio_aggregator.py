"""
Portfolio Aggregator Service - Centralized Portfolio Data Aggregation

Centralizes category aggregation and wallet data combination logic
to eliminate duplication across services and improve maintainability.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from src.core.constants import CATEGORIES
from src.core.financial_utils import (
    calculate_percentage,
    calculate_percentage_rounded,
    safe_float,
    safe_int,
)
from src.models.portfolio import CategoryAllocation
from src.services.interfaces import PortfolioAggregatorProtocol
from src.services.shared.value_objects import (
    WalletAggregate,
    WalletCategoryBreakdown,
    create_empty_category_breakdown,
)


class PortfolioAggregator(PortfolioAggregatorProtocol):
    """Service for aggregating portfolio data from multiple sources."""

    def aggregate_categories(
        self,
        category_assets: Mapping[str, Any] | None,
        wallet_categories: Mapping[str, Any] | None,
        total_assets: float,
    ) -> dict[str, CategoryAllocation]:
        """Aggregate category totals and percentages from multiple sources."""
        allocations: dict[str, CategoryAllocation] = {}
        category_assets = category_assets or {}
        wallet_categories = wallet_categories or {}

        for category in CATEGORIES:
            other_sources_value = safe_float(category_assets.get(category))
            wallet_entry = wallet_categories.get(category)
            if isinstance(wallet_entry, WalletCategoryBreakdown):
                wallet_value = wallet_entry.value
            else:
                wallet_value = safe_float((wallet_entry or {}).get("value"))
            total_value = other_sources_value + wallet_value
            percentage = calculate_percentage(total_value, total_assets)

            allocations[category] = CategoryAllocation(
                total_value=total_value,
                percentage_of_portfolio=percentage,
                wallet_tokens_value=wallet_value,
                other_sources_value=other_sources_value,
            )

        return allocations

    def aggregate_wallet_data(
        self, wallet_summaries: Iterable[Mapping[str, Any]]
    ) -> WalletAggregate:
        """Aggregate totals and category breakdown from wallet summaries."""
        summaries = [
            self._coerce_wallet_summary(summary) for summary in wallet_summaries
        ]
        if not summaries:
            return self._empty_wallet_summary()

        total_value = sum(summary.total_value for summary in summaries)
        total_token_count = sum(summary.token_count for summary in summaries)

        categories = self._initialise_category_totals()
        for summary in summaries:
            for category, data in summary.categories.items():
                breakdown = categories.get(category)
                if breakdown is None:
                    continue
                breakdown.value += data.value

        for breakdown in categories.values():
            breakdown.percentage = calculate_percentage_rounded(
                breakdown.value, total_value
            )

        return WalletAggregate(
            total_value=total_value,
            token_count=total_token_count,
            categories=categories,
        )

    @staticmethod
    def _initialise_category_totals() -> dict[str, WalletCategoryBreakdown]:
        # Centralize category initialization with other services.
        return create_empty_category_breakdown()

    def _empty_wallet_summary(self) -> WalletAggregate:
        return WalletAggregate(
            total_value=0.0,
            token_count=0,
            categories=self._initialise_category_totals(),
        )

    def _coerce_wallet_summary(
        self, summary: Mapping[str, Any] | WalletAggregate
    ) -> WalletAggregate:
        if isinstance(summary, WalletAggregate):
            return summary

        categories = self._initialise_category_totals()
        raw_categories = (
            summary.get("categories") if isinstance(summary, Mapping) else None
        )
        if isinstance(raw_categories, Mapping):
            for category, payload in raw_categories.items():
                breakdown = categories.get(category)
                if breakdown is None:
                    continue
                if isinstance(payload, WalletCategoryBreakdown):
                    breakdown.value = payload.value
                    breakdown.percentage = payload.percentage
                elif isinstance(payload, Mapping):
                    breakdown.value = safe_float(payload.get("value"))
                    breakdown.percentage = safe_float(payload.get("percentage"))
                else:
                    breakdown.value = safe_float(payload)
        return WalletAggregate(
            total_value=safe_float(summary.get("total_value")),
            token_count=safe_int(summary.get("token_count")),
            categories=categories,
        )

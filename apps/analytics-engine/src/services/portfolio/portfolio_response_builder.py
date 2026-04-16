"""
Portfolio Response Builder - Specialized service for building portfolio responses

Handles the complex construction of PortfolioResponse objects with all their
nested components and validation logic.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from src.core.financial_utils import safe_float
from src.models.portfolio import (
    BorrowingSummary,
    CategorySummaryDebt,
    PoolDetail,
    PortfolioAllocation,
    PortfolioResponse,
    PortfolioROI,
    ROIData,
    WalletTokenSummary,
)
from src.services.interfaces import (
    PortfolioAggregatorProtocol,
    PortfolioROIComputed,
)
from src.services.portfolio.roi_calculator import (
    DEFAULT_RECOMMENDED_PERIOD,
    ROI_PERIODS,
)
from src.services.shared.value_objects import WalletAggregate

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class FinancialMetrics:
    total_assets: float
    total_debt: float
    aggregated_total_assets: float
    net_portfolio_value: float
    weighted_apr: float = 0.0
    estimated_monthly_income: float = 0.0


class PortfolioResponseBuilder:
    """Service for building PortfolioResponse objects from aggregated data"""

    def __init__(self, portfolio_aggregator: PortfolioAggregatorProtocol):
        """Initialize with portfolio aggregator dependency"""
        self.portfolio_aggregator = portfolio_aggregator

    def build_portfolio_response(
        self,
        portfolio_summary: dict[str, Any],
        wallet_summary: WalletAggregate,
        roi_data: PortfolioROIComputed,
        pool_details: list[dict[str, Any]] | None = None,
        # pool_details removed, replaced by counts
        positions_count: int = 0,
        protocols_count: int = 0,
        chains_count: int = 0,
        borrowing_summary: BorrowingSummary | None = None,
    ) -> PortfolioResponse:
        """
        Build a complete PortfolioResponse from aggregated data sources.

        Args:
            portfolio_summary: Portfolio data from trend-based aggregation
            wallet_summary: Wallet token data from wallet service
            roi_data: ROI calculations from ROI calculator
            positions_count: Total number of positions
            protocols_count: Total number of unique protocols
            chains_count: Total number of unique chains

        Returns:
            Validated PortfolioResponse object
        """
        financials = self._compute_financials(portfolio_summary, wallet_summary)
        portfolio_allocation = self._build_portfolio_allocation(
            portfolio_summary, wallet_summary, financials.aggregated_total_assets
        )

        # Build wallet token summary from wallet aggregate
        wallet_token_summary = WalletTokenSummary(
            total_value_usd=wallet_summary.total_value,
            token_count=wallet_summary.token_count,
        )

        # Build category summary debt from portfolio summary
        category_summary_debt = CategorySummaryDebt(
            btc=portfolio_summary.get("category_debt", {}).get("btc", 0.0),
            eth=portfolio_summary.get("category_debt", {}).get("eth", 0.0),
            stablecoins=portfolio_summary.get("category_debt", {}).get(
                "stablecoins", 0.0
            ),
            others=portfolio_summary.get("category_debt", {}).get("others", 0.0),
        )

        # Convert pool_details dicts to PoolDetail objects for type safety
        pool_detail_objects = [PoolDetail(**pd) for pd in (pool_details or [])]
        if borrowing_summary is None:
            borrowing_summary = BorrowingSummary.empty()  # pragma: no cover

        # Create and validate the complete portfolio response
        return PortfolioResponse(
            snapshot_date=portfolio_summary.get("snapshot_date"),
            total_assets_usd=financials.aggregated_total_assets,
            total_debt_usd=financials.total_debt,
            total_net_usd=financials.net_portfolio_value,
            net_portfolio_value=financials.net_portfolio_value,
            wallet_count=portfolio_summary.get("wallet_count", 0),
            last_updated=portfolio_summary.get("last_updated"),
            portfolio_allocation=portfolio_allocation,
            wallet_token_summary=wallet_token_summary,
            portfolio_roi=self._build_portfolio_roi(roi_data),
            category_summary_debt=category_summary_debt,
            pool_details=pool_detail_objects,
            positions=positions_count,
            protocols=protocols_count,
            chains=chains_count,
            borrowing_summary=borrowing_summary,
        )

    def _compute_financials(
        self,
        portfolio_summary: Mapping[str, Any],
        wallet_summary: WalletAggregate,
    ) -> FinancialMetrics:
        missing_fields = [
            field
            for field in ("total_assets", "total_debt", "net_portfolio_value")
            if portfolio_summary.get(field) is None
        ]
        if missing_fields:
            raise ValueError(
                "Missing required portfolio summary fields: "
                + ", ".join(missing_fields)
            )

        # Portfolio summary from trend data already includes ALL assets (wallet + DeFi)
        total_assets = safe_float(portfolio_summary.get("total_assets"))
        total_debt = safe_float(portfolio_summary.get("total_debt"))
        net_portfolio_value = safe_float(portfolio_summary.get("net_portfolio_value"))

        # No double-counting: total_assets already includes wallet assets from trend SQL
        aggregated_total_assets = total_assets

        return FinancialMetrics(
            total_assets=total_assets,
            total_debt=total_debt,
            aggregated_total_assets=aggregated_total_assets,
            net_portfolio_value=net_portfolio_value,
        )

    def _build_portfolio_allocation(
        self,
        portfolio_summary: Mapping[str, Any],
        wallet_summary: WalletAggregate,
        aggregated_total_assets: float,
    ) -> PortfolioAllocation:
        # Category assets from trend: DeFi assets only (other_sources_value)
        category_assets = portfolio_summary.get("category_summary_assets", {})
        # Wallet assets from trend: wallet assets (wallet_tokens_value)
        wallet_assets = portfolio_summary.get("wallet_assets", {})

        # Convert wallet_assets to WalletCategoryBreakdown format for aggregator
        from src.services.shared.value_objects import WalletCategoryBreakdown

        wallet_categories = {}
        for category, value in wallet_assets.items():
            percentage = (
                (value / aggregated_total_assets * 100.0)
                if aggregated_total_assets > 0
                else 0.0
            )
            wallet_categories[category] = WalletCategoryBreakdown(
                value=value, percentage=percentage
            )

        # Aggregate: combines DeFi (category_assets) + wallet (wallet_categories)
        category_allocations = self.portfolio_aggregator.aggregate_categories(
            category_assets, wallet_categories, aggregated_total_assets
        )

        return PortfolioAllocation(
            btc=category_allocations["btc"],
            eth=category_allocations["eth"],
            stablecoins=category_allocations["stablecoins"],
            others=category_allocations["others"],
        )

    def build_empty_response(self, user_id: UUID) -> PortfolioResponse:
        """Build empty response structure for users with no portfolio data."""
        # Use aggregator to create empty category allocations
        empty_categories = self.portfolio_aggregator.aggregate_categories({}, {}, 0.0)

        # Create empty portfolio allocation
        portfolio_allocation = PortfolioAllocation(
            btc=empty_categories["btc"],
            eth=empty_categories["eth"],
            stablecoins=empty_categories["stablecoins"],
            others=empty_categories["others"],
        )

        # Create empty wallet token summary
        wallet_token_summary = WalletTokenSummary(
            total_value_usd=0.0,
            token_count=0,
        )

        empty_roi = PortfolioROI(
            windows={
                period: ROIData(value=0.0, data_points=0, start_balance=0.0)
                for period in ROI_PERIODS
            },
            recommended_roi=0.0,
            recommended_period=DEFAULT_RECOMMENDED_PERIOD,
            recommended_yearly_roi=0.0,
            estimated_yearly_pnl_usd=0.0,
        )

        # Create empty category summary debt
        category_summary_debt = CategorySummaryDebt(
            btc=0.0,
            eth=0.0,
            stablecoins=0.0,
            others=0.0,
        )

        # Create empty borrowing summary (no debt)
        borrowing_summary = BorrowingSummary.empty()

        # Create and validate empty portfolio response
        return PortfolioResponse(
            snapshot_date=None,
            total_assets_usd=0.0,
            total_debt_usd=0.0,
            total_net_usd=0.0,
            net_portfolio_value=0.0,
            wallet_count=0,
            last_updated=None,
            portfolio_allocation=portfolio_allocation,
            wallet_token_summary=wallet_token_summary,
            portfolio_roi=empty_roi,
            category_summary_debt=category_summary_debt,
            pool_details=[],
            positions=0,
            protocols=0,
            chains=0,
            borrowing_summary=borrowing_summary,
        )

    def _build_portfolio_roi(self, roi_data: PortfolioROIComputed) -> PortfolioROI:
        """Build PortfolioROI from computed ROI data"""
        windows = {
            period: ROIData(
                value=data["value"],
                data_points=data["data_points"],
                start_balance=data.get("start_balance", 0.0),
            )
            for period, data in roi_data.get("windows", {}).items()
        }

        if not windows:
            windows = {
                period: ROIData(value=0.0, data_points=0, start_balance=0.0)
                for period in ROI_PERIODS
            }

        recommended_period = roi_data.get(
            "recommended_period", DEFAULT_RECOMMENDED_PERIOD
        )
        if recommended_period not in windows and windows:
            recommended_period = next(iter(windows))

        return PortfolioROI(
            windows=windows,
            recommended_roi=roi_data["recommended_roi"],
            recommended_period=recommended_period,
            recommended_yearly_roi=roi_data.get("recommended_yearly_roi", 0.0),
            estimated_yearly_pnl_usd=roi_data.get("estimated_yearly_pnl", 0.0),
        )

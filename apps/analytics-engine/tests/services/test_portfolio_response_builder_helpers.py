"""Unit tests targeting PortfolioResponseBuilder helper methods."""

from __future__ import annotations

from typing import Any

import pytest

from src.models.portfolio import CategoryAllocation, PortfolioAllocation
from src.services.portfolio.portfolio_response_builder import (
    FinancialMetrics,
    PortfolioResponseBuilder,
)
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown


class _StubAggregator:
    def __init__(self) -> None:
        self.last_call: tuple[Any, Any, float] | None = None

    def aggregate_categories(
        self,
        category_assets: dict[str, Any] | None,
        wallet_categories: dict[str, WalletCategoryBreakdown] | None,
        total_assets: float,
    ) -> dict[str, CategoryAllocation]:
        self.last_call = (category_assets, wallet_categories, total_assets)
        return {
            "btc": CategoryAllocation(
                total_value=30_000.0,
                percentage_of_portfolio=40.0,
                wallet_tokens_value=10_000.0,
                other_sources_value=20_000.0,
            ),
            "eth": CategoryAllocation(
                total_value=20_000.0,
                percentage_of_portfolio=26.67,
                wallet_tokens_value=7_500.0,
                other_sources_value=12_500.0,
            ),
            "stablecoins": CategoryAllocation(
                total_value=15_000.0,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=5_000.0,
                other_sources_value=10_000.0,
            ),
            "others": CategoryAllocation(
                total_value=10_000.0,
                percentage_of_portfolio=13.33,
                wallet_tokens_value=2_500.0,
                other_sources_value=7_500.0,
            ),
        }

    def aggregate_wallet_data(self, _wallet_summaries):  # pragma: no cover - unused
        raise NotImplementedError


@pytest.fixture()
def builder() -> PortfolioResponseBuilder:
    return PortfolioResponseBuilder(_StubAggregator())


@pytest.fixture()
def wallet_aggregate() -> WalletAggregate:
    return WalletAggregate(
        total_value=25_000.0,
        token_count=15,
        categories={
            "btc": WalletCategoryBreakdown(value=10_000.0, percentage=40.0),
            "eth": WalletCategoryBreakdown(value=7_500.0, percentage=30.0),
            "stablecoins": WalletCategoryBreakdown(value=5_000.0, percentage=20.0),
            "others": WalletCategoryBreakdown(value=2_500.0, percentage=10.0),
        },
        apr={"apr_30d": 0.08},
    )


def test_compute_financials_returns_expected_metrics(
    builder: PortfolioResponseBuilder, wallet_aggregate: WalletAggregate
) -> None:
    portfolio_summary = {
        "total_assets": 50_000.0,
        "total_debt": 5_000.0,
        "net_portfolio_value": 45_000.0,
    }

    metrics = builder._compute_financials(portfolio_summary, wallet_aggregate)

    assert isinstance(metrics, FinancialMetrics)
    assert metrics.total_assets == 50_000.0
    assert metrics.total_debt == 5_000.0
    assert metrics.aggregated_total_assets == 50_000.0
    assert metrics.net_portfolio_value == 45_000.0
    assert metrics.weighted_apr == 0.0  # APR removed
    assert metrics.estimated_monthly_income == 0.0  # Monthly income removed


def test_build_portfolio_allocation_uses_aggregator(
    builder: PortfolioResponseBuilder, wallet_aggregate: WalletAggregate
) -> None:
    portfolio_summary = {"category_summary_assets": {"btc": 20_000.0}}

    allocation = builder._build_portfolio_allocation(
        portfolio_summary, wallet_aggregate, aggregated_total_assets=75_000.0
    )

    assert isinstance(allocation, PortfolioAllocation)
    assert allocation.btc.total_value == 30_000.0
    assert allocation.eth.wallet_tokens_value == 7_500.0

    assert isinstance(builder.portfolio_aggregator, _StubAggregator)
    assert builder.portfolio_aggregator.last_call is not None
    _, wallet_categories, total_assets = builder.portfolio_aggregator.last_call
    assert isinstance(wallet_categories, dict)
    assert total_assets == 75_000.0


@pytest.mark.skip(
    reason="_build_wallet_token_summary helper removed - wallet_token_summary now built "
    "inline in build_portfolio_response (lines 82-85)"
)
def test_build_wallet_token_summary_returns_pydantic_model(
    builder: PortfolioResponseBuilder, wallet_aggregate: WalletAggregate
) -> None:
    # Create minimal allocation for test
    allocation = builder._build_portfolio_allocation(
        {"category_summary_assets": {"btc": 25_000.0}},
        wallet_aggregate,
        aggregated_total_assets=25_000.0,
    )

    summary = builder._build_wallet_token_summary(
        {"wallet_token_count": 15},
        wallet_aggregate,
        allocation,
    )

    assert summary.total_value_usd == 25_000.0
    assert summary.token_count == 15
    assert summary.apr_30d == 0.0


@pytest.mark.skip(
    reason="_build_category_summary_debt helper removed - category_summary_debt now built "
    "inline in build_portfolio_response (lines 88-95)"
)
def test_build_category_summary_debt_defaults_missing_keys(
    builder: PortfolioResponseBuilder,
) -> None:
    portfolio_summary = {"category_summary_debt": {"btc": "10", "eth": 5}}

    debt = builder._build_category_summary_debt(portfolio_summary)

    assert debt.btc == 10.0
    assert debt.eth == 5.0
    assert debt.stablecoins == 0.0
    assert debt.others == 0.0

"""
Comprehensive tests for PortfolioResponseBuilder class and FinancialMetrics.

Tests the component methods, FinancialMetrics dataclass, and response building logic
with various edge cases and validation scenarios. Full end-to-end validation is tested
in integration tests.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import uuid4

import pytest

from src.models.portfolio import (
    CategoryAllocation,
    PortfolioAllocation,
    PortfolioResponse,
)
from src.services.portfolio.portfolio_response_builder import (
    FinancialMetrics,
    PortfolioResponseBuilder,
)
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown


class _MockPortfolioAggregator:
    """Mock aggregator for testing PortfolioResponseBuilder."""

    def aggregate_categories(
        self,
        category_assets: dict[str, Any] | None,
        wallet_categories: dict[str, WalletCategoryBreakdown] | None,
        total_assets: float,
    ) -> dict[str, Any]:
        """Return mock category allocations that sum to total_assets."""
        from src.models.portfolio import CategoryAllocation

        # Create realistic allocations that sum to total_assets
        quarter = total_assets / 4.0
        return {
            "btc": CategoryAllocation(
                total_value=quarter,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=quarter / 2,
                other_sources_value=quarter / 2,
            ),
            "eth": CategoryAllocation(
                total_value=quarter,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=quarter / 2,
                other_sources_value=quarter / 2,
            ),
            "stablecoins": CategoryAllocation(
                total_value=quarter,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=quarter / 2,
                other_sources_value=quarter / 2,
            ),
            "others": CategoryAllocation(
                total_value=quarter,
                percentage_of_portfolio=25.0,
                wallet_tokens_value=quarter / 2,
                other_sources_value=quarter / 2,
            ),
        }

    def aggregate_wallet_data(self, wallet_summaries):  # pragma: no cover
        """Not used in these tests."""
        raise NotImplementedError


@pytest.fixture
def mock_aggregator() -> _MockPortfolioAggregator:
    """Provides a mock portfolio aggregator."""
    return _MockPortfolioAggregator()


@pytest.fixture
def builder(mock_aggregator: _MockPortfolioAggregator) -> PortfolioResponseBuilder:
    """Provides a PortfolioResponseBuilder with mock aggregator."""
    return PortfolioResponseBuilder(mock_aggregator)


@pytest.fixture
def sample_portfolio_summary() -> dict[str, Any]:
    """Provides sample portfolio summary data."""
    return {
        "total_assets": 5000.0,
        "total_debt": 1000.0,
        "net_portfolio_value": 4000.0,
        "wallet_count": 3,
        "last_updated": "2024-01-15T12:00:00Z",
        "category_summary_assets": {
            "btc": 1500.0,
            "eth": 1500.0,
            "stablecoins": 1000.0,
            "others": 1000.0,
        },
        "category_summary_debt": {
            "btc": 100.0,
            "eth": 200.0,
            "stablecoins": 300.0,
            "others": 400.0,
        },
        "wallet_token_count": 10,
        "wallet_assets": {
            "btc": 600.0,
            "eth": 500.0,
            "stablecoins": 500.0,
            "others": 400.0,
        },
    }


@pytest.fixture
def sample_wallet_aggregate() -> WalletAggregate:
    """Provides sample wallet aggregate data."""
    return WalletAggregate(
        total_value=2000.0,
        token_count=10,
        categories={
            "btc": WalletCategoryBreakdown(value=500.0, percentage=25.0),
            "eth": WalletCategoryBreakdown(value=500.0, percentage=25.0),
            "stablecoins": WalletCategoryBreakdown(value=500.0, percentage=25.0),
            "others": WalletCategoryBreakdown(value=500.0, percentage=25.0),
        },
        apr={"apr_30d": 0.08},
    )


@pytest.fixture
def sample_allocation(sample_portfolio_summary: dict[str, Any]) -> PortfolioAllocation:
    """Provides sample portfolio allocation matching wallet_assets from summary."""
    wallet_assets = sample_portfolio_summary["wallet_assets"]
    category_assets = sample_portfolio_summary["category_summary_assets"]

    # Create categories where wallet_tokens_value matches wallet_assets
    # and other_sources_value makes up the difference to category total
    return PortfolioAllocation(
        btc=CategoryAllocation(
            total_value=category_assets["btc"],
            percentage_of_portfolio=30.0,
            wallet_tokens_value=wallet_assets["btc"],
            other_sources_value=category_assets["btc"] - wallet_assets["btc"],
        ),
        eth=CategoryAllocation(
            total_value=category_assets["eth"],
            percentage_of_portfolio=30.0,
            wallet_tokens_value=wallet_assets["eth"],
            other_sources_value=category_assets["eth"] - wallet_assets["eth"],
        ),
        stablecoins=CategoryAllocation(
            total_value=category_assets["stablecoins"],
            percentage_of_portfolio=20.0,
            wallet_tokens_value=wallet_assets["stablecoins"],
            other_sources_value=category_assets["stablecoins"]
            - wallet_assets["stablecoins"],
        ),
        others=CategoryAllocation(
            total_value=category_assets["others"],
            percentage_of_portfolio=20.0,
            wallet_tokens_value=wallet_assets["others"],
            other_sources_value=category_assets["others"] - wallet_assets["others"],
        ),
    )


@pytest.fixture
def sample_roi_data() -> dict[str, Any]:
    """Provides sample ROI data."""
    return {
        "windows": {
            "roi_3d": {"value": 0.02, "data_points": 3, "start_balance": 5000.0},
            "roi_7d": {"value": 0.05, "data_points": 7, "start_balance": 5000.0},
            "roi_14d": {"value": 0.08, "data_points": 14, "start_balance": 4900.0},
            "roi_30d": {"value": 0.12, "data_points": 30, "start_balance": 4800.0},
            "roi_60d": {"value": 0.20, "data_points": 60, "start_balance": 4600.0},
            "roi_180d": {"value": 0.30, "data_points": 180, "start_balance": 4500.0},
            "roi_365d": {"value": 0.50, "data_points": 365, "start_balance": 4000.0},
        },
        "recommended_roi": 0.12,
        "recommended_period": "roi_30d",
        "recommended_yearly_roi": 0.48,
        "estimated_yearly_pnl": 600.0,
    }


class TestFinancialMetricsClass:
    """Tests for the FinancialMetrics dataclass."""

    def test_initialization_with_valid_data(self):
        """Verify FinancialMetrics initialization with complete data."""
        metrics = FinancialMetrics(
            total_assets=10000.0,
            total_debt=2000.0,
            aggregated_total_assets=12000.0,
            net_portfolio_value=10000.0,
            weighted_apr=0.05,
            estimated_monthly_income=41.67,
        )

        assert metrics.total_assets == 10000.0
        assert metrics.total_debt == 2000.0
        assert metrics.aggregated_total_assets == 12000.0
        assert metrics.net_portfolio_value == 10000.0
        assert metrics.weighted_apr == 0.05
        assert metrics.estimated_monthly_income == 41.67

    def test_initialization_with_zero_values(self):
        """Verify FinancialMetrics handles zero values correctly."""
        metrics = FinancialMetrics(
            total_assets=0.0,
            total_debt=0.0,
            aggregated_total_assets=0.0,
            net_portfolio_value=0.0,
            weighted_apr=0.0,
            estimated_monthly_income=0.0,
        )

        assert metrics.total_assets == 0.0
        assert metrics.net_portfolio_value == 0.0
        assert metrics.weighted_apr == 0.0

    def test_field_types_are_correct(self):
        """Verify field types match expected types."""
        metrics = FinancialMetrics(
            total_assets=5000.0,
            total_debt=1000.0,
            aggregated_total_assets=6000.0,
            net_portfolio_value=5000.0,
            weighted_apr=0.04,
            estimated_monthly_income=16.67,
        )

        assert isinstance(metrics.total_assets, float)
        assert isinstance(metrics.total_debt, float)
        assert isinstance(metrics.net_portfolio_value, float)
        assert isinstance(metrics.weighted_apr, float)

    def test_negative_values_allowed(self):
        """Verify negative values are allowed (for debt or losses)."""
        metrics = FinancialMetrics(
            total_assets=1000.0,
            total_debt=2000.0,
            aggregated_total_assets=1000.0,
            net_portfolio_value=-1000.0,  # Negative net value
            weighted_apr=-0.02,  # Negative APR (losses)
            estimated_monthly_income=0.0,
        )

        assert metrics.net_portfolio_value == -1000.0
        assert metrics.weighted_apr == -0.02

    def test_decimal_precision_preservation(self):
        """Verify decimal precision is preserved in metrics."""
        metrics = FinancialMetrics(
            total_assets=1234.56789,
            total_debt=234.56789,
            aggregated_total_assets=1469.13578,
            net_portfolio_value=1234.56789,
            weighted_apr=0.0456789,
            estimated_monthly_income=4.69,
        )

        assert pytest.approx(metrics.total_assets, abs=1e-5) == 1234.56789
        assert pytest.approx(metrics.weighted_apr, abs=1e-7) == 0.0456789

    def test_large_values_support(self):
        """Verify support for very large portfolio values."""
        metrics = FinancialMetrics(
            total_assets=1_000_000_000.0,  # 1 billion
            total_debt=100_000_000.0,  # 100 million
            aggregated_total_assets=1_100_000_000.0,
            net_portfolio_value=1_000_000_000.0,
            weighted_apr=0.03,
            estimated_monthly_income=2_500_000.0,
        )

        assert metrics.total_assets == 1_000_000_000.0
        assert metrics.estimated_monthly_income == 2_500_000.0


class TestPortfolioResponseBuilder:
    """Tests for PortfolioResponseBuilder component methods."""

    def test_compute_financials_complete_data(
        self,
        builder: PortfolioResponseBuilder,
        sample_portfolio_summary: dict[str, Any],
        sample_wallet_aggregate: WalletAggregate,
    ):
        """Verify financial metrics computation with complete data."""
        financials = builder._compute_financials(
            sample_portfolio_summary,
            sample_wallet_aggregate,
        )

        assert isinstance(financials, FinancialMetrics)
        assert financials.total_assets == 5000.0
        assert financials.total_debt == 1000.0
        assert financials.aggregated_total_assets == 5000.0
        assert financials.net_portfolio_value == 4000.0
        assert financials.weighted_apr == 0.0  # APR removed
        assert financials.estimated_monthly_income == 0.0  # Monthly income removed

    def test_compute_financials_with_missing_fields(
        self,
        builder: PortfolioResponseBuilder,
        sample_wallet_aggregate: WalletAggregate,
    ):
        """Verify financials computation handles missing fields gracefully."""
        minimal_summary = {}  # Missing total_assets and total_debt
        with pytest.raises(ValueError):
            builder._compute_financials(
                minimal_summary,
                sample_wallet_aggregate,
            )

    def test_compute_financials_decimal_precision(
        self,
        builder: PortfolioResponseBuilder,
    ):
        """Verify decimal precision is maintained in financial calculations."""
        portfolio_summary = {
            "total_assets": Decimal("1234.56789"),
            "total_debt": Decimal("234.56789"),
            "net_portfolio_value": Decimal("1000.0"),
        }
        wallet_aggregate = WalletAggregate(
            total_value=100.12345,
            token_count=5,
            categories={},
            apr={},
        )

        financials = builder._compute_financials(
            portfolio_summary,
            wallet_aggregate,
        )

        assert pytest.approx(financials.total_assets, abs=1e-5) == 1234.56789
        assert pytest.approx(financials.aggregated_total_assets, abs=1e-5) == 1234.56789
        assert pytest.approx(financials.net_portfolio_value, abs=1e-5) == 1000.0

    def test_compute_financials_monthly_income_zero_net_value(
        self,
        builder: PortfolioResponseBuilder,
    ):
        """Verify monthly income is zero when net value is zero or negative."""
        portfolio_summary = {
            "total_assets": 1000.0,
            "total_debt": 1000.0,  # Equal to assets
            "net_portfolio_value": 0.0,
        }
        wallet_aggregate = WalletAggregate(
            total_value=0.0,
            token_count=0,
            categories={},
            apr={},
        )

        financials = builder._compute_financials(
            portfolio_summary,
            wallet_aggregate,
        )

        assert financials.net_portfolio_value == 0.0
        assert financials.estimated_monthly_income == 0.0

    def test_compute_financials_large_portfolio(
        self,
        builder: PortfolioResponseBuilder,
    ):
        """Verify handling of very large portfolio values."""
        portfolio_summary = {
            "total_assets": 100_000_000.0,  # 100 million
            "total_debt": 10_000_000.0,  # 10 million
            "net_portfolio_value": 90_000_000.0,
        }
        wallet_aggregate = WalletAggregate(
            total_value=50_000_000.0,  # 50 million
            token_count=100,
            categories={},
            apr={},
        )

        financials = builder._compute_financials(
            portfolio_summary,
            wallet_aggregate,
        )

        assert financials.aggregated_total_assets == 100_000_000.0
        assert financials.net_portfolio_value == 90_000_000.0
        # APR and monthly income removed
        assert financials.weighted_apr == 0.0
        assert financials.estimated_monthly_income == 0.0

    def test_build_empty_response(
        self, builder: PortfolioResponseBuilder, mock_aggregator
    ):
        """Verify empty response structure for users with no data."""
        user_id = uuid4()
        response = builder.build_empty_response(user_id)

        assert isinstance(response, PortfolioResponse)
        assert response.total_assets_usd == 0.0
        assert response.total_debt_usd == 0.0
        assert response.total_net_usd == 0.0
        assert response.wallet_count == 0
        assert response.weighted_apr == 0.0
        assert response.estimated_monthly_income == 0.0
        assert response.wallet_token_summary.token_count == 0
        assert response.last_updated is None
        assert response.positions == 0
        assert response.protocols == 0
        assert response.chains == 0

    def test_build_empty_response_roi_windows_present(
        self, builder: PortfolioResponseBuilder
    ):
        """Verify empty response has all ROI windows with zero values."""
        user_id = uuid4()
        response = builder.build_empty_response(user_id)

        # Check for all 7 ROI periods
        assert "roi_3d" in response.portfolio_roi.windows
        assert "roi_7d" in response.portfolio_roi.windows
        assert "roi_14d" in response.portfolio_roi.windows
        assert "roi_30d" in response.portfolio_roi.windows
        assert "roi_60d" in response.portfolio_roi.windows
        assert "roi_180d" in response.portfolio_roi.windows
        assert "roi_365d" in response.portfolio_roi.windows

        # All windows should have zero values
        for window in response.portfolio_roi.windows.values():
            assert window.value == 0.0
            assert window.data_points == 0
            assert window.start_balance == 0.0

    # NOTE: The following tests were removed because _build_wallet_token_summary() and
    # _build_category_summary_debt() are no longer separate methods. They're now
    # inline in build_portfolio_response(). The functionality is tested via
    # integration tests that call build_portfolio_response() end-to-end.

    def test_build_portfolio_roi_complete_data(
        self, builder: PortfolioResponseBuilder, sample_roi_data: dict[str, Any]
    ):
        """Verify ROI building with complete data."""
        portfolio_roi = builder._build_portfolio_roi(sample_roi_data)

        assert portfolio_roi.recommended_period == "roi_30d"
        assert portfolio_roi.recommended_roi == 0.12
        assert portfolio_roi.recommended_yearly_roi == 0.48
        assert portfolio_roi.estimated_yearly_pnl_usd == 600.0

        # Verify specific window data
        assert portfolio_roi.windows["roi_7d"].value == 0.05
        assert portfolio_roi.windows["roi_30d"].data_points == 30
        assert portfolio_roi.windows["roi_180d"].start_balance == 4500.0

    def test_build_portfolio_roi_with_empty_windows(
        self, builder: PortfolioResponseBuilder
    ):
        """Verify ROI building handles empty windows gracefully."""
        roi_data = {
            "windows": {},  # Empty windows
            "recommended_roi": 0.0,
            "recommended_period": "roi_30d",
        }

        portfolio_roi = builder._build_portfolio_roi(roi_data)

        # Should create default windows for all 7 ROI periods
        assert len(portfolio_roi.windows) == 7
        assert all(window.value == 0.0 for window in portfolio_roi.windows.values())

    def test_build_portfolio_roi_with_missing_recommended_period(
        self, builder: PortfolioResponseBuilder
    ):
        """Verify ROI building handles missing recommended period."""
        roi_data = {
            "windows": {
                "roi_7d": {"value": 0.05, "data_points": 7, "start_balance": 5000.0},
            },
            "recommended_roi": 0.05,
            # Missing recommended_period
        }

        portfolio_roi = builder._build_portfolio_roi(roi_data)

        # Should use first window as fallback
        assert portfolio_roi.recommended_period == "roi_7d"

    def test_build_portfolio_roi_missing_optional_fields(
        self, builder: PortfolioResponseBuilder
    ):
        """Verify ROI building handles missing optional fields."""
        roi_data = {
            "windows": {
                "roi_30d": {"value": 0.12, "data_points": 30},  # Missing start_balance
            },
            "recommended_roi": 0.12,
            "recommended_period": "roi_30d",
            # Missing recommended_yearly_roi and estimated_yearly_pnl
        }

        portfolio_roi = builder._build_portfolio_roi(roi_data)

        assert portfolio_roi.windows["roi_30d"].start_balance == 0.0  # Default
        assert portfolio_roi.recommended_yearly_roi == 0.0  # Default
        assert portfolio_roi.estimated_yearly_pnl_usd == 0.0  # Default

"""Integration tests for landing page validation.

Tests that Pydantic model validators correctly catch mathematical inconsistencies
in portfolio data at the API layer.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from src.models.portfolio import (
    CategoryAllocation,
    CategorySummaryDebt,
    PortfolioAllocation,
    PortfolioResponse,
    PortfolioROI,
    ROIData,
    WalletTokenSummary,
)
from tests.helpers.model_factories import create_default_borrowing_summary


def _create_valid_category(
    total: float, pct: float, wallet: float, other: float
) -> CategoryAllocation:
    """Create valid category allocation for testing."""
    return CategoryAllocation(
        total_value=total,
        percentage_of_portfolio=pct,
        wallet_tokens_value=wallet,
        other_sources_value=other,
    )


def _create_valid_allocation() -> PortfolioAllocation:
    """Create valid portfolio allocation for testing."""
    return PortfolioAllocation(
        btc=_create_valid_category(
            total=30000.0, pct=40.0, wallet=10000.0, other=20000.0
        ),
        eth=_create_valid_category(
            total=22500.0, pct=30.0, wallet=7500.0, other=15000.0
        ),
        stablecoins=_create_valid_category(
            total=15000.0, pct=20.0, wallet=5000.0, other=10000.0
        ),
        others=_create_valid_category(
            total=7500.0, pct=10.0, wallet=2500.0, other=5000.0
        ),
    )


def _create_valid_roi() -> PortfolioROI:
    """Create valid ROI data for testing."""
    return PortfolioROI(
        windows={
            "roi_7d": ROIData(value=1.25, data_points=7, start_balance=25000.0),
            "roi_30d": ROIData(value=3.4, data_points=30, start_balance=24000.0),
        },
        recommended_roi=3.4,
        recommended_period="roi_30d",
        recommended_yearly_roi=41.70,
        estimated_yearly_pnl_usd=1420.0,
    )


class TestPortfolioResponseValidation:
    """Test PortfolioResponse model validation."""

    def test_valid_portfolio_response_passes(self) -> None:
        """Valid portfolio response should pass all validators."""
        response = PortfolioResponse(
            total_assets_usd=75000.0,
            total_debt_usd=5000.0,
            total_net_usd=70000.0,
            wallet_count=3,
            last_updated=datetime.now(UTC),
            portfolio_allocation=_create_valid_allocation(),
            wallet_token_summary=WalletTokenSummary(
                total_value_usd=25000.0,
                token_count=15,
            ),
            portfolio_roi=_create_valid_roi(),
            category_summary_debt=CategorySummaryDebt(
                btc=0.0, eth=0.0, stablecoins=3000.0, others=2000.0
            ),
            positions=0,
            protocols=0,
            chains=0,
            borrowing_summary=create_default_borrowing_summary(),
        )
        assert response.total_assets_usd == 75000.0
        assert response.total_net_usd == 70000.0

    def test_allocation_sum_not_equal_total_assets_fails(self) -> None:
        """Portfolio allocation sum != total_assets should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=100000.0,  # Mismatch - allocation sums to 75000
                total_debt_usd=5000.0,
                total_net_usd=95000.0,
                wallet_count=3,
                last_updated=datetime.now(UTC),
                portfolio_allocation=_create_valid_allocation(),  # Sums to 75000
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=25000.0,
                    token_count=15,
                ),
                portfolio_roi=_create_valid_roi(),
                category_summary_debt=CategorySummaryDebt(
                    btc=0.0, eth=0.0, stablecoins=3000.0, others=2000.0
                ),
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        error_msg = str(exc_info.value)
        assert "allocation sum" in error_msg.lower()
        assert "total assets" in error_msg.lower()

    def test_net_calculation_mismatch_fails(self) -> None:
        """Total net != (assets - debt) should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=75000.0,
                total_debt_usd=5000.0,
                total_net_usd=65000.0,  # Wrong - should be 70000
                wallet_count=3,
                last_updated=datetime.now(UTC),
                portfolio_allocation=_create_valid_allocation(),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=25000.0,
                    token_count=15,
                ),
                portfolio_roi=_create_valid_roi(),
                category_summary_debt=CategorySummaryDebt(
                    btc=0.0, eth=0.0, stablecoins=3000.0, others=2000.0
                ),
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        error_msg = str(exc_info.value)
        assert "net value" in error_msg.lower()

    def test_excessive_debt_to_assets_ratio_fails(self) -> None:
        """Debt-to-assets ratio >95% should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=10000.0,
                total_debt_usd=9700.0,  # 97% debt ratio - excessive
                total_net_usd=300.0,
                wallet_count=1,
                last_updated=datetime.now(UTC),
                portfolio_allocation=PortfolioAllocation(
                    btc=_create_valid_category(
                        total=10000.0, pct=100.0, wallet=10000.0, other=0.0
                    ),
                    eth=_create_valid_category(
                        total=0.0, pct=0.0, wallet=0.0, other=0.0
                    ),
                    stablecoins=_create_valid_category(
                        total=0.0, pct=0.0, wallet=0.0, other=0.0
                    ),
                    others=_create_valid_category(
                        total=0.0, pct=0.0, wallet=0.0, other=0.0
                    ),
                ),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=10000.0,
                    token_count=1,
                ),
                portfolio_roi=_create_valid_roi(),
                category_summary_debt=CategorySummaryDebt(
                    btc=0.0, eth=0.0, stablecoins=9700.0, others=0.0
                ),
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        error_msg = str(exc_info.value)
        assert "debt-to-assets ratio" in error_msg.lower()

    def test_excessive_token_count_fails(self) -> None:
        """Token count >10000 should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            WalletTokenSummary(
                total_value_usd=1000.0,
                token_count=15000,  # Exceeds max_token_count=10000
            )

        error_msg = str(exc_info.value)
        assert "token count" in error_msg.lower()
        assert "15000" in error_msg

    def test_roi_recommended_period_not_in_windows_fails(self) -> None:
        """ROI recommended period not in windows mapping should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioROI(
                windows={
                    "roi_7d": ROIData(value=1.25, data_points=7, start_balance=25000.0),
                    "roi_30d": ROIData(
                        value=3.4, data_points=30, start_balance=24000.0
                    ),
                },
                recommended_roi=5.0,
                recommended_period="roi_90d",  # Not in windows
                recommended_yearly_roi=60.0,
                estimated_yearly_pnl_usd=2000.0,
            )

        error_msg = str(exc_info.value)
        assert "recommended" in error_msg.lower()
        assert "period" in error_msg.lower()


class TestCategoryAllocationValidation:
    """Test CategoryAllocation model validation."""

    def test_valid_category_allocation_passes(self) -> None:
        """Valid category allocation should pass validation."""
        category = CategoryAllocation(
            total_value=100.0,
            percentage_of_portfolio=10.0,
            wallet_tokens_value=60.0,
            other_sources_value=40.0,
        )
        assert category.total_value == 100.0

    def test_component_sum_mismatch_fails(self) -> None:
        """Wallet + other != total should fail validation."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryAllocation(
                total_value=100.0,
                percentage_of_portfolio=10.0,
                wallet_tokens_value=60.0,
                other_sources_value=30.0,  # Sum is 90, not 100
            )

        error_msg = str(exc_info.value)
        assert "total_value" in error_msg.lower()
        assert "wallet_tokens_value" in error_msg.lower()


class TestPortfolioAllocationValidation:
    """Test PortfolioAllocation model validation."""

    def test_valid_allocation_passes(self) -> None:
        """Valid portfolio allocation should pass validation."""
        allocation = _create_valid_allocation()
        assert allocation.btc.percentage_of_portfolio == 40.0

    def test_percentages_not_summing_to_100_fails(self) -> None:
        """Category percentages not summing to 100% should fail."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioAllocation(
                btc=_create_valid_category(
                    total=30000.0, pct=50.0, wallet=10000.0, other=20000.0
                ),  # Wrong pct
                eth=_create_valid_category(
                    total=22500.0, pct=30.0, wallet=7500.0, other=15000.0
                ),
                stablecoins=_create_valid_category(
                    total=15000.0, pct=20.0, wallet=5000.0, other=10000.0
                ),
                others=_create_valid_category(
                    total=7500.0, pct=10.0, wallet=2500.0, other=5000.0
                ),
                # Sum = 110%, should be 100%
            )

        error_msg = str(exc_info.value)
        assert "percentages sum" in error_msg.lower()
        assert "110" in error_msg

    def test_empty_portfolio_zero_percentages_passes(self) -> None:
        """Empty portfolio with 0% percentages should pass."""
        allocation = PortfolioAllocation(
            btc=_create_valid_category(total=0.0, pct=0.0, wallet=0.0, other=0.0),
            eth=_create_valid_category(total=0.0, pct=0.0, wallet=0.0, other=0.0),
            stablecoins=_create_valid_category(
                total=0.0, pct=0.0, wallet=0.0, other=0.0
            ),
            others=_create_valid_category(total=0.0, pct=0.0, wallet=0.0, other=0.0),
        )
        assert allocation.btc.total_value == 0.0


class TestComplexValidationScenarios:
    """Test complex multi-validator scenarios."""

    def test_valid_empty_portfolio_passes_all_validators(self) -> None:
        """Valid empty portfolio should pass all validators."""
        response = PortfolioResponse(
            total_assets_usd=0.0,
            total_debt_usd=0.0,
            total_net_usd=0.0,
            wallet_count=0,
            last_updated=datetime.now(UTC),
            portfolio_allocation=PortfolioAllocation(
                btc=_create_valid_category(total=0.0, pct=0.0, wallet=0.0, other=0.0),
                eth=_create_valid_category(total=0.0, pct=0.0, wallet=0.0, other=0.0),
                stablecoins=_create_valid_category(
                    total=0.0, pct=0.0, wallet=0.0, other=0.0
                ),
                others=_create_valid_category(
                    total=0.0, pct=0.0, wallet=0.0, other=0.0
                ),
            ),
            wallet_token_summary=WalletTokenSummary(
                total_value_usd=0.0,
                token_count=0,
            ),
            portfolio_roi=PortfolioROI(
                windows={
                    "roi_7d": ROIData(value=0.0, data_points=0, start_balance=0.0),
                },
                recommended_roi=0.0,
                recommended_period="roi_7d",
                recommended_yearly_roi=0.0,
                estimated_yearly_pnl_usd=0.0,
            ),
            category_summary_debt=CategorySummaryDebt(
                btc=0.0, eth=0.0, stablecoins=0.0, others=0.0
            ),
            positions=0,
            protocols=0,
            chains=0,
            borrowing_summary=create_default_borrowing_summary(),
        )
        assert response.total_assets_usd == 0.0
        assert response.total_net_usd == 0.0

    def test_multiple_validation_failures_reports_first_error(self) -> None:
        """Multiple validation failures should report first encountered error."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=100000.0,  # Mismatch 1: allocation sums to 75000
                total_debt_usd=5000.0,
                total_net_usd=50000.0,  # Mismatch 2: should be 95000
                wallet_count=3,
                last_updated=datetime.now(UTC),
                portfolio_allocation=_create_valid_allocation(),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=50000.0,  # Mismatch 3: should be 25000
                    token_count=15,
                ),
                portfolio_roi=_create_valid_roi(),
                category_summary_debt=CategorySummaryDebt(
                    btc=0.0, eth=0.0, stablecoins=3000.0, others=2000.0
                ),
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        # Should fail on first validator that runs (allocation sum)
        error_msg = str(exc_info.value)
        assert "validation error" in error_msg.lower()

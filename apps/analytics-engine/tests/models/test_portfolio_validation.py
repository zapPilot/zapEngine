"""
Unit tests for Pydantic validation in portfolio models.

Tests cover validation logic for category allocations, wallet summaries,
ROI data, and comprehensive portfolio response validation.
"""

from datetime import date, datetime

import pytest
from pydantic import ValidationError

from src.models.portfolio import (
    BorrowingRiskMetrics,
    BorrowingSummary,
    CategoryAllocation,
    PortfolioAllocation,
    PortfolioResponse,
    PortfolioROI,
    WalletTokenSummary,
)
from tests.helpers.model_factories import create_default_borrowing_summary


class TestCategoryAllocationValidation:
    """Tests for CategoryAllocation validation logic."""

    def test_valid_category_allocation(self):
        """Verify valid category allocation passes validation."""
        category = CategoryAllocation(
            total_value=100.0,
            percentage_of_portfolio=25.0,
            wallet_tokens_value=60.0,
            other_sources_value=40.0,
        )

        assert category.total_value == 100.0
        assert category.wallet_tokens_value == 60.0
        assert category.other_sources_value == 40.0

    def test_component_sum_mismatch_raises_error(self):
        """Verify mismatch between total and components raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            CategoryAllocation(
                total_value=100.0,  # Should be 150.0
                percentage_of_portfolio=25.0,
                wallet_tokens_value=60.0,
                other_sources_value=90.0,  # 60 + 90 = 150, not 100
            )

        assert "does not equal" in str(exc_info.value)


class TestPortfolioAllocationValidation:
    """Tests for PortfolioAllocation validation logic."""

    def test_valid_portfolio_allocation(self):
        """Verify valid allocation with percentages summing to 100%."""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=40.0,
                percentage_of_portfolio=40.0,
                wallet_tokens_value=20.0,
                other_sources_value=20.0,
            ),
            eth=CategoryAllocation(
                total_value=30.0,
                percentage_of_portfolio=30.0,
                wallet_tokens_value=15.0,
                other_sources_value=15.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=20.0,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=10.0,
                other_sources_value=10.0,
            ),
            others=CategoryAllocation(
                total_value=10.0,
                percentage_of_portfolio=10.0,
                wallet_tokens_value=5.0,
                other_sources_value=5.0,
            ),
        )

        assert allocation.btc.percentage_of_portfolio == 40.0

    def test_empty_portfolio_with_zero_percentages(self):
        """Verify empty portfolio (all 0%) passes validation."""
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
        )

        # Should pass validation as empty portfolio
        assert allocation.btc.total_value == 0.0

    def test_percentages_not_summing_to_100_raises_error(self):
        """Verify percentages not summing to 100% raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioAllocation(
                btc=CategoryAllocation(
                    total_value=50.0,
                    percentage_of_portfolio=50.0,
                    wallet_tokens_value=25.0,
                    other_sources_value=25.0,
                ),
                eth=CategoryAllocation(
                    total_value=30.0,
                    percentage_of_portfolio=30.0,  # 50 + 30 + 10 + 5 = 95% (not 100%)
                    wallet_tokens_value=15.0,
                    other_sources_value=15.0,
                ),
                stablecoins=CategoryAllocation(
                    total_value=10.0,
                    percentage_of_portfolio=10.0,
                    wallet_tokens_value=5.0,
                    other_sources_value=5.0,
                ),
                others=CategoryAllocation(
                    total_value=5.0,
                    percentage_of_portfolio=5.0,
                    wallet_tokens_value=2.5,
                    other_sources_value=2.5,
                ),
            )

        assert "sum to" in str(exc_info.value)


class TestWalletTokenSummaryValidation:
    """Tests for WalletTokenSummary validation logic."""

    def test_valid_wallet_summary(self):
        """Verify valid wallet summary passes validation."""
        summary = WalletTokenSummary(
            total_value_usd=1000.0,
            token_count=10,
            apr_30d=5.5,
        )

        assert summary.token_count == 10

    def test_token_count_exceeds_max_raises_error(self):
        """Verify token count exceeding maximum raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            WalletTokenSummary(
                total_value_usd=1000.0,
                token_count=100000,  # Way over reasonable max
                apr_30d=5.5,
            )

        assert "exceeds maximum" in str(exc_info.value)


class TestPortfolioROIValidation:
    """Tests for PortfolioROI validation logic."""

    def test_valid_portfolio_roi(self):
        """Verify valid ROI data passes validation."""
        roi = PortfolioROI(
            windows={
                "roi_7d": {
                    "value": 1.5,
                    "data_points": 7,
                    "start_balance": 1000.0,
                    "days_spanned": 7,
                },
                "roi_30d": {
                    "value": 3.0,
                    "data_points": 30,
                    "start_balance": 1000.0,
                    "days_spanned": 30,
                },
            },
            recommended_roi=3.0,
            recommended_period="roi_30d",
            recommended_yearly_roi=36.5,
            estimated_yearly_pnl_usd=365.0,
        )

        assert roi.recommended_period == "roi_30d"

    def test_recommended_period_not_in_windows_raises_error(self):
        """Verify recommended period not in windows raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioROI(
                windows={
                    "roi_7d": {
                        "value": 1.5,
                        "data_points": 7,
                        "start_balance": 1000.0,
                        "days_spanned": 7,
                    },
                },
                recommended_roi=3.0,
                recommended_period="roi_30d",  # Not in windows!
                recommended_yearly_roi=36.5,
                estimated_yearly_pnl_usd=365.0,
            )

        assert "must exist within" in str(exc_info.value)


class TestPortfolioResponseValidation:
    """Tests for comprehensive PortfolioResponse validation."""

    def test_allocation_sum_mismatch_raises_error(self):
        """Verify allocation sum not matching total assets raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=1000.0,  # Should match allocation sum
                total_debt_usd=0.0,
                total_net_usd=1000.0,
                weighted_apr=5.0,
                estimated_monthly_income=41.67,
                wallet_count=1,
                last_updated=None,
                portfolio_allocation=PortfolioAllocation(
                    btc=CategoryAllocation(
                        total_value=400.0,  # Sum = 400 + 300 + 200 + 50 = 950 (not 1000!)
                        percentage_of_portfolio=40.0,
                        wallet_tokens_value=200.0,
                        other_sources_value=200.0,
                    ),
                    eth=CategoryAllocation(
                        total_value=300.0,
                        percentage_of_portfolio=30.0,
                        wallet_tokens_value=150.0,
                        other_sources_value=150.0,
                    ),
                    stablecoins=CategoryAllocation(
                        total_value=200.0,
                        percentage_of_portfolio=20.0,
                        wallet_tokens_value=100.0,
                        other_sources_value=100.0,
                    ),
                    others=CategoryAllocation(
                        total_value=50.0,
                        percentage_of_portfolio=10.0,
                        wallet_tokens_value=25.0,
                        other_sources_value=25.0,
                    ),
                ),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=475.0,
                    token_count=10,
                    apr_30d=5.0,
                ),
                portfolio_roi=PortfolioROI(
                    windows={
                        "roi_30d": {
                            "value": 0.0,
                            "data_points": 30,
                            "start_balance": 1000.0,
                            "days_spanned": 30,
                        }
                    },
                    recommended_roi=0.0,
                    recommended_period="roi_30d",
                    recommended_yearly_roi=0.0,
                    estimated_yearly_pnl_usd=0.0,
                    borrowing_summary=create_default_borrowing_summary(),
                ),
                category_summary_debt={
                    "btc": 0.0,
                    "eth": 0.0,
                    "stablecoins": 0.0,
                    "others": 0.0,
                },
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        assert "does not match" in str(exc_info.value)

    def test_net_calculation_mismatch_raises_error(self):
        """Verify net value calculation mismatch raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=1000.0,
                total_debt_usd=200.0,
                total_net_usd=900.0,  # Should be 800 (1000 - 200)!
                weighted_apr=5.0,
                estimated_monthly_income=41.67,
                wallet_count=1,
                last_updated=None,
                portfolio_allocation=PortfolioAllocation(
                    btc=CategoryAllocation(
                        total_value=400.0,
                        percentage_of_portfolio=40.0,
                        wallet_tokens_value=200.0,
                        other_sources_value=200.0,
                    ),
                    eth=CategoryAllocation(
                        total_value=300.0,
                        percentage_of_portfolio=30.0,
                        wallet_tokens_value=150.0,
                        other_sources_value=150.0,
                    ),
                    stablecoins=CategoryAllocation(
                        total_value=200.0,
                        percentage_of_portfolio=20.0,
                        wallet_tokens_value=100.0,
                        other_sources_value=100.0,
                    ),
                    others=CategoryAllocation(
                        total_value=100.0,
                        percentage_of_portfolio=10.0,
                        wallet_tokens_value=50.0,
                        other_sources_value=50.0,
                    ),
                ),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=500.0,
                    token_count=10,
                    apr_30d=5.0,
                ),
                portfolio_roi=PortfolioROI(
                    windows={
                        "roi_30d": {
                            "value": 0.0,
                            "data_points": 30,
                            "start_balance": 1000.0,
                            "days_spanned": 30,
                        }
                    },
                    recommended_roi=0.0,
                    recommended_period="roi_30d",
                    recommended_yearly_roi=0.0,
                    estimated_yearly_pnl_usd=0.0,
                    borrowing_summary=create_default_borrowing_summary(),
                ),
                category_summary_debt={
                    "btc": 0.0,
                    "eth": 0.0,
                    "stablecoins": 0.0,
                    "others": 0.0,
                },
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        assert "does not equal" in str(exc_info.value)

    def test_snapshot_date_mismatch_raises_error(self):
        """Verify mismatch between snapshot_date and last_updated raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                snapshot_date=date(2025, 1, 1),
                total_assets_usd=100.0,
                total_debt_usd=0.0,
                total_net_usd=100.0,
                wallet_count=1,
                last_updated=datetime(2025, 1, 2, 0, 0, 0),
                portfolio_allocation=PortfolioAllocation(
                    btc=CategoryAllocation(
                        total_value=25.0,
                        percentage_of_portfolio=25.0,
                        wallet_tokens_value=25.0,
                        other_sources_value=0.0,
                    ),
                    eth=CategoryAllocation(
                        total_value=25.0,
                        percentage_of_portfolio=25.0,
                        wallet_tokens_value=25.0,
                        other_sources_value=0.0,
                    ),
                    stablecoins=CategoryAllocation(
                        total_value=25.0,
                        percentage_of_portfolio=25.0,
                        wallet_tokens_value=25.0,
                        other_sources_value=0.0,
                    ),
                    others=CategoryAllocation(
                        total_value=25.0,
                        percentage_of_portfolio=25.0,
                        wallet_tokens_value=25.0,
                        other_sources_value=0.0,
                    ),
                ),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=100.0,
                    token_count=1,
                ),
                portfolio_roi=PortfolioROI(
                    windows={
                        "roi_30d": {
                            "value": 0.0,
                            "data_points": 0,
                            "start_balance": 0.0,
                            "days_spanned": 30,
                        }
                    },
                    recommended_roi=0.0,
                    recommended_period="roi_30d",
                    recommended_yearly_roi=0.0,
                    estimated_yearly_pnl_usd=0.0,
                    borrowing_summary=create_default_borrowing_summary(),
                ),
                category_summary_debt={
                    "btc": 0.0,
                    "eth": 0.0,
                    "stablecoins": 0.0,
                    "others": 0.0,
                },
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        assert "snapshot_date does not match last_updated" in str(exc_info.value)

    @pytest.mark.skip(
        reason="wallet_token_summary validation removed - values match by construction "
        "(both computed from same source in PortfolioResponseBuilder)"
    )
    def test_wallet_summary_mismatch_raises_error(self):
        """Verify wallet summary total mismatch raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=1000.0,
                total_debt_usd=0.0,
                total_net_usd=1000.0,
                weighted_apr=5.0,
                estimated_monthly_income=41.67,
                wallet_count=1,
                last_updated=None,
                portfolio_allocation=PortfolioAllocation(
                    btc=CategoryAllocation(
                        total_value=400.0,
                        percentage_of_portfolio=40.0,
                        wallet_tokens_value=200.0,
                        other_sources_value=200.0,
                    ),
                    eth=CategoryAllocation(
                        total_value=300.0,
                        percentage_of_portfolio=30.0,
                        wallet_tokens_value=150.0,
                        other_sources_value=150.0,
                    ),
                    stablecoins=CategoryAllocation(
                        total_value=200.0,
                        percentage_of_portfolio=20.0,
                        wallet_tokens_value=100.0,
                        other_sources_value=100.0,
                    ),
                    others=CategoryAllocation(
                        total_value=100.0,
                        percentage_of_portfolio=10.0,
                        wallet_tokens_value=50.0,
                        other_sources_value=50.0,
                    ),
                ),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=600.0,  # Should be 500 (200+150+100+50)!
                    token_count=10,
                    apr_30d=5.0,
                ),
                portfolio_roi=PortfolioROI(
                    windows={
                        "roi_30d": {
                            "value": 0.0,
                            "data_points": 30,
                            "start_balance": 1000.0,
                            "days_spanned": 30,
                        }
                    },
                    recommended_roi=0.0,
                    recommended_period="roi_30d",
                    recommended_yearly_roi=0.0,
                    estimated_yearly_pnl_usd=0.0,
                    borrowing_summary=create_default_borrowing_summary(),
                ),
                category_summary_debt={
                    "btc": 0.0,
                    "eth": 0.0,
                    "stablecoins": 0.0,
                    "others": 0.0,
                },
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        assert "diverged" in str(exc_info.value)

    def test_debt_to_assets_ratio_exceeds_max_raises_error(self):
        """Verify excessive debt-to-assets ratio raises ValueError."""
        with pytest.raises(ValidationError) as exc_info:
            PortfolioResponse(
                total_assets_usd=1000.0,
                total_debt_usd=970.0,  # 97% debt ratio (exceeds 95% max)
                total_net_usd=30.0,  # 1000 - 970
                weighted_apr=5.0,
                estimated_monthly_income=4.17,
                wallet_count=1,
                last_updated=None,
                portfolio_allocation=PortfolioAllocation(
                    btc=CategoryAllocation(
                        total_value=400.0,
                        percentage_of_portfolio=40.0,
                        wallet_tokens_value=200.0,
                        other_sources_value=200.0,
                    ),
                    eth=CategoryAllocation(
                        total_value=300.0,
                        percentage_of_portfolio=30.0,
                        wallet_tokens_value=150.0,
                        other_sources_value=150.0,
                    ),
                    stablecoins=CategoryAllocation(
                        total_value=200.0,
                        percentage_of_portfolio=20.0,
                        wallet_tokens_value=100.0,
                        other_sources_value=100.0,
                    ),
                    others=CategoryAllocation(
                        total_value=100.0,
                        percentage_of_portfolio=10.0,
                        wallet_tokens_value=50.0,
                        other_sources_value=50.0,
                    ),
                ),
                wallet_token_summary=WalletTokenSummary(
                    total_value_usd=500.0,
                    token_count=10,
                    apr_30d=5.0,
                ),
                portfolio_roi=PortfolioROI(
                    windows={
                        "roi_30d": {
                            "value": 0.0,
                            "data_points": 30,
                            "start_balance": 1000.0,
                            "days_spanned": 30,
                        }
                    },
                    recommended_roi=0.0,
                    recommended_period="roi_30d",
                    recommended_yearly_roi=0.0,
                    estimated_yearly_pnl_usd=0.0,
                    borrowing_summary=create_default_borrowing_summary(),
                ),
                category_summary_debt={
                    "btc": 0.0,
                    "eth": 0.0,
                    "stablecoins": 0.0,
                    "others": 0.0,
                },
                positions=0,
                protocols=0,
                chains=0,
                borrowing_summary=create_default_borrowing_summary(),
            )

        assert "exceeds maximum" in str(exc_info.value)


class TestBorrowingSummaryValidation:
    """Tests for BorrowingSummary validation logic."""

    def test_borrowing_summary_no_debt(self):
        """Verify BorrowingSummary with no debt (all defaults)."""
        summary = BorrowingSummary(
            has_debt=False,
            worst_health_rate=None,
            overall_status=None,
            critical_count=0,
            warning_count=0,
            healthy_count=0,
        )

        assert summary.has_debt is False
        assert summary.worst_health_rate is None
        assert summary.overall_status is None
        assert summary.critical_count == 0
        assert summary.warning_count == 0
        assert summary.healthy_count == 0

    def test_borrowing_summary_with_debt(self):
        """Verify BorrowingSummary with debt and populated fields."""
        summary = BorrowingSummary(
            has_debt=True,
            worst_health_rate=1.52,
            overall_status="WARNING",
            critical_count=1,
            warning_count=2,
            healthy_count=3,
        )

        assert summary.has_debt is True
        assert summary.worst_health_rate == 1.52
        assert summary.overall_status == "WARNING"
        assert summary.critical_count == 1
        assert summary.warning_count == 2
        assert summary.healthy_count == 3

    def test_borrowing_summary_counts_sum_to_positions(self):
        """Verify position counts can be validated externally."""
        summary = BorrowingSummary(
            has_debt=True,
            worst_health_rate=1.8,
            overall_status="WARNING",
            critical_count=1,
            warning_count=2,
            healthy_count=3,
        )

        # External validation: counts should sum to total positions
        total_positions = (
            summary.critical_count + summary.warning_count + summary.healthy_count
        )
        assert total_positions == 6

    def test_borrowing_summary_negative_counts_rejected(self):
        """Verify negative counts are rejected by validation."""
        with pytest.raises(ValidationError) as exc_info:
            BorrowingSummary(
                has_debt=True,
                worst_health_rate=1.5,
                overall_status="WARNING",
                critical_count=-1,  # Invalid
                warning_count=2,
                healthy_count=3,
            )

        assert "greater than or equal to 0" in str(exc_info.value)

    def test_borrowing_summary_invalid_status_rejected(self):
        """Verify invalid overall_status values are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            BorrowingSummary(
                has_debt=True,
                worst_health_rate=1.5,
                overall_status="UNKNOWN",  # Invalid - must be HEALTHY, WARNING, or CRITICAL
                critical_count=0,
                warning_count=1,
                healthy_count=0,
            )

        assert "Input should be" in str(exc_info.value)

    def test_borrowing_summary_defaults_applied(self):
        """Verify default values are applied correctly."""
        summary = BorrowingSummary(has_debt=False)

        # All other fields should have defaults
        assert summary.worst_health_rate is None
        assert summary.overall_status is None
        assert summary.critical_count == 0
        assert summary.warning_count == 0
        assert summary.healthy_count == 0


class TestBorrowingRiskMetricsValidation:
    """Tests for BorrowingRiskMetrics backward-compatible aliases."""

    def test_health_rate_alias_returns_worst_health_rate(self):
        """The deprecated `health_rate` alias should map to `worst_health_rate`."""
        metrics = BorrowingRiskMetrics(
            has_leverage=True,
            worst_health_rate=1.52,
            overall_health_status="WARNING",
            critical_position_count=1,
            warning_position_count=2,
            leverage_ratio=2.0,
            collateral_value_usd=10000.0,
            debt_value_usd=5000.0,
            liquidation_threshold=1.5,
            protocol_source="portfolio-aggregate",
            position_count=3,
        )

        assert metrics.health_rate == metrics.worst_health_rate

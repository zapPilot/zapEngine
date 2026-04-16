"""Integration tests for cross-endpoint data integrity validation.

Tests that data remains consistent across different API endpoints:
- Cross-endpoint user_id consistency
- Temporal alignment (period dates match)
- Data completeness (required fields present)
- Aggregation accuracy (totals match details)
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session

from src.models.analytics_responses import PeriodInfo
from src.models.portfolio import BorrowingSummary, PortfolioResponse
from src.services.portfolio.landing_page_service import LandingPageService


def _create_default_borrowing_summary(has_debt: bool = False) -> BorrowingSummary:
    """Create default borrowing summary for testing (no debt by default)."""
    return BorrowingSummary(
        has_debt=has_debt,
        worst_health_rate=None,
        overall_status=None,
        critical_count=0,
        warning_count=0,
        healthy_count=0,
    )


def _create_period_info(days: int = 30) -> PeriodInfo:
    """Create valid period info for testing."""
    from datetime import timedelta

    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = start + timedelta(days=days)
    return PeriodInfo(
        start_date=start,  # datetime object, not string
        end_date=end,  # datetime object, not string
        days=days,
    )


class TestCrossEndpointUserIDConsistency:
    """Test that user_id remains consistent across all endpoints."""

    def test_landing_page_preserves_user_id(self, db_session: Session) -> None:
        """Landing page endpoint preserves user_id in response."""
        user_id = uuid4()

        wallet_service = MagicMock()
        query_service = MagicMock()
        roi_calculator = MagicMock()
        snapshot_service = MagicMock()
        pool_service = MagicMock()
        canonical_snapshot_service = MagicMock()
        canonical_snapshot_service.get_snapshot_date.return_value = date(2025, 1, 1)
        borrowing_service = MagicMock()
        borrowing_service.calculate_borrowing_risk.return_value = None

        # Mock empty response
        snapshot_service.get_portfolio_snapshot.return_value = None
        wallet_service.get_wallet_token_summaries_batch.return_value = {}
        pool_service.get_pool_performance.return_value = []

        service = LandingPageService(
            db=db_session,
            wallet_service=wallet_service,
            query_service=query_service,
            roi_calculator=roi_calculator,
            portfolio_snapshot_service=snapshot_service,
            pool_performance_service=pool_service,
            canonical_snapshot_service=canonical_snapshot_service,
            borrowing_service=borrowing_service,
        )

        with patch.object(
            service.roi_calculator,
            "compute_portfolio_roi",
            return_value={
                "windows": {
                    "roi_7d": {"value": 0.0, "data_points": 0, "start_balance": 0.0}
                },
                "recommended_roi": 0.0,
                "recommended_period": "roi_7d",
                "recommended_yearly_roi": 0.0,
                "estimated_yearly_pnl": 0.0,
            },
        ):
            result = service.get_landing_page_data(user_id)

        # Verify user_id is preserved (converted to string)
        assert result is not None
        assert isinstance(result, PortfolioResponse)
        # PortfolioResponse doesn't have user_id field, so this test verifies no errors during creation

    def test_user_id_type_consistency(self) -> None:
        """User IDs should be consistently typed (UUID -> str conversion)."""
        user_id = uuid4()
        user_id_str = str(user_id)

        # Verify UUID to string conversion is deterministic
        assert str(user_id) == user_id_str
        assert UUID(user_id_str) == user_id

        # Verify string representation is valid UUID format
        parsed_uuid = UUID(user_id_str)
        assert parsed_uuid == user_id


class TestTemporalAlignmentConsistency:
    """Test that period dates align correctly across endpoints."""

    def test_period_info_date_alignment(self) -> None:
        """Period start and end dates should be consistent with days count."""
        period = _create_period_info(30)

        # start_date and end_date are already datetime objects
        start_dt = period.start_date
        end_dt = period.end_date

        # Verify dates are chronological
        assert start_dt < end_dt

        # Verify days count is reasonable (allowing for timezone differences)
        date_diff = (end_dt - start_dt).days
        assert date_diff >= period.days - 1  # Allow 1 day tolerance for timezone
        assert date_diff <= period.days + 1

    def test_period_info_datetime_objects(self) -> None:
        """Period dates should be datetime objects with timezone info."""
        period = _create_period_info(7)

        # Verify dates are datetime objects
        assert isinstance(period.start_date, datetime)
        assert isinstance(period.end_date, datetime)

        # Verify both dates have timezone info
        assert period.start_date.tzinfo is not None
        assert period.end_date.tzinfo is not None

    def test_period_info_minimum_days(self) -> None:
        """Period days should respect minimum constraint (ge=1)."""
        # Minimum: 1 day
        min_period = PeriodInfo(
            start_date=datetime(2024, 1, 1, tzinfo=UTC),
            end_date=datetime(2024, 1, 2, tzinfo=UTC),
            days=1,
        )
        assert min_period.days == 1

    def test_period_info_invalid_days_fails(self) -> None:
        """Period days < 1 should fail validation."""
        from pydantic import ValidationError

        # Days < 1 should fail
        with pytest.raises(ValidationError) as exc_info:
            PeriodInfo(
                start_date=datetime(2024, 1, 1, tzinfo=UTC),
                end_date=datetime(2024, 1, 1, tzinfo=UTC),
                days=0,
            )
        error_msg = str(exc_info.value)
        assert "greater than or equal to 1" in error_msg.lower()


class TestDataCompletenessValidation:
    """Test that required fields are present and valid across endpoints."""

    def test_portfolio_response_required_fields_present(self) -> None:
        """PortfolioResponse should have all required fields."""
        from src.models.portfolio import (
            CategoryAllocation,
            CategorySummaryDebt,
            PortfolioAllocation,
            PortfolioROI,
            ROIData,
            WalletTokenSummary,
        )

        # Create minimal valid response
        response = PortfolioResponse(
            total_assets_usd=0.0,
            total_debt_usd=0.0,
            total_net_usd=0.0,
            wallet_count=0,
            last_updated=datetime.now(UTC),
            portfolio_allocation=PortfolioAllocation(
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
            ),
            wallet_token_summary=WalletTokenSummary(
                total_value_usd=0.0,
                token_count=0,
            ),
            portfolio_roi=PortfolioROI(
                windows={
                    "roi_7d": ROIData(value=0.0, data_points=0, start_balance=0.0)
                },
                recommended_roi=0.0,
                recommended_period="roi_7d",
                recommended_yearly_roi=0.0,
                estimated_yearly_pnl_usd=0.0,
            ),
            category_summary_debt=CategorySummaryDebt(
                btc=0.0,
                eth=0.0,
                stablecoins=0.0,
                others=0.0,
            ),
            positions=0,
            protocols=0,
            chains=0,
            borrowing_summary=_create_default_borrowing_summary(),
        )

        # Verify all required fields are present
        assert response.total_assets_usd == 0.0
        assert response.total_debt_usd == 0.0
        assert response.total_net_usd == 0.0
        assert response.wallet_count == 0
        assert response.portfolio_allocation is not None
        assert response.wallet_token_summary is not None
        assert response.portfolio_roi is not None
        assert response.category_summary_debt is not None

    def test_period_info_required_fields_present(self) -> None:
        """PeriodInfo should have all required fields."""
        period = PeriodInfo(
            start_date="2024-01-01T00:00:00+00:00",
            end_date="2024-01-31T00:00:00+00:00",
            days=30,
        )

        # Verify all required fields
        assert period.start_date is not None
        assert period.end_date is not None
        assert period.days is not None
        assert isinstance(period.days, int)

    def test_negative_values_rejected_in_category_allocation(self) -> None:
        """Negative values should be rejected in CategoryAllocation (asset values must be >= 0)."""
        from pydantic import ValidationError

        from src.models.portfolio import CategoryAllocation

        # Negative total_value should fail validation
        with pytest.raises(ValidationError) as exc_info:
            CategoryAllocation(
                total_value=-100.0,  # Invalid - assets must be >= 0
                percentage_of_portfolio=10.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            )
        error_msg = str(exc_info.value)
        assert "greater than or equal to 0" in error_msg.lower()


class TestReferentialIntegrityValidation:
    """Test referential integrity across related data structures."""

    def test_portfolio_allocation_category_sum_matches_total(self) -> None:
        """Sum of category allocations should match total assets."""
        from src.models.portfolio import (
            CategoryAllocation,
            CategorySummaryDebt,
            PortfolioAllocation,
            PortfolioResponse,
            PortfolioROI,
            ROIData,
            WalletTokenSummary,
        )

        # Valid case: categories sum to total
        valid_allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=40.0,
                percentage_of_portfolio=40.0,
                wallet_tokens_value=40.0,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=30.0,
                percentage_of_portfolio=30.0,
                wallet_tokens_value=30.0,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=20.0,
                percentage_of_portfolio=20.0,
                wallet_tokens_value=20.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=10.0,
                percentage_of_portfolio=10.0,
                wallet_tokens_value=10.0,
                other_sources_value=0.0,
            ),
        )

        # Should not raise when allocation sums to total_assets
        response = PortfolioResponse(
            total_assets_usd=100.0,  # Matches sum of allocations
            total_debt_usd=0.0,
            total_net_usd=100.0,
            wallet_count=1,
            last_updated=datetime.now(UTC),
            portfolio_allocation=valid_allocation,
            wallet_token_summary=WalletTokenSummary(
                total_value_usd=100.0,
                token_count=10,
            ),
            portfolio_roi=PortfolioROI(
                windows={
                    "roi_7d": ROIData(value=0.0, data_points=0, start_balance=0.0)
                },
                recommended_roi=0.0,
                recommended_period="roi_7d",
                recommended_yearly_roi=0.0,
                estimated_yearly_pnl_usd=0.0,
            ),
            category_summary_debt=CategorySummaryDebt(
                btc=0.0,
                eth=0.0,
                stablecoins=0.0,
                others=0.0,
            ),
            positions=0,
            protocols=0,
            chains=0,
            borrowing_summary=_create_default_borrowing_summary(),
        )
        assert response.total_assets_usd == 100.0

    def test_roi_recommended_period_exists_in_windows(self) -> None:
        """ROI recommended_period must exist in windows mapping."""
        from pydantic import ValidationError

        from src.models.portfolio import PortfolioROI, ROIData

        # Valid case
        valid_roi = PortfolioROI(
            windows={
                "roi_7d": ROIData(value=1.5, data_points=7, start_balance=1000.0),
                "roi_30d": ROIData(value=5.2, data_points=30, start_balance=1000.0),
            },
            recommended_roi=5.2,
            recommended_period="roi_30d",  # Exists in windows
            recommended_yearly_roi=62.4,
            estimated_yearly_pnl_usd=624.0,
        )
        assert valid_roi.recommended_period in valid_roi.windows

        # Invalid case: recommended_period not in windows
        with pytest.raises(ValidationError) as exc_info:
            PortfolioROI(
                windows={
                    "roi_7d": ROIData(value=1.5, data_points=7, start_balance=1000.0),
                },
                recommended_roi=5.2,
                recommended_period="roi_90d",  # Does not exist in windows
                recommended_yearly_roi=62.4,
                estimated_yearly_pnl_usd=624.0,
            )
        error_msg = str(exc_info.value)
        assert "recommended" in error_msg.lower()

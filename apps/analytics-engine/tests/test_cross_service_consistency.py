"""Integration tests for cross-service consistency validation.

Tests that data inconsistencies between services are detected and handled correctly
with the >5% threshold for hard errors.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from src.core.exceptions import CrossServiceConsistencyError
from src.models.portfolio_snapshot import CategoryTotals, PortfolioSnapshot
from src.services.portfolio.landing_page_service import LandingPageService
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown
from tests.helpers.model_factories import create_default_borrowing_summary


def _get_roi_data() -> dict:
    """Get minimal ROI data for testing."""
    return {
        "windows": {
            "roi_7d": {"value": 0.0, "data_points": 0, "start_balance": 0.0},
            "roi_30d": {"value": 0.0, "data_points": 0, "start_balance": 0.0},
        },
        "recommended_roi": 0.0,
        "recommended_period": "roi_30d",
        "recommended_yearly_roi": 0.0,
        "estimated_yearly_pnl": 0.0,
    }


def _create_service(db_session: Session) -> tuple[LandingPageService, MagicMock]:
    """Create landing page service with mocked dependencies."""
    wallet_service = MagicMock()
    query_service = MagicMock()
    roi_calculator = MagicMock()
    snapshot_service = MagicMock()
    pool_service = MagicMock()
    canonical_snapshot_service = MagicMock()
    canonical_snapshot_service.get_snapshot_date.return_value = date(2025, 1, 1)
    borrowing_service = MagicMock()
    borrowing_service.get_borrowing_summary.return_value = (
        create_default_borrowing_summary()
    )

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

    return service, snapshot_service


def _create_snapshot(total_assets: float) -> PortfolioSnapshot:
    """Create portfolio snapshot with specified totals."""
    snapshot_date = date(2025, 1, 1)
    last_updated = datetime.combine(snapshot_date, datetime.min.time(), tzinfo=UTC)
    return PortfolioSnapshot(
        user_id=str(uuid4()),
        snapshot_date=snapshot_date,
        wallet_addresses=["0xtest"],
        wallet_count=1,
        last_updated=last_updated,
        total_assets=total_assets,
        total_debt=0.0,
        net_portfolio_value=total_assets,
        category_summary_assets=CategoryTotals.from_mapping({}),
        category_summary_debt=CategoryTotals.from_mapping({}),
        wallet_assets=CategoryTotals.from_mapping(
            {"btc": total_assets, "eth": 0.0, "stablecoins": 0.0, "others": 0.0}
        ),
        wallet_token_count=1,
        wallet_override=None,
    )


class TestCrossServiceConsistencyValidation:
    """Test cross-service consistency validation with >5% threshold."""

    def test_consistency_validation_passes_when_within_threshold(
        self, db_session: Session
    ) -> None:
        """Verify validation passes when difference is within 5% threshold."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        # Snapshot total: 1000.0, Wallet total: 1040.0 = 4% difference (within threshold)
        snapshot = _create_snapshot(total_assets=1000.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with (
            patch.object(
                service.wallet_service,
                "get_wallet_token_summaries_batch",
                return_value={
                    "0xtest": WalletAggregate(
                        total_value=1040.0,  # 4% difference
                        token_count=1,
                        categories={
                            "btc": WalletCategoryBreakdown(
                                value=1040.0, percentage=100.0
                            ),
                            "eth": WalletCategoryBreakdown(),
                            "stablecoins": WalletCategoryBreakdown(),
                            "others": WalletCategoryBreakdown(),
                        },
                    )
                },
            ),
            patch.object(
                service.pool_performance_service,
                "get_pool_performance",
                return_value=[],
            ),
            patch.object(
                service.roi_calculator,
                "compute_portfolio_roi",
                return_value=_get_roi_data(),
            ),
        ):
            # Should not raise CrossServiceConsistencyError
            result = service.get_landing_page_data(user_id)
            assert result is not None

    def test_consistency_validation_fails_when_exceeds_threshold(
        self, db_session: Session
    ) -> None:
        """Verify validation fails when difference exceeds 5% threshold."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        # Snapshot total: 1000.0, Wallet total: 1100.0 = 10% difference (exceeds threshold)
        snapshot = _create_snapshot(total_assets=1000.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with patch.object(
            service.wallet_service,
            "get_wallet_token_summaries_batch",
            return_value={
                "0xtest": WalletAggregate(
                    total_value=1100.0,  # 10% difference
                    token_count=1,
                    categories={
                        "btc": WalletCategoryBreakdown(value=1100.0, percentage=100.0),
                        "eth": WalletCategoryBreakdown(),
                        "stablecoins": WalletCategoryBreakdown(),
                        "others": WalletCategoryBreakdown(),
                    },
                )
            },
        ):
            with pytest.raises(CrossServiceConsistencyError) as exc_info:
                service.get_landing_page_data(user_id)

            # Verify error message and context
            assert "Wallet data inconsistency detected" in str(exc_info.value)
            assert exc_info.value.context["snapshot_total"] == 1000.0
            assert exc_info.value.context["wallet_total"] == 1100.0
            # Difference is 100 / 1100 = 9.09% (uses larger value as base)
            assert exc_info.value.context["difference_pct"] == pytest.approx(9.09, 0.01)
            assert exc_info.value.context["threshold_pct"] == 5.0

    def test_consistency_validation_exact_threshold_boundary(
        self, db_session: Session
    ) -> None:
        """Verify validation at exact 5% threshold boundary."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        # Snapshot total: 1000.0, Wallet total: 1050.0 = exactly 5% difference
        snapshot = _create_snapshot(total_assets=1000.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with (
            patch.object(
                service.wallet_service,
                "get_wallet_token_summaries_batch",
                return_value={
                    "0xtest": WalletAggregate(
                        total_value=1050.0,  # Exactly 5%
                        token_count=1,
                        categories={
                            "btc": WalletCategoryBreakdown(
                                value=1050.0, percentage=100.0
                            ),
                            "eth": WalletCategoryBreakdown(),
                            "stablecoins": WalletCategoryBreakdown(),
                            "others": WalletCategoryBreakdown(),
                        },
                    )
                },
            ),
            patch.object(
                service.pool_performance_service,
                "get_pool_performance",
                return_value=[],
            ),
            patch.object(
                service.roi_calculator,
                "compute_portfolio_roi",
                return_value=_get_roi_data(),
            ),
        ):
            # Should pass (threshold is >, not >=)
            result = service.get_landing_page_data(user_id)
            assert result is not None

    def test_consistency_validation_both_zero_passes(self, db_session: Session) -> None:
        """Verify validation passes when both totals are zero (empty portfolio)."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        snapshot = _create_snapshot(total_assets=0.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with (
            patch.object(
                service.wallet_service,
                "get_wallet_token_summaries_batch",
                return_value={
                    "0xtest": WalletAggregate(
                        total_value=0.0,
                        token_count=0,
                        categories={
                            "btc": WalletCategoryBreakdown(),
                            "eth": WalletCategoryBreakdown(),
                            "stablecoins": WalletCategoryBreakdown(),
                            "others": WalletCategoryBreakdown(),
                        },
                    )
                },
            ),
            patch.object(
                service.pool_performance_service,
                "get_pool_performance",
                return_value=[],
            ),
            patch.object(
                service.roi_calculator,
                "compute_portfolio_roi",
                return_value=_get_roi_data(),
            ),
        ):
            # Should not raise
            result = service.get_landing_page_data(user_id)
            assert result is not None

    def test_consistency_validation_one_zero_fails(self, db_session: Session) -> None:
        """Verify validation fails when one total is zero and other is not."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        snapshot = _create_snapshot(total_assets=0.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with patch.object(
            service.wallet_service,
            "get_wallet_token_summaries_batch",
            return_value={
                "0xtest": WalletAggregate(
                    total_value=1000.0,  # One is zero, other is not
                    token_count=1,
                    categories={
                        "btc": WalletCategoryBreakdown(value=1000.0, percentage=100.0),
                        "eth": WalletCategoryBreakdown(),
                        "stablecoins": WalletCategoryBreakdown(),
                        "others": WalletCategoryBreakdown(),
                    },
                )
            },
        ):
            with pytest.raises(CrossServiceConsistencyError) as exc_info:
                service.get_landing_page_data(user_id)

            assert exc_info.value.context["difference_pct"] == 100.0

    def test_consistency_validation_negative_difference(
        self, db_session: Session
    ) -> None:
        """Verify validation handles snapshot > wallet correctly."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        # Snapshot total: 1100.0, Wallet total: 1000.0 = 10% difference
        snapshot = _create_snapshot(total_assets=1100.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with patch.object(
            service.wallet_service,
            "get_wallet_token_summaries_batch",
            return_value={
                "0xtest": WalletAggregate(
                    total_value=1000.0,  # Snapshot > Wallet
                    token_count=1,
                    categories={
                        "btc": WalletCategoryBreakdown(value=1000.0, percentage=100.0),
                        "eth": WalletCategoryBreakdown(),
                        "stablecoins": WalletCategoryBreakdown(),
                        "others": WalletCategoryBreakdown(),
                    },
                )
            },
        ):
            with pytest.raises(CrossServiceConsistencyError) as exc_info:
                service.get_landing_page_data(user_id)

            # Should use absolute difference
            assert exc_info.value.context["difference_pct"] == pytest.approx(10.0, 0.1)
            assert exc_info.value.context["difference_usd"] == 100.0

    def test_consistency_validation_large_portfolio(self, db_session: Session) -> None:
        """Verify validation works correctly with large portfolio values."""
        service, snapshot_service = _create_service(db_session)
        user_id = uuid4()

        # Test with $1M portfolio, 6% difference = $60k
        snapshot = _create_snapshot(total_assets=1_000_000.0)
        snapshot_service.get_portfolio_snapshot.return_value = snapshot

        with patch.object(
            service.wallet_service,
            "get_wallet_token_summaries_batch",
            return_value={
                "0xtest": WalletAggregate(
                    total_value=1_060_000.0,  # 6% difference
                    token_count=1,
                    categories={
                        "btc": WalletCategoryBreakdown(
                            value=1_060_000.0, percentage=100.0
                        ),
                        "eth": WalletCategoryBreakdown(),
                        "stablecoins": WalletCategoryBreakdown(),
                        "others": WalletCategoryBreakdown(),
                    },
                )
            },
        ):
            with pytest.raises(CrossServiceConsistencyError) as exc_info:
                service.get_landing_page_data(user_id)

            assert exc_info.value.context["difference_usd"] == 60_000.0
            assert exc_info.value.context["difference_pct"] == pytest.approx(6.0, 0.1)

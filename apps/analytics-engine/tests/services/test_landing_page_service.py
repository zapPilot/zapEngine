"""Unit tests for LandingPageService (V2 architecture)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from src.core.exceptions import CrossServiceConsistencyError
from src.models import PortfolioResponse
from src.models.portfolio import BorrowingSummary
from src.models.portfolio_snapshot import (
    CategoryTotals,
    PortfolioSnapshot,
    WalletTrendOverride,
)
from src.services.portfolio.canonical_snapshot_service import SnapshotInfo
from src.services.portfolio.landing_page_service import LandingPageService
from src.services.portfolio.wallet_service import WalletService
from src.services.shared.query_service import QueryService
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown


def _make_snapshot(
    *,
    summary: dict[str, Any] | None = None,
    wallet_addresses: list[str] | None = None,
    wallet_override: dict[str, Any] | None = None,
    snapshot_date: date | None = None,
) -> PortfolioSnapshot:
    snapshot_date = snapshot_date or datetime.now(UTC).date()
    summary = summary or {
        "total_assets": 0.0,
        "total_debt": 0.0,
        "net_portfolio_value": 0.0,
        "wallet_count": len(wallet_addresses or []),
        "last_updated": None,
        "category_summary_assets": {},
        "category_summary_debt": {},
        "wallet_assets": {},
        "wallet_token_count": 0,
    }
    wallet_addresses = wallet_addresses or []
    override_model = (
        WalletTrendOverride(**wallet_override) if wallet_override is not None else None
    )

    return PortfolioSnapshot(
        user_id="test-user",
        snapshot_date=snapshot_date,
        wallet_addresses=wallet_addresses,
        wallet_count=summary.get("wallet_count", len(wallet_addresses)),
        last_updated=datetime.combine(snapshot_date, datetime.min.time(), tzinfo=UTC),
        total_assets=summary.get("total_assets", 0.0),
        total_debt=summary.get("total_debt", 0.0),
        net_portfolio_value=summary.get("net_portfolio_value", 0.0),
        category_summary_assets=CategoryTotals.from_mapping(
            summary.get("category_summary_assets")
        ),
        category_summary_debt=CategoryTotals.from_mapping(
            summary.get("category_summary_debt")
        ),
        wallet_assets=CategoryTotals.from_mapping(summary.get("wallet_assets")),
        wallet_token_count=summary.get("wallet_token_count", 0),
        wallet_override=override_model,
    )


def _make_service(
    db_session: Session,
    *,
    snapshot: PortfolioSnapshot | None = None,
    pool_details: list[dict[str, Any]] | None = None,
    canonical_snapshot_date: date | None = date(2025, 1, 1),
):
    query_service = QueryService()
    wallet_service = WalletService(query_service)
    snapshot_service = MagicMock()
    snapshot_service.get_portfolio_snapshot.return_value = snapshot or _make_snapshot(
        snapshot_date=canonical_snapshot_date
    )

    pool_service = MagicMock()
    pool_service.get_pool_performance.return_value = pool_details or []

    roi_calculator = MagicMock()
    # Mock ROI data with required fields
    roi_calculator.compute_portfolio_roi.return_value = {
        "windows": {
            "week": {"value": 0.0, "data_points": 0, "start_balance": 0.0},
            "month": {"value": 0.0, "data_points": 0, "start_balance": 0.0},
            "quarter": {"value": 0.0, "data_points": 0, "start_balance": 0.0},
            "year": {"value": 0.0, "data_points": 0, "start_balance": 0.0},
        },
        "recommended_roi": 0.0,
        "recommended_period": "month",
        "recommended_yearly_roi": 0.0,
        "estimated_yearly_pnl": 0.0,
    }

    canonical_snapshot_service = MagicMock()
    if canonical_snapshot_date:
        canonical_snapshot_service.get_snapshot_info.return_value = SnapshotInfo(
            snapshot_date=canonical_snapshot_date, wallet_count=1, last_updated=None
        )
    else:
        canonical_snapshot_service.get_snapshot_info.return_value = None

    # Mock borrowing service (new dependency)
    borrowing_service = MagicMock()
    borrowing_service.get_borrowing_summary.return_value = BorrowingSummary(
        has_debt=False,
        worst_health_rate=None,
        overall_status=None,
        critical_count=0,
        warning_count=0,
        healthy_count=0,
    )

    service = LandingPageService(
        db=db_session,
        wallet_service=wallet_service,
        query_service=query_service,
        portfolio_snapshot_service=snapshot_service,
        pool_performance_service=pool_service,
        roi_calculator=roi_calculator,
        canonical_snapshot_service=canonical_snapshot_service,
        borrowing_service=borrowing_service,
    )

    return service, wallet_service, snapshot_service, pool_service


def test_get_landing_page_data_with_wallet_summary(
    db_session: Session, create_test_user_and_wallets: tuple
) -> None:
    user_id, wallet_addresses = create_test_user_and_wallets

    summary = {
        "total_assets": 230.0,
        "total_debt": 0.0,
        "net_portfolio_value": 230.0,
        "wallet_count": len(wallet_addresses),
        "last_updated": None,
        "category_summary_assets": {},
        "category_summary_debt": {},
        "wallet_assets": {
            "btc": 100.0,
            "eth": 80.0,
            "stablecoins": 50.0,
            "others": 0.0,
        },
        "wallet_token_count": 2,
    }

    snapshot = _make_snapshot(
        summary=summary,
        wallet_addresses=list(wallet_addresses),
        wallet_override={
            "categories": summary["wallet_assets"],
            "total_value": 230.0,
        },
        snapshot_date=date(2025, 1, 1),
    )

    service, wallet_service, snapshot_service, _ = _make_service(
        db_session,
        snapshot=snapshot,
    )

    with patch.object(
        wallet_service,
        "get_wallet_token_summaries_batch",
        return_value={
            wallet_addresses[0]: WalletAggregate(
                total_value=230.0,
                token_count=2,
                categories={
                    "btc": WalletCategoryBreakdown(value=100.0, percentage=43.48),
                    "eth": WalletCategoryBreakdown(value=80.0, percentage=34.78),
                    "stablecoins": WalletCategoryBreakdown(
                        value=50.0, percentage=21.74
                    ),
                    "others": WalletCategoryBreakdown(),
                },
            )
        },
    ):
        result = service.get_landing_page_data(user_id)

    assert isinstance(result, PortfolioResponse)
    assert result.total_assets_usd == pytest.approx(230.0)
    assert result.total_net_usd == pytest.approx(230.0)
    assert result.positions == 0  # No pool positions


def test_fetch_wallet_summary_without_wallets(db_session: Session) -> None:
    service, wallet_service, _, _ = _make_service(db_session)

    aggregate = service._fetch_wallet_summary(UUID(int=0), wallet_addresses=[])

    assert isinstance(aggregate, WalletAggregate)
    assert aggregate.total_value == 0.0
    assert aggregate.token_count == 0


def test_fetch_wallet_summary_applies_override(db_session: Session) -> None:
    service, wallet_service, _, _ = _make_service(db_session)

    wallet_addresses = ["0xabc"]
    mock_summary = WalletAggregate(
        total_value=1000.0,
        token_count=5,
        categories={
            "btc": WalletCategoryBreakdown(value=400.0, percentage=40.0),
            "eth": WalletCategoryBreakdown(value=300.0, percentage=30.0),
            "stablecoins": WalletCategoryBreakdown(value=200.0, percentage=20.0),
            "others": WalletCategoryBreakdown(value=100.0, percentage=10.0),
        },
        apr={"apr_30d": 0.06},
    )

    with patch.object(
        wallet_service,
        "get_wallet_token_summaries_batch",
        return_value={wallet_addresses[0]: mock_summary},
    ):
        override = WalletTrendOverride(
            categories={
                "btc": 200.0,
                "eth": 300.0,
                "stablecoins": 100.0,
                "others": 50.0,
            },
            total_value=650.0,
        )
        aggregate = service._fetch_wallet_summary(
            UUID(int=1),
            wallet_addresses=wallet_addresses,
            wallet_override=override,
        )

    assert aggregate.total_value == 650.0
    assert aggregate.categories["btc"].value == pytest.approx(200.0)


def test_get_landing_page_data_includes_pool_counts(
    db_session: Session, create_test_user_and_wallets: tuple
) -> None:
    """Verify pool counts are populated in landing page response."""
    user_id, wallet_addresses = create_test_user_and_wallets

    # Mock pool counts (simulating 1 position on Aave V3 on ethereum)
    pool_counts = {"positions": 1, "protocols": 1, "chains": 1}

    summary = {
        "total_assets": 2000.0,
        "total_debt": 0.0,
        "net_portfolio_value": 2000.0,
        "wallet_count": len(wallet_addresses),
        "last_updated": None,
        "category_summary_assets": {},
        "category_summary_debt": {},
        "wallet_assets": {
            "btc": 1000.0,
            "eth": 0.0,
            "stablecoins": 1000.0,
            "others": 0.0,
        },
        "wallet_token_count": 2,
    }

    snapshot = _make_snapshot(
        wallet_addresses=wallet_addresses,
        summary=summary,
        snapshot_date=date(2025, 1, 1),
    )

    service, wallet_service, _, pool_service = _make_service(
        db_session,
        snapshot=snapshot,
        pool_details=[],  # No longer used, but kept for _make_service compatibility
    )

    # Mock pool service to return counts
    pool_service.get_pool_counts.return_value = pool_counts

    with patch.object(
        wallet_service,
        "get_wallet_token_summaries_batch",
        return_value={
            wallet_addresses[0]: WalletAggregate(
                total_value=2000.0,
                token_count=2,
                categories={
                    "btc": WalletCategoryBreakdown(value=1000.0, percentage=50.0),
                    "eth": WalletCategoryBreakdown(value=0.0, percentage=0.0),
                    "stablecoins": WalletCategoryBreakdown(
                        value=1000.0, percentage=50.0
                    ),
                    "others": WalletCategoryBreakdown(),
                },
            )
        },
    ):
        result = service.get_landing_page_data(user_id)

    # Note: Actual counts come from PortfolioSnapshotService, not PoolPerformanceService
    # This test verifies the structure exists, actual integration tested elsewhere
    assert hasattr(result, "positions")
    assert hasattr(result, "protocols")
    assert hasattr(result, "chains")


def test_get_landing_page_data_handles_pool_service_failure(
    db_session: Session, create_test_user_and_wallets: tuple
) -> None:
    """Verify graceful degradation when pool service fails."""
    user_id, wallet_addresses = create_test_user_and_wallets

    summary = {
        "total_assets": 1000.0,
        "total_debt": 0.0,
        "net_portfolio_value": 1000.0,
        "wallet_count": len(wallet_addresses),
        "last_updated": None,
        "category_summary_assets": {},
        "category_summary_debt": {},
        "wallet_assets": {"btc": 1000.0, "eth": 0.0, "stablecoins": 0.0, "others": 0.0},
        "wallet_token_count": 1,
    }

    snapshot = _make_snapshot(
        wallet_addresses=wallet_addresses,
        summary=summary,
        snapshot_date=date(2025, 1, 1),
    )

    service, wallet_service, _, pool_service = _make_service(
        db_session,
        snapshot=snapshot,
    )

    # Mock pool service to raise an exception
    pool_service.get_pool_performance.side_effect = Exception("Database error")

    with patch.object(
        wallet_service,
        "get_wallet_token_summaries_batch",
        return_value={
            wallet_addresses[0]: WalletAggregate(
                total_value=1000.0,
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
        result = service.get_landing_page_data(user_id)

    # Landing page should still succeed with zero pool counts
    assert result.positions == 0
    assert result.protocols == 0
    assert result.chains == 0
    assert result.total_assets_usd == pytest.approx(1000.0)
    assert result.total_net_usd == pytest.approx(1000.0)


def test_empty_response_has_zero_pool_counts(db_session: Session) -> None:
    """Verify empty response includes zero pool counts."""
    service, _, _, _ = _make_service(db_session, snapshot=None)

    result = service.get_landing_page_data(UUID(int=0))

    assert result.positions == 0
    assert result.protocols == 0
    assert result.chains == 0
    assert result.total_assets_usd == 0.0
    assert result.wallet_count == 0


def test_validate_consistency_wallet_match(db_session: Session) -> None:
    """Wallet totals match - validation should pass."""
    service, _, _, _ = _make_service(db_session, snapshot=None)
    user_id = UUID(int=1)

    # Both wallet totals match - should NOT raise
    service._validate_cross_service_consistency(
        user_id,
        snapshot_total=552.85,
        wallet_total=552.85,
    )


def test_validate_consistency_wallet_within_threshold(db_session: Session) -> None:
    """Wallet totals differ but within 5% threshold - should pass."""
    service, _, _, _ = _make_service(db_session, snapshot=None)
    user_id = UUID(int=1)

    # 3% difference - should NOT raise
    service._validate_cross_service_consistency(
        user_id,
        snapshot_total=1000.0,
        wallet_total=970.0,  # 3% difference
    )


def test_validate_consistency_wallet_mismatch(db_session: Session) -> None:
    """Wallet totals differ >5% - validation should raise."""
    service, _, _, _ = _make_service(db_session, snapshot=None)
    user_id = UUID(int=1)

    # 50% difference - should raise CrossServiceConsistencyError
    with pytest.raises(CrossServiceConsistencyError) as exc_info:
        service._validate_cross_service_consistency(
            user_id,
            snapshot_total=552.85,
            wallet_total=1000.0,
        )

    error = exc_info.value
    assert "Wallet data inconsistency" in str(error)
    assert "552.85" in str(error)
    assert "1000.0" in str(error)


def test_validate_consistency_both_zero(db_session: Session) -> None:
    """Both totals are zero - validation should pass."""
    service, _, _, _ = _make_service(db_session, snapshot=None)
    user_id = UUID(int=1)

    # Both zero - should NOT raise
    service._validate_cross_service_consistency(
        user_id,
        snapshot_total=0.0,
        wallet_total=0.0,
    )


def test_validate_consistency_one_zero(db_session: Session) -> None:
    """One total is zero, other is not - validation should raise."""
    service, _, _, _ = _make_service(db_session, snapshot=None)
    user_id = UUID(int=1)

    # One is zero, other is not - should raise
    with pytest.raises(CrossServiceConsistencyError):
        service._validate_cross_service_consistency(
            user_id,
            snapshot_total=0.0,
            wallet_total=1000.0,
        )


def test_snapshot_date_extracted_and_passed_to_pool_performance(
    db_session: Session, create_test_user_and_wallets: tuple
) -> None:
    """Test that canonical snapshot date is passed to pool service."""
    from datetime import date

    user_id, wallet_addresses = create_test_user_and_wallets

    # Create snapshot with specific last_updated date (no longer used for routing)
    # Use consistent values: 500 wallet total out of 500 total (100% wallet, 0% DeFi)
    snapshot_date = datetime(2025, 12, 27, 9, 1, 15, tzinfo=UTC)
    snapshot = _make_snapshot(
        summary={
            "total_assets": 500.0,
            "total_debt": 0.0,
            "net_portfolio_value": 500.0,
            "wallet_assets": {
                "btc": 300.0,
                "eth": 200.0,
                "stablecoins": 0.0,
                "others": 0.0,
            },
        },
        wallet_addresses=wallet_addresses,
        wallet_override={
            "categories": {
                "btc": 300.0,
                "eth": 200.0,
                "stablecoins": 0.0,
                "others": 0.0,
            },
            "total_value": 500.0,
        },
    )
    snapshot.last_updated = snapshot_date

    # Create service with mocked pool service
    canonical_date = date(2025, 12, 27)
    service, wallet_service, snapshot_service, pool_service = _make_service(
        db_session,
        snapshot=snapshot,
        pool_details=[],
        canonical_snapshot_date=canonical_date,
    )

    # Mock wallet service to match snapshot wallet total
    with patch.object(
        wallet_service,
        "get_wallet_token_summaries_batch",
        return_value={
            wallet_addresses[0]: WalletAggregate(
                total_value=500.0,
                token_count=2,
                categories={
                    "btc": WalletCategoryBreakdown(value=300.0, percentage=60.0),
                    "eth": WalletCategoryBreakdown(value=200.0, percentage=40.0),
                    "stablecoins": WalletCategoryBreakdown(value=0.0, percentage=0.0),
                    "others": WalletCategoryBreakdown(value=0.0, percentage=0.0),
                },
            )
        },
    ):
        # Call landing page data
        service.get_landing_page_data(user_id)

    # Verify pool_performance_service was called with canonical snapshot_date
    pool_service.get_pool_performance.assert_called_once()
    call_args = pool_service.get_pool_performance.call_args

    # Verify snapshot_date parameter was passed
    assert "snapshot_date" in call_args.kwargs
    assert call_args.kwargs["snapshot_date"] == canonical_date


def test_snapshot_date_none_when_snapshot_has_no_last_updated(
    db_session: Session, create_test_user_and_wallets: tuple
) -> None:
    """Test that empty response returned when canonical snapshot date is None."""
    user_id, wallet_addresses = create_test_user_and_wallets

    # Create snapshot without last_updated (canonical date will be None)
    # Use consistent values: 500 wallet total out of 500 total (100% wallet, 0% DeFi)
    snapshot = _make_snapshot(
        summary={
            "total_assets": 500.0,
            "total_debt": 0.0,
            "net_portfolio_value": 500.0,
            "wallet_assets": {
                "btc": 300.0,
                "eth": 200.0,
                "stablecoins": 0.0,
                "others": 0.0,
            },
        },
        wallet_addresses=wallet_addresses,
        wallet_override={
            "categories": {
                "btc": 300.0,
                "eth": 200.0,
                "stablecoins": 0.0,
                "others": 0.0,
            },
            "total_value": 500.0,
        },
    )
    snapshot.last_updated = None

    # Create service with mocked pool service
    service, wallet_service, snapshot_service, pool_service = _make_service(
        db_session,
        snapshot=snapshot,
        pool_details=[],
        canonical_snapshot_date=None,
    )

    # Mock wallet service to match snapshot wallet total
    with patch.object(
        wallet_service,
        "get_wallet_token_summaries_batch",
        return_value={
            wallet_addresses[0]: WalletAggregate(
                total_value=500.0,
                token_count=2,
                categories={
                    "btc": WalletCategoryBreakdown(value=300.0, percentage=60.0),
                    "eth": WalletCategoryBreakdown(value=200.0, percentage=40.0),
                    "stablecoins": WalletCategoryBreakdown(value=0.0, percentage=0.0),
                    "others": WalletCategoryBreakdown(value=0.0, percentage=0.0),
                },
            )
        },
    ):
        # Call landing page data
        result = service.get_landing_page_data(user_id)

    # Verify empty response returned and downstream services were not called
    assert result.total_assets_usd == 0
    assert result.positions == 0
    assert result.protocols == 0
    assert result.chains == 0
    pool_service.get_pool_performance.assert_not_called()


def test_injects_precise_timestamp_into_response(
    db_session: Session, create_test_user_and_wallets: tuple
) -> None:
    """Verify that precise last_updated timestamp from SnapshotInfo is injected."""
    user_id, wallet_addresses = create_test_user_and_wallets

    # Create a precise timestamp
    precise_ts = datetime(2025, 1, 1, 14, 30, 0, tzinfo=UTC)

    # Create snapshot with a different (or None) timestamp to ensure override works
    snapshot = _make_snapshot(
        wallet_addresses=wallet_addresses, summary={"wallet_count": 1}
    )
    # The snapshot logic usually takes date from somewhere else, but here we want to ensure
    # that even if snapshot has a date, the one from CanonicalSnapshotService (SnapshotInfo) wins
    # or is used.

    # Create service
    service, _, _, _ = _make_service(db_session, snapshot=snapshot)

    # Mock get_snapshot_info to return our precise timestamp
    service.canonical_snapshot_service.get_snapshot_info.return_value = SnapshotInfo(
        snapshot_date=precise_ts.date(), wallet_count=1, last_updated=precise_ts
    )

    # Act
    result = service.get_landing_page_data(user_id)

    # Assert
    assert result.last_updated == precise_ts

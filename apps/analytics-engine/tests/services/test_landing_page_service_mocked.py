"""Mocked unit tests for LandingPageService.

Tests service logic in isolation using unittest.mock, unrelated to DB state.
"""

from datetime import date, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from src.core.exceptions import CrossServiceConsistencyError
from src.models.portfolio import PortfolioResponse
from src.models.portfolio_snapshot import (
    PortfolioSnapshot,
    WalletTrendOverride,
)
from src.services.portfolio.landing_page_service import LandingPageService
from src.services.shared.value_objects import WalletAggregate


@pytest.fixture
def mock_db() -> MagicMock:
    return MagicMock(spec=Session)


@pytest.fixture
def mock_wallet_service() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_query_service() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_snapshot_service() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_pool_service() -> MagicMock:
    return MagicMock()


@pytest.fixture
def landing_page_service(
    mock_db,
    mock_wallet_service,
    mock_query_service,
    mock_snapshot_service,
    mock_pool_service,
) -> LandingPageService:
    roi_calculator = MagicMock()
    canonical_snapshot_service = MagicMock()
    canonical_snapshot_service.get_snapshot_date.return_value = date(2025, 1, 1)
    canonical_snapshot_service.get_snapshot_info.return_value = (
        None  # Return None so isinstance() check fails gracefully
    )
    from src.models.portfolio import BorrowingSummary

    borrowing_service = MagicMock()
    borrowing_service.get_borrowing_summary.return_value = BorrowingSummary(
        has_debt=False,
        worst_health_rate=None,
        overall_status=None,
        critical_count=0,
        warning_count=0,
        healthy_count=0,
    )
    return LandingPageService(
        db=mock_db,
        wallet_service=mock_wallet_service,
        query_service=mock_query_service,
        roi_calculator=roi_calculator,
        portfolio_snapshot_service=mock_snapshot_service,
        pool_performance_service=mock_pool_service,
        canonical_snapshot_service=canonical_snapshot_service,
        borrowing_service=borrowing_service,
    )


class TestLandingPageServiceInitialization:
    """Tests for service initialization validation."""

    def test_init_raises_on_missing_db(self, mock_wallet_service, mock_query_service):
        with pytest.raises(ValueError, match="Database session is required"):
            LandingPageService(
                db=None,  # type: ignore
                wallet_service=mock_wallet_service,
                query_service=mock_query_service,
                roi_calculator=MagicMock(),
                portfolio_snapshot_service=MagicMock(),
                pool_performance_service=MagicMock(),
                canonical_snapshot_service=MagicMock(),
                borrowing_service=MagicMock(),
            )

    def test_init_raises_on_missing_wallet_service(self, mock_db, mock_query_service):
        with pytest.raises(ValueError, match="Wallet service is required"):
            LandingPageService(
                db=mock_db,
                wallet_service=None,  # type: ignore
                query_service=mock_query_service,
                roi_calculator=MagicMock(),
                portfolio_snapshot_service=MagicMock(),
                pool_performance_service=MagicMock(),
                canonical_snapshot_service=MagicMock(),
                borrowing_service=MagicMock(),
            )

    def test_init_raises_on_missing_snapshot_service(
        self, mock_db, mock_wallet_service, mock_query_service
    ):
        with pytest.raises(ValueError, match="Portfolio snapshot service is required"):
            LandingPageService(
                db=mock_db,
                wallet_service=mock_wallet_service,
                query_service=mock_query_service,
                roi_calculator=MagicMock(),
                portfolio_snapshot_service=None,  # type: ignore
                pool_performance_service=MagicMock(),
                canonical_snapshot_service=MagicMock(),
                borrowing_service=MagicMock(),
            )


class TestGetLandingPageData:
    """Tests for get_landing_page_data orchestration."""

    def test_returns_empty_response_when_snapshot_missing(
        self, landing_page_service, mock_snapshot_service
    ):
        """Should return empty response if no snapshot found."""
        mock_snapshot_service.get_portfolio_snapshot.return_value = None
        user_id = uuid4()

        result = landing_page_service.get_landing_page_data(user_id)

        assert isinstance(result, PortfolioResponse)
        assert result.total_assets_usd == 0
        assert result.wallet_count == 0

    def test_returns_populated_response_on_success(
        self,
        landing_page_service,
        mock_snapshot_service,
        mock_wallet_service,
        mock_pool_service,
    ):
        """Should return fully populated response when all services succeed."""
        user_id = uuid4()

        # 1. Setup Snapshot
        mock_snapshot = MagicMock(spec=PortfolioSnapshot)
        mock_snapshot.wallet_addresses = ["0x123", "0x456"]
        mock_snapshot.wallet_override = None
        mock_snapshot.last_updated = (
            datetime.now()
        )  # Required for snapshot_date calculation

        # Create a concrete dict for return value as service expects a dict
        summary_dict = {
            "total_value_usd": 1000.0,
            "total_assets": 1000.0,
            "total_debt": 0.0,
            "net_portfolio_value": 1000.0,
            "wallet_count": 2,
            "wallet_token_count": 3,
            "wallet_assets": {
                "btc": 600.0,
                "eth": 400.0,
                "stablecoins": 0.0,
                "others": 0.0,
            },
        }
        mock_snapshot.to_portfolio_summary.return_value = summary_dict

        mock_snapshot_service.get_portfolio_snapshot.return_value = mock_snapshot

        # 2. Setup Wallet Token Summaries
        mock_wallet_service.get_wallet_token_summaries_batch.return_value = {
            "0x123": WalletAggregate(total_value=600.0, token_count=2),
            "0x456": WalletAggregate(total_value=400.0, token_count=1),
        }

        # 3. Setup Pool Performance (with all required PoolDetail fields)
        mock_pool_service.get_pool_performance.return_value = [
            {
                "wallet": "0x123",
                "snapshot_id": "00000000-0000-0000-0000-000000000001",
                "snapshot_ids": ["00000000-0000-0000-0000-000000000001"],
                "chain": "eth",
                "protocol_id": "aave-v3",
                "protocol": "Aave V3",
                "protocol_name": "Aave V3",
                "pool_symbols": ["USDC"],
                "asset_usd_value": 500.0,
                "contribution_to_portfolio": 50.0,
            }
        ]

        # Execute
        result = landing_page_service.get_landing_page_data(user_id)

        # Verify
        assert isinstance(result, PortfolioResponse)
        # Check explicit logic call flow
        mock_snapshot_service.get_portfolio_snapshot.assert_called_once()
        mock_wallet_service.get_wallet_token_summaries_batch.assert_called_once()
        mock_pool_service.get_pool_performance.assert_called_once()

    def test_validation_error_propagates(
        self, landing_page_service, mock_snapshot_service
    ):
        """Pydantic or business logic errors should be wrapped in ValidationError."""
        mock_snapshot_service.get_portfolio_snapshot.side_effect = ValueError(
            "Invalid data"
        )
        user_id = uuid4()

        with pytest.raises(ValueError, match="Invalid data"):
            landing_page_service.get_landing_page_data(user_id)


class TestFetchWalletSummary:
    """Tests for _fetch_wallet_summary logic."""

    def test_returns_empty_when_no_wallets(self, landing_page_service):
        result = landing_page_service._fetch_wallet_summary(uuid4(), [])
        assert result.total_value == 0
        assert result.token_count == 0

    def test_applies_wallet_override(self, landing_page_service, mock_wallet_service):
        """Should respect wallet_override values over fetched data."""
        wallets = ["0x123"]
        mock_wallet_service.get_wallet_token_summaries_batch.return_value = {
            "0x123": WalletAggregate(total_value=100.0)
        }

        # Override specifies 500 total value
        override = WalletTrendOverride(
            total_value=500.0,
            categories={"btc": 500.0},
        )

        result = landing_page_service._fetch_wallet_summary(
            uuid4(), wallets, wallet_override=override
        )

        assert result.total_value == 500.0
        assert result.categories["btc"].value == 500.0


class TestCrossServiceConsistency:
    """Tests for _validate_cross_service_consistency."""

    def test_passes_within_threshold(self, landing_page_service):
        """Difference < 5% should pass."""
        landing_page_service._validate_cross_service_consistency(
            uuid4(),
            snapshot_total=100.0,
            wallet_total=96.0,  # 4% diff
        )

    def test_raises_outside_threshold(self, landing_page_service):
        """Difference > 5% should raise error."""
        with pytest.raises(CrossServiceConsistencyError):
            landing_page_service._validate_cross_service_consistency(
                uuid4(),
                snapshot_total=100.0,
                wallet_total=90.0,  # 10% diff
            )

    def test_passes_when_both_zero(self, landing_page_service):
        """Both inputs zero is valid state."""
        landing_page_service._validate_cross_service_consistency(
            uuid4(), snapshot_total=0.0, wallet_total=0.0
        )


class TestCacheDisabledEarlyReturn:
    """Cover line 365: cache disabled returns None."""

    def test_get_cached_landing_response_returns_none_when_cache_disabled(
        self, landing_page_service, monkeypatch
    ):
        monkeypatch.setattr(
            "src.services.portfolio.landing_page_service.settings.analytics_cache_enabled",
            False,
        )
        result = landing_page_service._get_cached_landing_response(
            cache_key="test_key",
            user_id=uuid4(),
            start_time=0.0,
        )
        assert result is None

"""
Unit tests for CategoryTrendBaseService conditional routing logic.

Tests the critical wallet filtering bug fix that ensures:
1. Bundle queries (wallet_address=None) use MV for performance (5-15ms)
2. Wallet-specific queries use runtime query for accurate filtering (150-250ms)
3. Adaptive TTL: 12h for bundle, 2h for wallet-specific
"""

from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest

from src.services.analytics.category_trend_base import CategoryTrendBaseService
from src.services.shared.query_names import QUERY_NAMES


@pytest.fixture
def mock_db():
    """Mock database session."""
    return MagicMock()


@pytest.fixture
def mock_query_service():
    """Mock QueryService."""
    return MagicMock()


@pytest.fixture
def category_trend_service(mock_db, mock_query_service):
    """Create CategoryTrendBaseService instance with mocked dependencies."""
    return CategoryTrendBaseService(db=mock_db, query_service=mock_query_service)


class TestConditionalRouting:
    """Test conditional routing between MV and runtime queries."""

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_bundle_query_uses_mv(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify bundle queries (wallet_address=None) use MV for performance."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        # Call with wallet_address=None (bundle request)
        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=None
        )

        # Assert fetch_time_range_query was called with MV query name
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args.kwargs["query_name"] == QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        assert call_args.kwargs["wallet_address"] is None

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_wallet_specific_query_uses_runtime(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify wallet-specific queries use runtime query for accurate filtering."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        wallet_address = "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"

        # Call with wallet_address provided (wallet-specific request)
        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=wallet_address
        )

        # Assert fetch_time_range_query was called with runtime query name
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert (
            call_args.kwargs["query_name"]
            == QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_BY_USER_ID
        )
        assert call_args.kwargs["wallet_address"] == wallet_address


class TestAdaptiveTTL:
    """Test adaptive TTL caching based on query type."""

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_bundle_query_uses_12h_ttl(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify bundle queries use 12h TTL (stable data)."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        # Call without explicit ttl_hours and without wallet_address
        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=None
        )

        # Assert TTL is 12 hours
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args.kwargs["ttl_hours"] == 12

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_wallet_specific_query_uses_2h_ttl(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify wallet-specific queries use 2h TTL (more volatile)."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        wallet_address = "0x2eCBC6f229feD06044CDb0dD772437a30190CD50"

        # Call without explicit ttl_hours but with wallet_address
        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=wallet_address
        )

        # Assert TTL is 2 hours
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args.kwargs["ttl_hours"] == 2

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_explicit_ttl_override_respected(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify explicit ttl_hours parameter overrides adaptive logic."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        # Call with explicit ttl_hours=6 (override)
        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=None, ttl_hours=6
        )

        # Assert explicit TTL is used
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args.kwargs["ttl_hours"] == 6


class TestWalletFilteringConsistency:
    """Test that wallet filtering is consistently applied across queries."""

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_wallet_address_passed_to_query_builder(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify wallet_address is correctly passed to query builder."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        wallet_address = "0xABC123"

        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=wallet_address
        )

        # Assert wallet_address is passed through
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args.kwargs["wallet_address"] == wallet_address

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_none_wallet_address_passed_to_query_builder(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify None wallet_address is correctly passed for bundle queries."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=None
        )

        # Assert None is passed through (not filtered out)
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args.kwargs["wallet_address"] is None


class TestQueryParameters:
    """Test that all query parameters are correctly forwarded."""

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    def test_all_parameters_forwarded(
        self, mock_fetch, category_trend_service, mock_db, mock_query_service
    ):
        """Verify all parameters are correctly forwarded to fetch_time_range_query."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        wallet_address = "0xTEST"
        days = 90
        limit = 100
        db_override = MagicMock()

        category_trend_service._fetch_category_trend_payload(
            user_id=user_id,
            days=days,
            wallet_address=wallet_address,
            limit=limit,
            ttl_hours=6,
            db_override=db_override,
        )

        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args

        # Verify all parameters are present
        assert call_args.kwargs["user_id"] == user_id
        assert call_args.kwargs["days"] == days
        assert call_args.kwargs["wallet_address"] == wallet_address
        assert call_args.kwargs["limit"] == limit
        assert call_args.kwargs["ttl_hours"] == 6
        assert call_args.kwargs["db_override"] == db_override
        assert (
            call_args.kwargs["cache_namespace"]
            == category_trend_service._category_trend_cache_namespace
        )


class TestLogging:
    """Test logging behavior for query routing decisions."""

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    @patch("src.services.analytics.category_trend_base.logger")
    def test_bundle_query_logs_debug(
        self,
        mock_logger,
        mock_fetch,
        category_trend_service,
        mock_db,
        mock_query_service,
    ):
        """Verify bundle queries log at debug level."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=None
        )

        # Assert debug log was called with lazy formatting
        mock_logger.debug.assert_called_once()
        args = mock_logger.debug.call_args[0]
        assert "MV query" in args[0]
        assert user_id in args

    @patch("src.services.analytics.category_trend_base.fetch_time_range_query")
    @patch("src.services.analytics.category_trend_base.logger")
    def test_wallet_specific_query_logs_info(
        self,
        mock_logger,
        mock_fetch,
        category_trend_service,
        mock_db,
        mock_query_service,
    ):
        """Verify wallet-specific queries log at info level for visibility."""
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        wallet_address = "0xWALLET"

        category_trend_service._fetch_category_trend_payload(
            user_id=user_id, days=30, wallet_address=wallet_address
        )

        # Assert info log was called with lazy %s-style formatting
        mock_logger.info.assert_called_once()
        call_args = mock_logger.info.call_args[0]
        log_template = call_args[0]
        assert "runtime query" in log_template
        # With lazy logging, user_id and wallet_address are passed as separate args
        assert user_id in call_args
        assert wallet_address in call_args

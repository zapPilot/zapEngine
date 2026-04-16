"""
Tests for CanonicalSnapshotService.

Validates canonical snapshot date selection, date range calculations,
and snapshot consistency validation logic.
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest

from src.services.portfolio.canonical_snapshot_service import (
    CanonicalSnapshotService,
    SnapshotInfo,
)


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def mock_db():
    """Mock database session."""
    return MagicMock()


@pytest.fixture
def mock_query_service():
    """Mock query service."""
    return MagicMock()


@pytest.fixture
def canonical_service(mock_db, mock_query_service):
    """CanonicalSnapshotService instance with mocked dependencies."""
    return CanonicalSnapshotService(mock_db, mock_query_service)


class TestGetSnapshotDate:
    """Test CanonicalSnapshotService.get_snapshot_date()."""

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_returns_latest_snapshot_date(
        self, mock_cache, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify get_snapshot_date returns the latest available snapshot date."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        expected_date = date(2025, 1, 1)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": expected_date,
            "wallet_count": 3,
            "max_snapshot_at": "2025-01-01T23:59:59Z",
        }

        # Act
        result = canonical_service.get_snapshot_date(user_id)

        # Assert
        assert result == expected_date
        mock_query_service.execute_query_one.assert_called_once()
        call_args = mock_query_service.execute_query_one.call_args
        assert call_args[0][0] == mock_db
        assert call_args[0][1] == "get_canonical_snapshot_date"
        assert call_args[0][2]["user_id"] == str(user_id)
        assert call_args[0][2]["wallet_address"] is None

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_filters_by_wallet_address(
        self, mock_cache, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify wallet_address parameter filters results correctly."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        wallet_address = "0x1234567890abcdef"
        expected_date = date(2025, 1, 2)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": expected_date,
            "wallet_count": 1,
            "max_snapshot_at": "2025-01-02T23:59:59Z",
        }

        # Act
        result = canonical_service.get_snapshot_date(user_id, wallet_address)

        # Assert
        assert result == expected_date
        call_args = mock_query_service.execute_query_one.call_args
        assert call_args[0][2]["wallet_address"] == wallet_address

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_returns_none_when_no_data(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify graceful handling when no snapshot data exists."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query_one.return_value = None

        # Act
        result = canonical_service.get_snapshot_date(user_id)

        # Assert
        assert result is None

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_returns_none_when_snapshot_date_missing_in_result(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify error handling when query returns result without snapshot_date."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query_one.return_value = {
            "wallet_count": 3,
            "max_snapshot_at": "2025-01-01T23:59:59Z",
        }

        # Act
        result = canonical_service.get_snapshot_date(user_id)

        # Assert
        assert result is None

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_uses_cache_when_available(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify cache is checked first and query is skipped on cache hit."""
        # Arrange
        cached_date = date(2025, 1, 3)
        mock_cache.get.return_value = SnapshotInfo(
            snapshot_date=cached_date, wallet_count=1, last_updated=None
        )

        # Act
        result = canonical_service.get_snapshot_date(user_id)

        # Assert
        assert result == cached_date
        mock_query_service.execute_query_one.assert_not_called()

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_caches_result_after_query(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify query result is cached with correct TTL."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        snapshot_date = date(2025, 1, 4)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": snapshot_date,
            "wallet_count": 2,
        }

        # Act
        canonical_service.get_snapshot_date(user_id)

        # Assert
        # Assert
        mock_cache.set.assert_called_once()
        call_args = mock_cache.set.call_args
        cached_value = call_args[0][1]
        assert isinstance(cached_value, SnapshotInfo)
        assert cached_value.snapshot_date == snapshot_date
        assert cached_value.wallet_count == 2
        assert call_args.kwargs["ttl"] == timedelta(hours=5 / 60)  # 5 minutes

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_caches_none_when_no_data(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify None is cached to avoid repeated queries for non-existent data."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query_one.return_value = None

        # Act
        canonical_service.get_snapshot_date(user_id)

        # Assert
        mock_cache.set.assert_called_once()
        call_args = mock_cache.set.call_args
        assert call_args[0][1] is None

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_cache_key_includes_wallet_address(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify cache key differentiates bundle vs wallet-specific queries."""
        # Arrange
        mock_cache.get.return_value = None
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": date(2025, 1, 1),
            "wallet_count": 1,
        }

        # Act - bundle query
        canonical_service.get_snapshot_date(user_id, wallet_address=None)
        bundle_cache_key = mock_cache.build_key.call_args[0]

        # Reset mock
        mock_cache.reset_mock()

        # Act - wallet-specific query
        wallet = "0xabc"
        canonical_service.get_snapshot_date(user_id, wallet_address=wallet)
        wallet_cache_key = mock_cache.build_key.call_args[0]

        # Assert - cache keys should differ
        assert bundle_cache_key != wallet_cache_key
        assert bundle_cache_key[0] == "canonical_snapshot_info"


class TestGetSnapshotDateRange:
    """Test CanonicalSnapshotService.get_snapshot_date_range()."""

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_calculates_date_range_correctly(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify date range calculation: (end - days, end + 1 day)."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        latest_date = date(2025, 1, 10)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": latest_date
        }

        # Act
        start_date, end_date = canonical_service.get_snapshot_date_range(
            user_id, days=30
        )

        # Assert
        # end_date should be latest_date + 1 day (exclusive upper bound)
        assert end_date == latest_date + timedelta(days=1)
        # start_date should be end_date - 30 days
        assert start_date == end_date - timedelta(days=30)
        assert (end_date - start_date).days == 30

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_raises_error_when_no_snapshot_data(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify ValueError is raised when no snapshot data exists."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query_one.return_value = None

        # Act & Assert
        with pytest.raises(ValueError, match="No snapshot data exists"):
            canonical_service.get_snapshot_date_range(user_id, days=30)

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_passes_wallet_address_to_get_snapshot_date(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify wallet_address parameter is passed to underlying get_snapshot_date call."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        wallet = "0xdef456"
        latest_date = date(2025, 1, 15)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": latest_date
        }

        # Act
        canonical_service.get_snapshot_date_range(
            user_id, days=7, wallet_address=wallet
        )

        # Assert
        call_args = mock_query_service.execute_query_one.call_args
        assert call_args[0][2]["wallet_address"] == wallet

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_handles_various_day_ranges(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify correct calculation for different day ranges."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        latest_date = date(2025, 1, 20)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": latest_date
        }

        # Test cases: (days, expected_start_offset)
        test_cases = [
            (7, 7),
            (30, 30),
            (90, 90),
            (365, 365),
        ]

        for days, expected_offset in test_cases:
            # Act
            start_date, end_date = canonical_service.get_snapshot_date_range(
                user_id, days=days
            )

            # Assert
            assert end_date == latest_date + timedelta(days=1)
            assert (end_date - start_date).days == expected_offset


class TestValidateSnapshotConsistency:
    """Test CanonicalSnapshotService.validate_snapshot_consistency()."""

    def test_validates_complete_snapshot(
        self, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify validation passes when snapshot meets expected wallet count."""
        # Arrange
        snapshot_date = date(2025, 1, 5)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": snapshot_date,
            "wallet_count": 3,
        }

        # Act
        result = canonical_service.validate_snapshot_consistency(
            user_id, snapshot_date, expected_wallet_count=3
        )

        # Assert
        assert result["is_complete"] is True
        assert result["wallet_count"] == 3

    def test_detects_wallet_count_mismatch(
        self, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify validation fails when wallet count doesn't match expected."""
        # Arrange
        snapshot_date = date(2025, 1, 6)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": snapshot_date,
            "wallet_count": 2,
        }

        # Act
        result = canonical_service.validate_snapshot_consistency(
            user_id, snapshot_date, expected_wallet_count=3
        )

        # Assert
        assert result["is_complete"] is False
        assert result["wallet_count"] == 2

    def test_passes_when_no_expected_count_provided(
        self, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify validation passes when expected_wallet_count is None."""
        # Arrange
        snapshot_date = date(2025, 1, 7)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": snapshot_date,
            "wallet_count": 5,
        }

        # Act
        result = canonical_service.validate_snapshot_consistency(
            user_id, snapshot_date, expected_wallet_count=None
        )

        # Assert
        assert result["is_complete"] is True
        assert result["wallet_count"] == 5

    def test_detects_snapshot_date_mismatch(
        self, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify validation fails when snapshot_date doesn't match canonical date."""
        # Arrange
        requested_date = date(2025, 1, 8)
        actual_canonical_date = date(2025, 1, 9)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": actual_canonical_date,
            "wallet_count": 3,
        }

        # Act
        result = canonical_service.validate_snapshot_consistency(
            user_id, requested_date
        )

        # Assert
        assert result["is_complete"] is False
        assert "error" in result
        assert "does not match canonical snapshot" in result["error"]

    def test_handles_no_snapshot_data(
        self, canonical_service, mock_query_service, mock_db, user_id
    ):
        """Verify validation fails gracefully when no snapshot data exists."""
        # Arrange
        snapshot_date = date(2025, 1, 10)
        mock_query_service.execute_query_one.return_value = None

        # Act
        result = canonical_service.validate_snapshot_consistency(user_id, snapshot_date)

        # Assert
        assert result["is_complete"] is False
        assert result["wallet_count"] == 0
        assert "error" in result


class TestCachingBehavior:
    """Test caching behavior across CanonicalSnapshotService methods."""

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_cache_ttl_is_5_minutes(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify cache TTL is 5 minutes for recency."""
        # Arrange
        mock_cache.get.return_value = None  # Cache miss
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": date(2025, 1, 11)
        }

        # Act
        canonical_service.get_snapshot_date(user_id)

        # Assert
        call_args = mock_cache.set.call_args
        assert call_args.kwargs["ttl"] == timedelta(hours=5 / 60)  # 5 minutes in hours

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_cache_key_format(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify cache key follows expected format."""
        # Arrange
        mock_cache.get.return_value = None
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": date(2025, 1, 1),
            "wallet_count": 1,
        }

        # Act
        canonical_service.get_snapshot_date(user_id, wallet_address=None)

        # Assert
        mock_cache.build_key.assert_called_once()
        call_args = mock_cache.build_key.call_args[0]
        assert call_args[0] == "canonical_snapshot_info"
        assert call_args[1] == str(user_id)
        assert call_args[2] == "bundle"  # wallet_address=None → "bundle"


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_handles_zero_wallet_count(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify handling of zero wallet count in validation."""
        # Arrange
        snapshot_date = date(2025, 1, 12)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": snapshot_date,
            "wallet_count": 0,
        }

        # Act
        result = canonical_service.validate_snapshot_consistency(
            user_id, snapshot_date, expected_wallet_count=0
        )

        # Assert
        assert result["is_complete"] is True
        assert result["wallet_count"] == 0

    @patch("src.services.portfolio.canonical_snapshot_service.analytics_cache")
    def test_handles_single_day_range(
        self, mock_cache, canonical_service, mock_query_service, user_id
    ):
        """Verify date range calculation for single day (days=1)."""
        # Arrange
        mock_cache.get.return_value = None
        latest_date = date(2025, 1, 13)
        mock_query_service.execute_query_one.return_value = {
            "snapshot_date": latest_date
        }

        # Act
        start_date, end_date = canonical_service.get_snapshot_date_range(
            user_id, days=1
        )

        # Assert
        assert (end_date - start_date).days == 1
        assert end_date == latest_date + timedelta(days=1)

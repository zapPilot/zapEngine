"""
Unit tests for snapshot_date/anchor_date scoping in TrendAnalysisService.

Regression tests for the bug where assigning to anchor_date inside
compute() caused UnboundLocalError due to Python closure scoping rules.
"""

from datetime import UTC, datetime, timedelta

import pytest

from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.shared.query_service import QueryService


@pytest.fixture
def mock_query_service():
    """Provides a mock QueryService."""
    return QueryService()


class TestSnapshotDateScoping:
    """Tests for the snapshot_date/anchor_date scoping fix.

    Regression tests for the bug where local variable assignment inside
    compute() shadowed the outer anchor_date variable, causing UnboundLocalError.
    """

    def test_snapshot_date_provided_as_datetime(self, mocker):
        """Verify snapshot_date works when provided as datetime.

        This test ensures the scoping fix works - the outer anchor_date
        should be accessible inside compute() for filtering.
        """
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)
        snapshot_datetime = datetime.combine(yesterday, datetime.min.time(), tzinfo=UTC)

        mock_rows = [
            {
                "date": yesterday,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            }
        ]

        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        # This should NOT raise UnboundLocalError
        result = service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            snapshot_date=snapshot_datetime,
        )

        assert result is not None
        assert result.snapshot_date == yesterday

    def test_snapshot_date_provided_as_date(self, mocker):
        """Verify snapshot_date works when provided as date object."""
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)

        mock_rows = [
            {
                "date": yesterday,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            }
        ]

        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        # This should NOT raise UnboundLocalError
        result = service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            snapshot_date=yesterday,  # Pass as date object
        )

        assert result is not None
        assert result.snapshot_date == yesterday

    def test_snapshot_date_none_uses_latest_aggregate(self, mocker):
        """Verify snapshot_date defaults to latest aggregate date when None."""
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)

        mock_rows = [
            {
                "date": two_days_ago,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            },
            {
                "date": yesterday,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 150.0,
                "pnl_usd": 10.0,
                "total_value_usd": 150.0,
            },
        ]

        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        # Without snapshot_date, should use latest aggregate date
        result = service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            snapshot_date=None,
        )

        assert result is not None
        # snapshot_date should be set to the latest aggregate date
        assert result.snapshot_date == yesterday

    def test_snapshot_date_filters_aggregates_correctly(self, mocker):
        """Verify snapshot_date correctly filters out future data."""
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)
        three_days_ago = today - timedelta(days=3)

        # Return data including dates after the snapshot
        mock_rows = [
            {
                "date": three_days_ago,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            },
            {
                "date": two_days_ago,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 120.0,
                "pnl_usd": 20.0,
                "total_value_usd": 120.0,
            },
            {
                "date": yesterday,  # This should be filtered out
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 150.0,
                "pnl_usd": 30.0,
                "total_value_usd": 150.0,
            },
        ]

        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        # Request with snapshot_date=two_days_ago should filter out yesterday
        result = service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            snapshot_date=two_days_ago,
        )

        assert result is not None
        assert result.snapshot_date == two_days_ago
        # Latest value should be from two_days_ago, not yesterday
        assert result.summary["latest_value"] == 120.0

    def test_empty_aggregates_with_snapshot_date(self, mocker):
        """Verify empty result handling when snapshot_date is provided."""
        yesterday = datetime.now(UTC).date() - timedelta(days=1)

        mocker.patch.object(QueryService, "execute_query", return_value=[])

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        # Should not raise error even with empty results
        result = service.get_portfolio_trend(
            user_id=user_id,
            days=30,
            snapshot_date=yesterday,
        )

        assert result is not None
        assert result.daily_values == []
        assert result.summary["data_points"] == 0
        assert result.snapshot_date == yesterday  # Should use provided value


class TestAnchorDateInnerScopeRegression:
    """Specific regression tests for the anchor_date scoping bug.

    The original bug occurred because:
    1. anchor_date was declared in outer scope (line 122-132)
    2. Inside compute(), we tried to check `if anchor_date is not None` (line 202)
    3. Later in compute(), we assigned `anchor_date = aggregates[-1].date` (line 214)
    4. Python's closure rules treated ALL references to anchor_date as local,
       causing UnboundLocalError on line 202

    The fix introduced snapshot_anchor as a local variable to avoid shadowing.
    """

    def test_anchor_date_check_before_assignment_does_not_raise(self, mocker):
        """Verify the if-check on anchor_date works before any assignment.

        This directly tests the regression where the check on line 202
        would fail because Python saw the later assignment on line 214.
        """
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)

        mock_rows = [
            {
                "date": yesterday,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            }
        ]

        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        # This was the exact call path that caused the original bug
        # When snapshot_date is provided, anchor_date gets set in outer scope
        # Then compute() checks it and may conditionally use it
        try:
            result = service.get_portfolio_trend(
                user_id=user_id,
                days=30,
                snapshot_date=yesterday,
            )
            assert result is not None
        except UnboundLocalError as e:
            pytest.fail(f"UnboundLocalError should not occur: {e}")

    def test_anchor_date_none_path_also_works(self, mocker):
        """Verify the None anchor_date path works correctly.

        When snapshot_date is None, anchor_date is None in outer scope,
        and the inner compute() should derive it from aggregates.
        """
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)

        mock_rows = [
            {
                "date": yesterday,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            }
        ]

        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "12345678-1234-5678-1234-567812345678"

        try:
            result = service.get_portfolio_trend(
                user_id=user_id,
                days=30,
                snapshot_date=None,  # This path should derive from aggregates
            )
            assert result is not None
            assert result.snapshot_date == yesterday  # Derived from the last aggregate
        except UnboundLocalError as e:
            pytest.fail(f"UnboundLocalError should not occur: {e}")

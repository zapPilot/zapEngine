"""
Unit tests for the time_range_fetcher module.

Tests the fetch_time_range_query function, specifically verifying
that end_date parameter scoping is handled correctly in closures.
"""

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import pytest

from src.services.query_builders.time_range_fetcher import (
    TimeRangeQueryPayload,
    fetch_time_range_query,
)


class MockAnalyticsService:
    """Mock service implementing SupportsAnalyticsQueries protocol."""

    def __init__(self, mock_rows: list[dict[str, Any]] | None = None):
        self.mock_rows = mock_rows or []
        self.date_range_calls: list[dict] = []
        self.execute_query_calls: list[dict] = []

    def uuid_to_str(self, user_id: UUID | str) -> str:
        return str(user_id)

    def _date_range_with_period(
        self, days: int, end_date: datetime | None = None
    ) -> tuple[datetime, datetime, dict[str, Any]]:
        """Track calls and return date range."""
        self.date_range_calls.append({"days": days, "end_date": end_date})

        if end_date is None:
            end_date = datetime.now(UTC)
        start_date = end_date - timedelta(days=days)
        period_info = {"days": days, "start": start_date, "end": end_date}
        return start_date, end_date, period_info

    def _execute_query(
        self,
        query_name: str,
        params: dict[str, Any] | None = None,
        *,
        db: Any = None,
    ) -> list[dict[str, Any]]:
        """Track calls and return mock rows."""
        self.execute_query_calls.append(
            {"query_name": query_name, "params": params, "db": db}
        )
        return self.mock_rows

    def _with_cache(
        self,
        cache_key: str,
        fetcher,
        ttl_hours: int | None = None,
    ) -> TimeRangeQueryPayload:
        """Bypass cache and directly call fetcher."""
        return fetcher()


class TestFetchTimeRangeQueryEndDateScoping:
    """Tests for the end_date parameter scoping fix.

    Regression tests for the bug where local variable assignment inside
    compute() shadowed the outer end_date parameter, causing UnboundLocalError.
    """

    def test_end_date_parameter_passed_correctly_when_provided(self):
        """Verify end_date is passed to _date_range_with_period when provided.

        This test ensures the scoping fix works - the outer end_date parameter
        should be accessible inside the compute() closure.
        """
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        custom_end_date = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        _result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            end_date=custom_end_date,
        )

        # Verify _date_range_with_period was called with the custom end_date
        assert len(service.date_range_calls) == 1
        assert service.date_range_calls[0]["end_date"] == custom_end_date
        assert service.date_range_calls[0]["days"] == 30

    def test_end_date_parameter_none_when_not_provided(self):
        """Verify end_date defaults to None when not provided."""
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        _result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            # end_date not provided
        )

        # Verify _date_range_with_period was called with None
        assert len(service.date_range_calls) == 1
        assert service.date_range_calls[0]["end_date"] is None

    def test_computed_dates_returned_in_payload(self):
        """Verify computed dates are correctly returned in the payload."""
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        custom_end_date = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            end_date=custom_end_date,
        )

        # Verify the payload contains correct dates
        expected_start = custom_end_date - timedelta(days=30)
        assert result.start_date == expected_start
        assert result.end_date == custom_end_date
        assert result.period_info["days"] == 30

    def test_wallet_address_filtering(self):
        """Verify wallet_address is passed to query params."""
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")
        wallet = "0x1234567890abcdef1234567890abcdef12345678"

        _result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            wallet_address=wallet,
        )

        # Verify wallet_address was passed to execute_query
        assert len(service.execute_query_calls) == 1
        assert service.execute_query_calls[0]["params"]["wallet_address"] == wallet

    def test_limit_passed_to_query(self):
        """Verify limit parameter is passed when provided."""
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        _result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            limit=100,
        )

        # Verify limit was passed to execute_query
        assert len(service.execute_query_calls) == 1
        assert service.execute_query_calls[0]["params"]["limit"] == 100

    def test_include_end_date_false_excludes_from_params(self):
        """Verify end_date is excluded from params when include_end_date=False."""
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        _result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            include_end_date=False,
        )

        # Verify end_date was NOT in query params
        assert len(service.execute_query_calls) == 1
        assert "end_date" not in service.execute_query_calls[0]["params"]

    def test_include_end_date_true_includes_in_params(self):
        """Verify end_date is included in params when include_end_date=True (default)."""
        service = MockAnalyticsService()
        user_id = UUID("12345678-1234-5678-1234-567812345678")

        _result = fetch_time_range_query(
            service,
            cache_namespace="test",
            query_name="test_query",
            user_id=user_id,
            days=30,
            include_end_date=True,
        )

        # Verify end_date was in query params
        assert len(service.execute_query_calls) == 1
        assert "end_date" in service.execute_query_calls[0]["params"]


class TestTimeRangeQueryPayload:
    """Tests for the TimeRangeQueryPayload dataclass."""

    def test_payload_is_frozen(self):
        """Verify payload is immutable."""
        payload = TimeRangeQueryPayload(
            rows=[{"a": 1}],
            period_info={"days": 30},
            start_date=datetime.now(UTC),
            end_date=datetime.now(UTC),
        )

        with pytest.raises(FrozenInstanceError):
            payload.rows = []

    def test_payload_contains_all_fields(self):
        """Verify payload contains all expected fields."""
        now = datetime.now(UTC)
        rows = [{"test": "data"}]
        period = {"days": 7}

        payload = TimeRangeQueryPayload(
            rows=rows,
            period_info=period,
            start_date=now - timedelta(days=7),
            end_date=now,
        )

        assert payload.rows == rows
        assert payload.period_info == period
        assert payload.start_date == now - timedelta(days=7)
        assert payload.end_date == now

"""
Tests for cache efficiency logging in TrendAnalysisService.

Verifies that cache efficiency metrics are logged correctly for monitoring
performance and cache hit rates across different request patterns.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.shared.query_service import QueryService


def _build_mock_rows(num_days: int = 365):
    """Build mock row data with proper date objects.

    Returns mock rows matching production SQLAlchemy output format
    where dates are date objects, not ISO strings.
    """
    today = datetime.now(UTC).date()
    return [
        {
            "date": today - timedelta(days=i),  # date object, not .isoformat()
            "chain": "ethereum",
            "source_type": "defi",
            "category": "btc",
            "category_value_usd": 100.0 + i,
            "pnl_usd": 1.0,
            "total_value_usd": 100.0 + i,
        }
        for i in range(num_days, 0, -1)
    ]


class TestCacheEfficiencyLogging:
    """Tests for cache efficiency logging in TrendAnalysisService."""

    def test_log_emitted_on_successful_request(self, mocker, caplog):
        """Cache stats log should be emitted at INFO level."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=30)

        # Verify log was emitted
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0, "Cache stats log should be emitted"
        assert log_records[0].levelname == "INFO"

    def test_log_contains_required_fields(self, mocker, caplog):
        """Log should contain all required monitoring fields."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=30)

        # Find the cache stats log record
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        # Verify all required fields are present
        extra_fields = log_records[0].__dict__

        assert "user_id" in extra_fields
        assert "requested_days" in extra_fields
        assert "cached_days" in extra_fields
        assert "data_points" in extra_fields
        assert "cache_efficiency_ratio" in extra_fields
        assert "elapsed_ms" in extra_fields
        assert "likely_cache_hit" in extra_fields
        assert "cache_overfetch_factor" in extra_fields

    def test_cache_efficiency_ratio_calculation(self, mocker, caplog):
        """Cache efficiency ratio should be MAX_CACHE_DAYS / requested_days."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=30)

        # Find the cache stats log record
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        # MAX_CACHE_DAYS = 365, requested_days = 30
        # cache_efficiency_ratio = 365 / 30 = 12.17 (rounded to 2 decimals)
        assert extra_fields["cache_efficiency_ratio"] == pytest.approx(12.17, abs=0.01)
        assert extra_fields["requested_days"] == 30
        assert extra_fields["cached_days"] == 365

    def test_likely_cache_hit_detection_fast_response(self, mocker, caplog):
        """Fast responses (<50ms) should be marked as likely cache hits."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        # Mock datetime.now to simulate fast response (10ms)
        # datetime.now() is called 2 times: start_time, elapsed_ms
        start_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)
        end_time = start_time + timedelta(milliseconds=10)

        with patch(
            "src.services.analytics.trend_analysis_service.datetime"
        ) as mock_datetime:
            mock_datetime.now.side_effect = [start_time, end_time]
            mock_datetime.UTC = UTC

            service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

            service.get_portfolio_trend(user_id="test-user", days=30)

        # Find the cache stats log record
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        # Fast response (<50ms) should be marked as likely cache hit
        assert extra_fields["likely_cache_hit"] is True
        assert extra_fields["elapsed_ms"] == pytest.approx(10.0, abs=0.1)

    def test_likely_cache_hit_detection_slow_response(self, mocker, caplog):
        """Slow responses (>50ms) should be marked as likely cache misses."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        # Mock datetime.now to simulate slow response (200ms)
        # datetime.now() is called 2 times: start_time, elapsed_ms
        start_time = datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)
        end_time = start_time + timedelta(milliseconds=200)

        with patch(
            "src.services.analytics.trend_analysis_service.datetime"
        ) as mock_datetime:
            mock_datetime.now.side_effect = [start_time, end_time]
            mock_datetime.UTC = UTC

            service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

            service.get_portfolio_trend(user_id="test-user", days=30)

        # Find the cache stats log record
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        # Slow response (>50ms) should be marked as likely cache miss
        assert extra_fields["likely_cache_hit"] is False
        assert extra_fields["elapsed_ms"] == pytest.approx(200.0, abs=0.1)

    def test_log_field_types_and_rounding(self, mocker, caplog):
        """Numeric fields should be properly rounded for readability."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=30)

        # Find the cache stats log record
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        # Verify types
        assert isinstance(extra_fields["user_id"], str)
        assert isinstance(extra_fields["requested_days"], int)
        assert isinstance(extra_fields["cached_days"], int)
        assert isinstance(extra_fields["data_points"], int)
        assert isinstance(extra_fields["cache_efficiency_ratio"], float)
        assert isinstance(extra_fields["elapsed_ms"], float)
        assert isinstance(extra_fields["likely_cache_hit"], bool)
        assert isinstance(extra_fields["cache_overfetch_factor"], float)

        # Verify rounding (cache_efficiency_ratio: 2 decimals)
        ratio_str = str(extra_fields["cache_efficiency_ratio"])
        decimal_places = len(ratio_str.split(".")[-1]) if "." in ratio_str else 0
        assert decimal_places <= 2, "cache_efficiency_ratio should round to 2 decimals"

        # Verify rounding (cache_overfetch_factor: 1 decimal)
        overfetch_str = str(extra_fields["cache_overfetch_factor"])
        decimal_places = (
            len(overfetch_str.split(".")[-1]) if "." in overfetch_str else 0
        )
        assert decimal_places <= 1, "cache_overfetch_factor should round to 1 decimal"


class TestCacheEfficiencyLoggingEdgeCases:
    """Edge cases for cache efficiency logging."""

    def test_log_with_empty_result(self, mocker, caplog):
        """Cache stats should be logged even for empty results."""
        import logging

        caplog.set_level(logging.INFO)

        mocker.patch.object(QueryService, "execute_query", return_value=[])

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=30)

        # Verify log was emitted even with no data
        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        assert extra_fields["data_points"] == 0
        assert extra_fields["requested_days"] == 30

    def test_cache_overfetch_factor_calculation(self, mocker, caplog):
        """Cache overfetch factor should equal cache_efficiency_ratio."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=30)

        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        # Both should be 365/30 = 12.17 and 12.2 respectively (different rounding)
        assert extra_fields["cache_efficiency_ratio"] == pytest.approx(12.17, abs=0.01)
        assert extra_fields["cache_overfetch_factor"] == pytest.approx(12.2, abs=0.1)

    def test_log_with_max_cache_days_request(self, mocker, caplog):
        """Cache stats for MAX_CACHE_DAYS request (no overfetch)."""
        import logging

        caplog.set_level(logging.INFO)

        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        service.get_portfolio_trend(user_id="test-user", days=365)

        log_records = [r for r in caplog.records if "trend_cache_stats" in r.message]
        assert len(log_records) > 0

        extra_fields = log_records[0].__dict__

        # When days == MAX_CACHE_DAYS, efficiency ratio = 1.0 (no overfetch)
        assert extra_fields["cache_efficiency_ratio"] == 1.0
        assert extra_fields["cache_overfetch_factor"] == 1.0
        assert extra_fields["requested_days"] == 365

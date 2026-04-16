"""
Tests for input validation and error handling in TrendAnalysisService.

Covers parameter validation, missing/malformed data handling, and
configuration validation error messages.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.shared.query_service import QueryService


def _build_mock_rows(num_days: int = 365):
    """Build mock row data with proper date objects."""
    today = datetime.now(UTC).date()
    return [
        {
            "date": today - timedelta(days=i),
            "chain": "ethereum",
            "source_type": "defi",
            "category": "btc",
            "category_value_usd": 100.0 + i,
            "pnl_usd": 1.0,
            "total_value_usd": 100.0 + i,
        }
        for i in range(num_days, 0, -1)
    ]


class TestInputParameterValidation:
    """Tests for API parameter validation."""

    def test_negative_days_parameter_rejected(self, mocker):
        """Negative days should be rejected by Pydantic validation."""
        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        # Pydantic PeriodInfo model enforces days >= 1
        # Negative days are rejected at validation layer
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            service.get_portfolio_trend(user_id="test-user", days=-30)

        assert "days" in str(exc_info.value)
        assert "greater_than_equal" in str(exc_info.value)

    def test_days_equals_zero_rejected(self, mocker):
        """Zero days should be rejected by Pydantic validation."""
        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        # Pydantic PeriodInfo model enforces days >= 1
        # Zero days are rejected at validation layer
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            service.get_portfolio_trend(user_id="test-user", days=0)

        assert "days" in str(exc_info.value)
        assert "greater_than_equal" in str(exc_info.value)

    def test_days_greater_than_max_cache_days_accepted(self, mocker):
        """Days > MAX_CACHE_DAYS should work (fetch full range without filtering)."""
        mock_rows = _build_mock_rows(365)
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        # Request 400 days (> MAX_CACHE_DAYS of 365)
        result = service.get_portfolio_trend(user_id="test-user", days=400)

        # Should return full 365-day dataset (no filtering since days > MAX_CACHE_DAYS)
        assert result.data_points == 365
        assert result.period_days == 400

    def test_invalid_user_id_format_passes_through(self, mocker):
        """Non-UUID user_id should pass through service (validation at API layer)."""
        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        # Service doesn't validate UUID format; API layer handles this
        result = service.get_portfolio_trend(user_id="not-a-uuid", days=30)

        # Should process successfully
        assert result.user_id == "not-a-uuid"


class TestMissingOrMalformedData:
    """Tests for handling bad data from database."""

    def test_rows_missing_date_field_skipped(self, mocker):
        """Rows without 'date' field should be skipped, not crash."""
        mock_rows = [
            {
                "category": "btc",
                "category_value_usd": 100,
                "total_value_usd": 100,
            },  # Missing 'date'
            {
                "date": datetime.now(UTC).date(),
                "category": "eth",
                "category_value_usd": 200,
                "total_value_usd": 200,
            },  # Valid
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should skip row without date, process valid row
        assert result.data_points == 1

    def test_rows_with_null_dates_skipped(self, mocker):
        """Rows with null dates should be skipped."""
        mock_rows = [
            {
                "date": None,
                "category": "btc",
                "category_value_usd": 100,
                "total_value_usd": 100,
            },  # Null date
            {
                "date": datetime.now(UTC).date(),
                "category": "eth",
                "category_value_usd": 200,
                "total_value_usd": 200,
            },  # Valid
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should skip null date, process valid row
        assert result.data_points == 1

    def test_rows_with_invalid_date_format_rejected(self, mocker):
        """Rows with unparseable dates should raise helpful error."""
        mock_rows = [
            {
                "date": "invalid-date",
                "category": "btc",
                "category_value_usd": 100,
                "total_value_usd": 100,
            },  # Invalid
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        from src.core.exceptions import DataIntegrityError

        # Should raise DataIntegrityError (mapped from ValueError during aggregation)
        with pytest.raises(DataIntegrityError) as exc_info:
            service.get_portfolio_trend(user_id="test-user", days=30)

        assert "Invalid date string: invalid-date" in str(exc_info.value)

    def test_missing_category_value_defaults_to_zero(self, mocker):
        """Missing category_value_usd should default to 0.0."""
        today = datetime.now(UTC).date()
        mock_rows = [
            {
                "date": today,
                "category": "btc",
                # Missing 'category_value_usd'
                "total_value_usd": 100.0,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should default missing category_value_usd to 0.0
        assert result.data_points == 1
        assert result.daily_values[0].categories[0]["value_usd"] == 0.0

    def test_conflicting_total_value_usd_uses_last(self, mocker):
        """Multiple rows same date with different totals should use last (overwrite behavior)."""
        today = datetime.now(UTC).date()
        mock_rows = [
            {
                "date": today,
                "category": "btc",
                "category_value_usd": 100.0,
                "total_value_usd": 500.0,  # First total (overwritten)
            },
            {
                "date": today,
                "category": "eth",
                "category_value_usd": 200.0,
                "total_value_usd": 700.0,  # Last total (used)
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # CategoryDailyAggregate.add_row() overwrites total_value_usd on each row
        # So the LAST row's total is used (700.0), not the first
        assert result.data_points == 1
        assert result.daily_values[0].total_value_usd == 700.0


class TestConfigurationValidationMessages:
    """Enhanced tests for configuration validation error messages."""

    def test_error_message_includes_actual_value(self):
        """Error should show what value was provided."""
        with patch.object(TrendAnalysisService, "MAX_CACHE_DAYS", 29):
            with pytest.raises(ValueError) as exc_info:
                TrendAnalysisService(db=MagicMock(), query_service=QueryService())

            # Should include "got 29" in error message
            assert "got 29" in str(exc_info.value)

    def test_error_message_includes_expected_range(self):
        """Error should show valid range."""
        with patch.object(TrendAnalysisService, "MAX_CACHE_DAYS", 29):
            with pytest.raises(ValueError) as exc_info:
                TrendAnalysisService(db=MagicMock(), query_service=QueryService())

            # Should include "must be between 30 and 365" in error
            assert "must be between 30 and 365" in str(exc_info.value)

    def test_error_message_references_documentation(self):
        """Error should point to class docstring for details."""
        with patch.object(TrendAnalysisService, "MAX_CACHE_DAYS", 366):
            with pytest.raises(ValueError) as exc_info:
                TrendAnalysisService(db=MagicMock(), query_service=QueryService())

            # Should reference docstring
            assert "See class docstring" in str(exc_info.value)

    def test_error_message_mentions_cache_key_impact(self):
        """Error should explain cache key invalidation impact."""
        with patch.object(TrendAnalysisService, "MAX_CACHE_DAYS", 29):
            with pytest.raises(ValueError) as exc_info:
                TrendAnalysisService(db=MagicMock(), query_service=QueryService())

            # Should explain cache impact
            assert "cache key construction" in str(exc_info.value)
            assert "invalidates all cached data" in str(exc_info.value)


class TestMalformedDataEdgeCases:
    """Additional edge cases for malformed data handling."""

    def test_rows_with_mixed_valid_invalid_dates(self, mocker):
        """Mixed valid and invalid dates should process valid ones."""
        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)

        mock_rows = [
            {
                "date": today,
                "category": "btc",
                "category_value_usd": 100.0,
                "total_value_usd": 100.0,
            },  # Valid
            {
                "date": None,
                "category": "eth",
                "category_value_usd": 200.0,
                "total_value_usd": 200.0,
            },  # Invalid
            {
                "date": yesterday,
                "category": "stablecoins",
                "category_value_usd": 300.0,
                "total_value_usd": 300.0,
            },  # Valid
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should process 2 valid dates, skip 1 invalid
        assert result.data_points == 2

    def test_all_rows_have_null_dates(self, mocker):
        """All rows with null dates should return empty result."""
        mock_rows = [
            {
                "date": None,
                "category": "btc",
                "category_value_usd": 100.0,
                "total_value_usd": 100.0,
            },
            {
                "date": None,
                "category": "eth",
                "category_value_usd": 200.0,
                "total_value_usd": 200.0,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should return empty result
        assert result.data_points == 0
        assert len(result.daily_values) == 0
        assert result.message == "No trend data available"

    def test_rows_with_missing_required_fields(self, mocker):
        """Rows missing required fields should be handled gracefully."""
        today = datetime.now(UTC).date()
        mock_rows = [
            {
                "date": today,
                "total_value_usd": 0.0,
                # Missing 'category', 'category_value_usd', etc.
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should process with default values for missing fields
        assert result.data_points == 1

    def test_rows_with_extreme_values(self, mocker):
        """Rows with extreme numerical values should be processed."""
        today = datetime.now(UTC).date()
        mock_rows = [
            {
                "date": today,
                "category": "btc",
                "category_value_usd": 1e15,  # Very large value
                "total_value_usd": 1e15,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        result = service.get_portfolio_trend(user_id="test-user", days=30)

        # Should process extreme values
        assert result.data_points == 1
        assert result.daily_values[0].total_value_usd == 1e15

    def test_rows_with_negative_values(self, mocker):
        """Rows with negative portfolio value should be rejected by Pydantic validation."""
        today = datetime.now(UTC).date()
        mock_rows = [
            {
                "date": today,
                "category": "stablecoins",
                "category_value_usd": -500.0,  # Negative (debt position)
                "total_value_usd": -500.0,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        # Pydantic DailyTrendDataPoint model enforces total_value_usd >= 0
        # Negative portfolio values are rejected at validation layer
        from src.core.exceptions import DataIntegrityError

        # Service-level validation now catches this before Pydantic
        with pytest.raises(DataIntegrityError) as exc_info:
            service.get_portfolio_trend(user_id="test-user", days=30)

        assert "Invalid total_value_usd (-500.0)" in str(exc_info.value)


class TestNegativeTotalValueBugFix:
    """Tests for negative total_value_usd bug fix."""

    @pytest.fixture
    def trend_service(self):
        """Fixture for TrendAnalysisService."""
        from src.services.shared.query_service import QueryService

        return TrendAnalysisService(db=MagicMock(), query_service=QueryService())

    def test_null_total_value_usd_raises_error(self, trend_service, mocker):
        """NULL total_value_usd should raise DataIntegrityError."""
        from datetime import date
        from uuid import UUID

        from src.core.exceptions import DataIntegrityError

        mock_rows = [
            {
                "date": date.today(),
                "category": "btc",
                "category_value_usd": -500.0,
                "total_value_usd": None,  # NULL
            }
        ]
        mocker.patch.object(
            trend_service.query_service, "execute_query", return_value=mock_rows
        )

        with pytest.raises(DataIntegrityError) as exc:
            trend_service.get_portfolio_trend(
                user_id=UUID("cd9c8241-2912-4997-828c-e85a9af5e235"), days=30
            )

        assert "Missing required field 'total_value_usd'" in str(exc.value)

    def test_negative_total_value_usd_raises_error(self, trend_service, mocker):
        """Negative total_value_usd should raise DataIntegrityError."""
        from datetime import date
        from uuid import UUID

        from src.core.exceptions import DataIntegrityError

        mock_rows = [
            {
                "date": date.today(),
                "category": "stablecoins",
                "category_value_usd": -500.0,
                "total_value_usd": -500.0,  # Negative
            }
        ]
        mocker.patch.object(
            trend_service.query_service, "execute_query", return_value=mock_rows
        )

        with pytest.raises(DataIntegrityError) as exc:
            trend_service.get_portfolio_trend(
                user_id=UUID("cd9c8241-2912-4997-828c-e85a9af5e235"), days=30
            )

        assert "-500" in str(exc.value)

    def test_zero_portfolio_value_accepted(self, trend_service, mocker):
        """Zero portfolio value is valid (no positions)."""
        from datetime import date
        from uuid import UUID

        mock_rows = [
            {
                "date": date.today(),
                "category": "stablecoins",
                "category_value_usd": 0.0,
                "total_value_usd": 0.0,
            }
        ]
        mocker.patch.object(
            trend_service.query_service, "execute_query", return_value=mock_rows
        )

        result = trend_service.get_portfolio_trend(
            user_id=UUID("cd9c8241-2912-4997-828c-e85a9af5e235"), days=30
        )

        assert result.daily_values[0].total_value_usd == 0.0

    def test_extreme_negative_value_caught(self, trend_service, mocker):
        """Extreme negatives like -9358824142115438.0 are caught."""
        from datetime import date
        from uuid import UUID

        from src.core.exceptions import DataIntegrityError

        mock_rows = [
            {
                "date": date.today(),
                "category": "btc",
                "category_value_usd": -1e15,
                "total_value_usd": -9358824142115438.0,
            }
        ]
        mocker.patch.object(
            trend_service.query_service, "execute_query", return_value=mock_rows
        )

        with pytest.raises(DataIntegrityError):
            trend_service.get_portfolio_trend(
                user_id=UUID("cd9c8241-2912-4997-828c-e85a9af5e235"), days=30
            )

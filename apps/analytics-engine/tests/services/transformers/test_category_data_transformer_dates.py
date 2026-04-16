"""
Tests for normalize_date() utility function.

Covers date normalization handling for multiple input types:
- date objects
- datetime objects (with and without timezone)
- ISO8601 strings
- Invalid inputs
- Edge cases (leap years, None values)
"""

from datetime import UTC, date, datetime

import pytest

from src.core.utils import normalize_date


def _normalize_date_strict(value):
    """Helper: calls normalize_date(nullable=False), mirrors old behavior."""
    result = normalize_date(value, nullable=False)
    assert result is not None
    return result


class TestDateNormalization:
    """Tests for normalize_date() with nullable=False (strict mode)."""

    def test_date_object_passthrough(self):
        """Date objects should pass through unchanged."""
        input_date = date(2024, 1, 15)
        result = _normalize_date_strict(input_date)
        assert result == date(2024, 1, 15)
        assert isinstance(result, date)

    def test_datetime_object_extraction(self):
        """Datetime objects should extract the date component."""
        input_datetime = datetime(2024, 1, 15, 10, 30, 0)
        result = _normalize_date_strict(input_datetime)
        assert result == date(2024, 1, 15)
        assert isinstance(result, date)

    def test_datetime_with_timezone_extraction(self):
        """Datetime with timezone should extract date in local time."""
        input_datetime = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        result = _normalize_date_strict(input_datetime)
        assert result == date(2024, 1, 15)
        assert isinstance(result, date)

    def test_iso8601_string_parsing(self):
        """ISO8601 date strings should parse correctly."""
        input_string = "2024-01-15"
        result = _normalize_date_strict(input_string)
        assert result == date(2024, 1, 15)
        assert isinstance(result, date)

    def test_iso8601_datetime_string_parsing(self):
        """ISO8601 datetime strings should extract date."""
        input_string = "2024-01-15T10:30:00"
        result = _normalize_date_strict(input_string)
        assert result == date(2024, 1, 15)
        assert isinstance(result, date)

    def test_invalid_date_string_raises_value_error(self):
        """Invalid date strings should raise ValueError with helpful message."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict("not-a-date")
        assert "Invalid date string: not-a-date" in str(exc_info.value)

    def test_unsupported_type_raises_value_error(self):
        """Unsupported types should raise ValueError with type info."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict(12345)
        assert "Unsupported date type: <class 'int'>" in str(exc_info.value)

    def test_none_value_raises_value_error(self):
        """None values should raise ValueError."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict(None)
        assert "Cannot convert None to date" in str(exc_info.value)

    def test_leap_year_date_handling(self):
        """Leap year dates (Feb 29) should parse correctly."""
        input_date = date(2024, 2, 29)  # 2024 is a leap year
        result = _normalize_date_strict(input_date)
        assert result == date(2024, 2, 29)
        assert isinstance(result, date)


class TestDateNormalizationEdgeCases:
    """Additional edge cases for date normalization."""

    def test_iso8601_string_with_timezone(self):
        """ISO8601 strings with timezone should parse correctly."""
        input_string = "2024-01-15T10:30:00+00:00"
        result = _normalize_date_strict(input_string)
        assert result == date(2024, 1, 15)

    def test_iso8601_string_with_z_timezone(self):
        """ISO8601 strings with Z timezone should parse correctly."""
        input_string = "2024-01-15T10:30:00Z"
        result = _normalize_date_strict(input_string)
        assert result == date(2024, 1, 15)

    def test_date_at_year_boundary(self):
        """Dates at year boundaries should parse correctly."""
        # New Year's Eve
        result_nye = _normalize_date_strict("2023-12-31")
        assert result_nye == date(2023, 12, 31)

        # New Year's Day
        result_nyd = _normalize_date_strict("2024-01-01")
        assert result_nyd == date(2024, 1, 1)

    def test_empty_string_raises_value_error(self):
        """Empty strings should raise ValueError."""
        with pytest.raises(ValueError):
            _normalize_date_strict("")

    def test_float_type_raises_value_error(self):
        """Float types should raise ValueError with type info."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict(123.45)
        assert "Unsupported date type: <class 'float'>" in str(exc_info.value)

    def test_list_type_raises_value_error(self):
        """List types should raise ValueError with type info."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict([2024, 1, 15])
        assert "Unsupported date type: <class 'list'>" in str(exc_info.value)

    def test_dict_type_raises_value_error(self):
        """Dict types should raise ValueError with type info."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict({"year": 2024, "month": 1, "day": 15})
        assert "Unsupported date type: <class 'dict'>" in str(exc_info.value)

    def test_partial_iso8601_string(self):
        """Partial ISO8601 strings (e.g., year-month only) should raise ValueError."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict("2024-01")
        assert "Invalid date string" in str(exc_info.value)

    def test_non_iso_date_format_raises_error(self):
        """Non-ISO date formats should raise ValueError."""
        with pytest.raises(ValueError) as exc_info:
            _normalize_date_strict("01/15/2024")  # US format
        assert "Invalid date string" in str(exc_info.value)

    def test_datetime_with_microseconds(self):
        """Datetime with microseconds should extract date correctly."""
        input_datetime = datetime(2024, 1, 15, 10, 30, 45, 123456)
        result = _normalize_date_strict(input_datetime)
        assert result == date(2024, 1, 15)

    def test_iso8601_string_with_milliseconds(self):
        """ISO8601 strings with milliseconds should parse correctly."""
        input_string = "2024-01-15T10:30:45.123"
        result = _normalize_date_strict(input_string)
        assert result == date(2024, 1, 15)

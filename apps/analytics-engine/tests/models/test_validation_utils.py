"""Tests for shared validation utilities."""

import pytest

from src.models.validation_utils import (
    validate_array_uniqueness,
    validate_config_id,
    validate_iso8601_format,
)


class TestValidateArrayUniqueness:
    """Test suite for validate_array_uniqueness function."""

    def test_validate_array_uniqueness_passes_with_unique_strings(self):
        """Test that unique string arrays pass validation."""
        result = validate_array_uniqueness(["a", "b", "c"], "test_field")
        assert result == ["a", "b", "c"]

    def test_validate_array_uniqueness_passes_with_unique_integers(self):
        """Test that unique integer arrays pass validation."""
        result = validate_array_uniqueness([1, 2, 3], "test_field")
        assert result == [1, 2, 3]

    def test_validate_array_uniqueness_passes_with_empty_array(self):
        """Test that empty arrays pass validation."""
        result = validate_array_uniqueness([], "test_field")
        assert result == []

    def test_validate_array_uniqueness_passes_with_single_item(self):
        """Test that single-item arrays pass validation."""
        result = validate_array_uniqueness(["only"], "test_field")
        assert result == ["only"]

    def test_validate_array_uniqueness_fails_with_duplicates(self):
        """Test that duplicate values raise ValueError with duplicate details."""
        with pytest.raises(ValueError, match="Found duplicates"):
            validate_array_uniqueness(["a", "b", "a", "c"], "test_field")

    def test_validate_array_uniqueness_error_message_includes_field_name(self):
        """Test that error message includes the field name."""
        with pytest.raises(ValueError, match="test_field must be unique"):
            validate_array_uniqueness([1, 2, 1], "test_field")

    def test_validate_array_uniqueness_error_message_shows_duplicates(self):
        """Test that error message shows which values are duplicated."""
        with pytest.raises(ValueError) as exc_info:
            validate_array_uniqueness(["x", "y", "x", "z", "y"], "items")

        error_msg = str(exc_info.value)
        assert "items must be unique" in error_msg
        assert "Found duplicates:" in error_msg
        # Both 'x' and 'y' should be mentioned as duplicates
        assert "'x'" in error_msg or "x" in error_msg
        assert "'y'" in error_msg or "y" in error_msg

    def test_validate_array_uniqueness_with_multiple_duplicates_of_same_value(self):
        """Test with a value appearing more than twice."""
        with pytest.raises(ValueError, match="Found duplicates"):
            validate_array_uniqueness(["a", "a", "a", "b"], "test_field")


class TestValidateIso8601Format:
    """Test suite for validate_iso8601_format function."""

    def test_validate_iso8601_format_passes_with_date_only(self):
        """Test that YYYY-MM-DD format passes validation."""
        result = validate_iso8601_format("2025-12-31", "test_date")
        assert result == "2025-12-31"

    def test_validate_iso8601_format_passes_with_datetime(self):
        """Test that YYYY-MM-DDTHH:MM:SS format passes validation."""
        result = validate_iso8601_format("2025-12-31T23:59:59", "test_datetime")
        assert result == "2025-12-31T23:59:59"

    def test_validate_iso8601_format_passes_with_timezone(self):
        """Test that ISO8601 with timezone passes validation."""
        result = validate_iso8601_format("2025-12-31T23:59:59+00:00", "test_tz")
        assert result == "2025-12-31T23:59:59+00:00"

    def test_validate_iso8601_format_passes_with_z_timezone(self):
        """Test that ISO8601 with Z timezone indicator passes validation."""
        result = validate_iso8601_format("2025-12-31T23:59:59Z", "test_tz")
        assert result == "2025-12-31T23:59:59Z"

    def test_validate_iso8601_format_fails_with_us_date_format(self):
        """Test that MM/DD/YYYY format raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("12/31/2025", "test_date")

    def test_validate_iso8601_format_fails_with_european_date_format(self):
        """Test that DD/MM/YYYY format raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("31/12/2025", "test_date")

    def test_validate_iso8601_format_fails_with_invalid_month(self):
        """Test that invalid month (13) raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("2025-13-01", "test_date")

    def test_validate_iso8601_format_fails_with_invalid_day(self):
        """Test that invalid day (32) raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("2025-12-32", "test_date")

    def test_validate_iso8601_format_fails_with_empty_string(self):
        """Test that empty string raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("", "test_date")

    def test_validate_iso8601_format_fails_with_random_text(self):
        """Test that random text raises ValueError."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("not-a-date", "test_date")

    def test_validate_iso8601_format_error_includes_field_name(self):
        """Test that error message includes the field name."""
        with pytest.raises(ValueError) as exc_info:
            validate_iso8601_format("invalid", "my_field")

        error_msg = str(exc_info.value)
        assert "Invalid ISO8601 date format" in error_msg
        assert "invalid" in error_msg

    def test_validate_iso8601_format_accepts_leap_year_date(self):
        """Test that leap year date (Feb 29) is accepted in leap years."""
        result = validate_iso8601_format("2024-02-29", "test_date")
        assert result == "2024-02-29"

    def test_validate_iso8601_format_rejects_non_leap_year_feb_29(self):
        """Test that Feb 29 is rejected in non-leap years."""
        with pytest.raises(ValueError, match="Invalid ISO8601 date format"):
            validate_iso8601_format("2025-02-29", "test_date")


class TestValidateConfigId:
    """Test suite for validate_config_id function."""

    def test_validate_config_id_valid(self):
        """Test that valid config IDs pass validation."""
        result = validate_config_id("my_config_123")
        assert result == "my_config_123"

    def test_validate_config_id_valid_with_hyphen(self):
        """Test that config IDs with hyphens pass validation."""
        result = validate_config_id("fgi-exponential")
        assert result == "fgi-exponential"

    def test_validate_config_id_empty_raises(self):
        """Test that empty string raises ValueError."""
        with pytest.raises(ValueError, match="config_id must be non-empty"):
            validate_config_id("")

    def test_validate_config_id_whitespace_only_raises(self):
        """Test that whitespace-only string raises ValueError."""
        with pytest.raises(ValueError, match="config_id must be non-empty"):
            validate_config_id("   ")

    def test_validate_config_id_non_ascii_raises(self):
        """Test that non-ASCII characters raise ValueError."""
        with pytest.raises(ValueError, match="config_id must use ASCII characters"):
            validate_config_id("config_日本語")

    def test_validate_config_id_contains_space_raises(self):
        """Test that spaces within the ID raise ValueError."""
        with pytest.raises(ValueError, match="config_id must not contain whitespace"):
            validate_config_id("my config")

    def test_validate_config_id_contains_tab_raises(self):
        """Test that tabs within the ID raise ValueError."""
        with pytest.raises(ValueError, match="config_id must not contain whitespace"):
            validate_config_id("my\tconfig")

    def test_validate_config_id_contains_newline_raises(self):
        """Test that newlines within the ID raise ValueError."""
        with pytest.raises(ValueError, match="config_id must not contain whitespace"):
            validate_config_id("my\nconfig")

    def test_validate_config_id_custom_field_name(self):
        """Test that custom field name appears in error message."""
        with pytest.raises(ValueError, match="my_field must be non-empty"):
            validate_config_id("", "my_field")

    def test_validate_config_id_custom_field_name_in_ascii_error(self):
        """Test that custom field name appears in ASCII error."""
        with pytest.raises(ValueError, match="preset_id must use ASCII characters"):
            validate_config_id("配置", "preset_id")

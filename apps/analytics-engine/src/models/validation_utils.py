"""Shared validation utilities for Pydantic models.

This module provides reusable validation functions to eliminate duplication across
multiple Pydantic models. All validators follow consistent error message formatting
and behavior.
"""

from __future__ import annotations

from datetime import datetime
from typing import TypeVar

T = TypeVar("T")


def is_close(a: float, b: float, tolerance: float) -> bool:
    """Return True if |a - b| <= tolerance.

    Args:
        a: First value
        b: Second value
        tolerance: Allowed absolute difference

    Returns:
        bool: Whether values are within tolerance
    """
    return abs(a - b) <= tolerance


def validate_array_uniqueness(
    values: list[T],
    field_name: str,
) -> list[T]:
    """
    Validate that all items in an array are unique.

    Args:
        values: List of values to validate
        field_name: Name of the field (for error messages)

    Returns:
        The original list if validation passes

    Raises:
        ValueError: If duplicate values are found with details about the duplicates
    """
    if len(values) != len(set(values)):
        duplicates = [item for item in values if values.count(item) > 1]
        raise ValueError(
            f"{field_name} must be unique. Found duplicates: {set(duplicates)}"
        )
    return values


def validate_config_id(config_id: str, field_name: str = "config_id") -> str:
    """
    Validate config_id format: non-empty, ASCII, no whitespace.

    Args:
        config_id: The config ID string to validate
        field_name: Name of the field (for error messages)

    Returns:
        The original string if validation passes

    Raises:
        ValueError: If config_id is empty, non-ASCII, or contains whitespace
    """
    if not config_id or not config_id.strip():
        raise ValueError(f"{field_name} must be non-empty")
    if not config_id.isascii():
        raise ValueError(f"{field_name} must use ASCII characters")
    if any(char.isspace() for char in config_id):
        raise ValueError(f"{field_name} must not contain whitespace")
    return config_id


def normalize_asset_symbol(value: str, field_name: str = "asset symbol") -> str:
    """Normalize and validate an asset symbol (strip + uppercase + non-empty check).

    Args:
        value: Raw asset symbol string
        field_name: Name of the field (for error messages)

    Returns:
        Normalized uppercase symbol

    Raises:
        ValueError: If the result is empty after stripping
    """
    normalized = str(value).strip().upper()
    if not normalized:
        raise ValueError(f"{field_name} must be a non-empty asset symbol")
    return normalized


def validate_iso8601_format(
    value: str,
    field_name: str,
) -> str:
    """
    Validate that a string matches ISO8601 date format.

    Uses datetime.fromisoformat() which accepts:
    - Date only: YYYY-MM-DD
    - Date with time: YYYY-MM-DDTHH:MM:SS
    - With timezone: YYYY-MM-DDTHH:MM:SS+00:00

    Args:
        value: Date string to validate
        field_name: Name of the field (for error messages)

    Returns:
        The original string if validation passes

    Raises:
        ValueError: If format is invalid or cannot be parsed
    """
    try:
        datetime.fromisoformat(value)
    except ValueError as e:
        raise ValueError(f"Invalid ISO8601 date format: {value}") from e
    return value

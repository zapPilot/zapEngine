"""
Utility functions for working with database rows and general helpers.
"""

from collections.abc import Mapping
from datetime import date, datetime
from typing import Any


def row_to_dict(row: Any) -> dict[str, Any]:
    """Convert a SQLAlchemy Row (or similar) to a plain dict.

    Supports SQLAlchemy 2.0 Row objects via ``row._mapping``. Falls back to
    ``dict(row)`` or ``row.__dict__`` for simple namespace-like objects.
    """
    # SQLAlchemy Row provides a mapping interface via _mapping
    mapping: Mapping[str, Any] | None = getattr(row, "_mapping", None)
    if mapping is not None:
        return dict(mapping)

    # Handle namedtuple and other _asdict()-like objects
    asdict = getattr(row, "_asdict", None)
    if callable(asdict):
        result = asdict()
        # Ensure we return a proper dict[str, Any]
        if isinstance(result, dict):
            return result
        return dict(result) if result else {}

    # Some row types are already dict-like or tuples that can be dict()-ed
    try:
        return dict(row)
    except (TypeError, ValueError):
        pass

    # Fallback to object attributes
    d = getattr(row, "__dict__", None)
    if isinstance(d, dict):
        # Filter out private attributes
        return {k: v for k, v in d.items() if not k.startswith("_")}

    # Last resort: return as-is in a wrapper
    return {"value": row}


def normalize_date(value: Any, nullable: bool = False) -> date | None:
    """Normalize date value to date object for consistent handling.

    Production SQLAlchemy returns date objects, but tests may use ISO strings.
    This function ensures consistent date handling across both contexts.

    Args:
        value: Date value (date object, datetime, or ISO string)
        nullable: If True, returns None on failure; if False, raises ValueError

    Returns:
        date object, or None if nullable=True and conversion fails

    Raises:
        ValueError: If nullable=False and value cannot be converted to a date
    """
    if value is None:
        if nullable:
            return None
        raise ValueError("Cannot convert None to date")

    # Check datetime BEFORE date since datetime is a subclass of date
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except (ValueError, AttributeError) as e:
            if nullable:
                return None
            raise ValueError(f"Invalid date string: {value}") from e

    if nullable:
        return None
    raise ValueError(f"Unsupported date type: {type(value)}")


def parse_iso_datetime(value: str | datetime) -> datetime:
    """
    Parse ISO8601 datetime string, handling 'Z' suffix for UTC.

    Python's datetime.fromisoformat() doesn't handle 'Z' suffix natively,
    so this utility converts it to explicit '+00:00' timezone offset.

    Args:
        value: ISO8601 datetime string or datetime object

    Returns:
        datetime object

    Examples:
        >>> parse_iso_datetime("2024-01-15T10:30:00Z")
        datetime(2024, 1, 15, 10, 30, tzinfo=timezone.utc)
        >>> dt = datetime(2024, 1, 15, 10, 30)
        >>> parse_iso_datetime(dt) == dt
        True

    Raises:
        ValueError: If string cannot be parsed as ISO8601 datetime
    """
    if isinstance(value, datetime):
        return value

    # Convert 'Z' suffix to explicit UTC offset for fromisoformat()
    cleaned = value.replace("Z", "+00:00")
    return datetime.fromisoformat(cleaned)


def coerce_date_to_datetime(value: date | datetime) -> datetime:
    """Coerce date-like values to datetimes at midnight."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    raise TypeError(f"Unsupported date type: {type(value)}")

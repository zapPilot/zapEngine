"""
Tests for core utility functions.
"""

from collections import namedtuple
from datetime import date, datetime

import pytest

from src.core.utils import coerce_date_to_datetime, row_to_dict


class MockSQLAlchemyRow:
    """A mock that simulates the behavior of a SQLAlchemy 2.0 Row object."""

    def __init__(self, data):
        self._mapping = data

    def __iter__(self):
        return iter(self._mapping.items())


class SimpleObject:
    """A simple object with attributes to test the __dict__ fallback."""

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self._private = "should_not_be_included"


def test_row_to_dict_sqlalchemy_row():
    """Test conversion of a mock SQLAlchemy Row with a _mapping attribute."""
    row = MockSQLAlchemyRow({"id": 1, "name": "Test"})
    assert row_to_dict(row) == {"id": 1, "name": "Test"}


def test_row_to_dict_dict_like():
    """Test conversion of a dict-like object (a named tuple)."""
    Row = namedtuple("Row", ["id", "name"])
    row = Row(id=2, name="Tuple Test")
    assert row_to_dict(row) == {"id": 2, "name": "Tuple Test"}


def test_row_to_dict_simple_object():
    """Test conversion of a simple object using its __dict__."""
    obj = SimpleObject(id=3, name="Object Test", value=123.45)
    result = row_to_dict(obj)
    assert result == {"id": 3, "name": "Object Test", "value": 123.45}
    assert "_private" not in result


def test_row_to_dict_unconvertible_fallback():
    """Test the final fallback for an object that cannot be converted."""
    unconvertible = 12345  # An integer cannot be converted by the function
    assert row_to_dict(unconvertible) == {"value": 12345}


def test_row_to_dict_empty_object():
    """Test with an empty object."""
    obj = SimpleObject()
    assert row_to_dict(obj) == {}


def test_coerce_date_to_datetime_converts_date():
    """Date values should coerce to midnight datetimes."""
    value = date(2025, 11, 1)
    result = coerce_date_to_datetime(value)
    assert result == datetime(2025, 11, 1, 0, 0)


def test_coerce_date_to_datetime_passes_through_datetime():
    """Datetime values should be returned unchanged."""
    value = datetime(2025, 11, 1, 14, 30)
    assert coerce_date_to_datetime(value) == value


def test_coerce_date_to_datetime_rejects_invalid_type():
    """Invalid types should raise a TypeError."""
    with pytest.raises(TypeError):
        coerce_date_to_datetime("2025-11-01")

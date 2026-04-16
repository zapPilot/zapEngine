"""Tests for validation_utils edge cases."""

from __future__ import annotations

import pytest

from src.models.validation_utils import normalize_asset_symbol


def test_normalize_asset_symbol_empty_after_strip() -> None:
    """Line 93: empty string after strip raises ValueError."""
    with pytest.raises(ValueError, match="must be a non-empty asset symbol"):
        normalize_asset_symbol("   ")

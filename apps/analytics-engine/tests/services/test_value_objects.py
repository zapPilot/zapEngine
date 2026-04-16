"""
Unit tests for value objects used across service implementations.

Validates dict-like behavior for WalletCategoryBreakdown and WalletAggregate,
including the retained `apr` mapping for backward compatibility.
"""

import pytest

from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown


class TestWalletCategoryBreakdown:
    def test_getitem_valid_keys(self):
        breakdown = WalletCategoryBreakdown(value=100.0, percentage=25.5)
        assert breakdown["value"] == 100.0
        assert breakdown["percentage"] == 25.5

    def test_getitem_invalid_key_raises_keyerror(self):
        breakdown = WalletCategoryBreakdown()
        with pytest.raises(KeyError, match="invalid"):
            _ = breakdown["invalid"]

    def test_iter_and_len(self):
        breakdown = WalletCategoryBreakdown(value=50.0, percentage=10.0)
        assert list(breakdown) == ["value", "percentage"]
        assert len(breakdown) == 2

    def test_mapping_helpers(self):
        breakdown = WalletCategoryBreakdown(value=90.0, percentage=18.5)
        assert dict(breakdown) == {"value": 90.0, "percentage": 18.5}
        assert list(breakdown.keys()) == ["value", "percentage"]
        assert list(breakdown.values()) == [90.0, 18.5]
        assert list(breakdown.items()) == [("value", 90.0), ("percentage", 18.5)]


class TestWalletAggregate:
    def test_getitem_valid_keys(self):
        categories = {
            "btc": WalletCategoryBreakdown(value=100.0, percentage=50.0),
            "eth": WalletCategoryBreakdown(value=100.0, percentage=50.0),
        }
        aggregate = WalletAggregate(
            total_value=200.0,
            token_count=10,
            categories=categories,
            apr={"apr_30d": 0.05},
        )

        assert aggregate["total_value"] == 200.0
        assert aggregate["token_count"] == 10
        assert aggregate["categories"] == categories
        assert aggregate["apr"] == {"apr_30d": 0.05}

    def test_getitem_invalid_key_raises_keyerror(self):
        aggregate = WalletAggregate(total_value=100.0, token_count=5)
        with pytest.raises(KeyError, match="nonexistent"):
            _ = aggregate["nonexistent"]

    def test_iter_and_len(self):
        aggregate = WalletAggregate(total_value=500.0, token_count=25)
        assert list(aggregate) == ["total_value", "token_count", "categories", "apr"]
        assert len(aggregate) == 4

    def test_mapping_helpers(self):
        categories = {"eth": WalletCategoryBreakdown(value=75.0, percentage=100.0)}
        aggregate = WalletAggregate(
            total_value=75.0, token_count=3, categories=categories
        )

        assert dict(aggregate) == {
            "total_value": 75.0,
            "token_count": 3,
            "categories": categories,
            "apr": {},
        }
        assert list(aggregate.keys()) == [
            "total_value",
            "token_count",
            "categories",
            "apr",
        ]
        assert list(aggregate.values()) == [75.0, 3, categories, {}]
        assert list(aggregate.items()) == [
            ("total_value", 75.0),
            ("token_count", 3),
            ("categories", categories),
            ("apr", {}),
        ]

    def test_membership_operator(self):
        aggregate = WalletAggregate(total_value=100.0, token_count=5)
        assert "total_value" in aggregate
        assert "token_count" in aggregate
        assert "categories" in aggregate
        assert "apr" in aggregate
        assert "invalid" not in aggregate

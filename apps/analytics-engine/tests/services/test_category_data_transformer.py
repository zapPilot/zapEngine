"""
Unit tests for CategoryDataTransformer class.

Covers logic for aggregating category-based analytics rows,
with specific focus on NET vs assets-only aggregation for debt handling.
"""

from datetime import date

import pytest

from src.services.transformers.category_data_transformer import (
    CategoryDataTransformer,
)


@pytest.fixture
def transformer():
    """Provides a CategoryDataTransformer instance."""
    return CategoryDataTransformer()


class TestExtractRowValue:
    """Tests for extract_row_value method (NET value extraction)."""

    def test_extract_category_value_usd(self, transformer):
        """Verify extraction of category_value_usd (NET value)."""
        row = {"category_value_usd": 7000.0, "category_assets_usd": 10000.0}
        assert transformer.extract_row_value(row) == 7000.0

    def test_extract_net_value_usd_fallback(self, transformer):
        """Verify fallback to net_value_usd when category_value_usd missing."""
        row = {"net_value_usd": 5000.0}
        assert transformer.extract_row_value(row) == 5000.0

    def test_extract_value_with_none(self, transformer):
        """Verify None values return 0.0."""
        row = {"category_value_usd": None}
        assert transformer.extract_row_value(row) == 0.0

    def test_extract_value_empty_row(self, transformer):
        """Verify empty row returns 0.0."""
        assert transformer.extract_row_value({}) == 0.0


class TestExtractAssetsValue:
    """Tests for extract_assets_value method (assets-only extraction)."""

    def test_extract_category_assets_usd(self, transformer):
        """Verify extraction of category_assets_usd (assets only)."""
        row = {
            "category_value_usd": 7000.0,  # NET
            "category_assets_usd": 10000.0,  # Assets
            "category_debt_usd": 3000.0,  # Debt
        }
        assert transformer.extract_assets_value(row) == 10000.0

    def test_extract_assets_value_with_none(self, transformer):
        """Verify None values return 0.0."""
        row = {"category_assets_usd": None}
        assert transformer.extract_assets_value(row) == 0.0

    def test_extract_assets_value_empty_row(self, transformer):
        """Verify empty row returns 0.0."""
        assert transformer.extract_assets_value({}) == 0.0

    def test_extract_assets_value_zero_debt(self, transformer):
        """Verify assets extraction when there's no debt."""
        row = {
            "category_value_usd": 5000.0,  # NET (same as assets)
            "category_assets_usd": 5000.0,
            "category_debt_usd": 0.0,
        }
        assert transformer.extract_assets_value(row) == 5000.0


class TestAggregate:
    """Tests for aggregate method (NET value aggregation)."""

    def test_aggregate_uses_net_values(self, transformer):
        """Verify aggregate uses NET values (category_value_usd)."""
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "others",
                "category_value_usd": 7000.0,  # NET: 10k - 3k
                "category_assets_usd": 10000.0,
                "category_debt_usd": 3000.0,
                "total_value_usd": 7000.0,
            }
        ]

        aggregates = transformer.aggregate(raw_rows)

        assert len(aggregates) == 1
        agg = aggregates[0]
        assert agg.date == date(2023, 1, 1)
        assert agg.category_totals["others"] == 7000.0  # NET value
        assert agg.total_value_usd == 7000.0

    def test_aggregate_multiple_categories_with_debt(self, transformer):
        """Verify aggregate sums NET values across categories."""
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "eth",
                "category_value_usd": 10000.0,  # No debt
                "category_assets_usd": 10000.0,
                "total_value_usd": 12000.0,
            },
            {
                "date": date(2023, 1, 1),
                "category": "stablecoins",
                "category_value_usd": 2000.0,  # NET: 5k - 3k
                "category_assets_usd": 5000.0,
                "category_debt_usd": 3000.0,
                "total_value_usd": 12000.0,
            },
        ]

        aggregates = transformer.aggregate(raw_rows)

        assert len(aggregates) == 1
        agg = aggregates[0]
        # Total NET: 10k + 2k = 12k (not 15k assets)
        assert agg.category_totals["eth"] == 10000.0
        assert agg.category_totals["stablecoins"] == 2000.0
        assert agg.total_value_usd == 12000.0


class TestAggregateAssetsOnly:
    """Tests for aggregate_assets_only method (assets-only aggregation)."""

    def test_aggregate_assets_only_excludes_debt(self, transformer):
        """Verify aggregate_assets_only uses assets, not NET."""
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "others",
                "category_value_usd": 2000.0,  # NET: 5k - 3k
                "category_assets_usd": 5000.0,  # Assets only
                "category_debt_usd": 3000.0,
                "total_value_usd": 5000.0,
            }
        ]

        aggregates = transformer.aggregate_assets_only(raw_rows)

        assert len(aggregates) == 1
        agg = aggregates[0]
        assert agg.date == date(2023, 1, 1)
        # Should use assets ($5k), not NET ($2k)
        assert agg.category_totals["others"] == 5000.0
        assert agg.total_value_usd == 5000.0

    def test_aggregate_assets_only_multiple_categories(self, transformer):
        """Verify aggregate_assets_only sums assets across categories."""
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "eth",
                "category_value_usd": 10000.0,  # NET (no debt)
                "category_assets_usd": 10000.0,
                "total_value_usd": 15000.0,
            },
            {
                "date": date(2023, 1, 1),
                "category": "stablecoins",
                "category_value_usd": 2000.0,  # NET: 5k - 3k
                "category_assets_usd": 5000.0,
                "category_debt_usd": 3000.0,
                "total_value_usd": 15000.0,
            },
        ]

        aggregates = transformer.aggregate_assets_only(raw_rows)

        assert len(aggregates) == 1
        agg = aggregates[0]
        # Total assets: 10k + 5k = 15k (not 12k NET)
        assert agg.category_totals["eth"] == 10000.0
        assert agg.category_totals["stablecoins"] == 5000.0
        assert agg.total_value_usd == 15000.0

    def test_aggregate_assets_only_multi_day(self, transformer):
        """Verify aggregate_assets_only works across multiple days."""
        raw_rows = [
            # Day 1
            {
                "date": date(2023, 1, 1),
                "category": "stablecoins",
                "category_value_usd": 10000.0,  # No debt
                "category_assets_usd": 10000.0,
                "total_value_usd": 10000.0,
            },
            # Day 2: Same assets, but now with debt
            {
                "date": date(2023, 1, 2),
                "category": "stablecoins",
                "category_value_usd": 7000.0,  # NET: 10k - 3k
                "category_assets_usd": 10000.0,  # Assets unchanged
                "category_debt_usd": 3000.0,
                "total_value_usd": 10000.0,
            },
        ]

        aggregates = transformer.aggregate_assets_only(raw_rows)

        assert len(aggregates) == 2
        # Both days should show same assets ($10k)
        assert aggregates[0].category_totals["stablecoins"] == 10000.0
        assert aggregates[1].category_totals["stablecoins"] == 10000.0

    def test_aggregate_assets_only_with_zero_debt(self, transformer):
        """Verify aggregate_assets_only works when there's no debt (regression)."""
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "eth",
                "category_value_usd": 5000.0,  # Same as assets
                "category_assets_usd": 5000.0,
                "category_debt_usd": 0.0,
                "total_value_usd": 5000.0,
            }
        ]

        aggregates = transformer.aggregate_assets_only(raw_rows)

        assert len(aggregates) == 1
        agg = aggregates[0]
        assert agg.category_totals["eth"] == 5000.0
        assert agg.total_value_usd == 5000.0


class TestAggregateVsAggregateAssetsOnly:
    """
    Comparison tests showing the difference between aggregate() and aggregate_assets_only().
    """

    def test_aggregate_comparison_with_debt(self, transformer):
        """
        Direct comparison: aggregate() vs aggregate_assets_only() with debt present.

        Validates that aggregate() uses NET while aggregate_assets_only() uses assets.
        """
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "others",
                "category_value_usd": 2000.0,  # NET: 5k - 3k
                "category_assets_usd": 5000.0,
                "category_debt_usd": 3000.0,
                # For net comparison, we use NET as total
                "total_value_usd": 2000.0,
            }
        ]

        # aggregate() should use NET ($2k)
        net_aggregates = transformer.aggregate(raw_rows)
        assert net_aggregates[0].category_totals["others"] == 2000.0
        assert net_aggregates[0].total_value_usd == 2000.0

        # aggregate_assets_only() should use assets ($5k)
        # Note: we need to rewrite total_value_usd to match assets-only expectation
        raw_rows_assets = [dict(row, total_value_usd=5000.0) for row in raw_rows]
        assets_aggregates = transformer.aggregate_assets_only(raw_rows_assets)
        assert assets_aggregates[0].category_totals["others"] == 5000.0
        assert assets_aggregates[0].total_value_usd == 5000.0

    def test_aggregate_comparison_without_debt(self, transformer):
        """
        Comparison when no debt: both methods should return same values.

        Validates backward compatibility for users without debt.
        """
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "eth",
                "category_value_usd": 10000.0,
                "category_assets_usd": 10000.0,
                "category_debt_usd": 0.0,
                "total_value_usd": 10000.0,
            }
        ]

        net_aggregates = transformer.aggregate(raw_rows)
        assets_aggregates = transformer.aggregate_assets_only(raw_rows)

        # Both should show $10k when no debt
        assert net_aggregates[0].category_totals["eth"] == 10000.0
        assert assets_aggregates[0].category_totals["eth"] == 10000.0
        assert net_aggregates[0].total_value_usd == assets_aggregates[0].total_value_usd

    def test_aggregate_comparison_extreme_leverage(self, transformer):
        """
        Comparison with extreme leverage (95% LTV).

        Shows significant difference between NET and assets-only approaches.
        """
        raw_rows = [
            {
                "date": date(2023, 1, 1),
                "category": "eth",
                "category_value_usd": 10000.0,  # Collateral
                "category_assets_usd": 10000.0,
                "total_value_usd": 500.0,
            },
            {
                "date": date(2023, 1, 1),
                "category": "stablecoins",
                "category_value_usd": -9500.0,  # NET: 0 - 9500 (pure debt)
                "category_assets_usd": 0.0,
                "category_debt_usd": 9500.0,
                "total_value_usd": 500.0,
            },
        ]

        # aggregate() shows NET: $500 ($10k - $9.5k)
        net_aggregates = transformer.aggregate(raw_rows)
        assert net_aggregates[0].total_value_usd == 500.0

        # aggregate_assets_only() shows assets: $10k (excludes debt)
        raw_rows_assets = [dict(row, total_value_usd=10000.0) for row in raw_rows]
        assets_aggregates = transformer.aggregate_assets_only(raw_rows_assets)
        assert assets_aggregates[0].total_value_usd == 10000.0

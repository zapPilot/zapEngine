"""
Unit tests for the PortfolioAggregator service.

Tests cover category aggregation, wallet data aggregation, and coercion logic
for handling mixed data types (WalletAggregate, WalletCategoryBreakdown, and dicts).
"""

import pytest

from src.services.portfolio.portfolio_aggregator import PortfolioAggregator
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown


@pytest.fixture
def aggregator():
    """Provide a PortfolioAggregator instance for tests."""
    return PortfolioAggregator()


class TestAggregateCategories:
    """Tests for the aggregate_categories method."""

    def test_aggregate_with_wallet_category_breakdown_objects(self, aggregator):
        """Verify aggregation handles WalletCategoryBreakdown objects correctly."""
        # Arrange
        category_assets = {"btc": 1000.0, "eth": 500.0}
        wallet_categories = {
            "btc": WalletCategoryBreakdown(value=200.0, percentage=20.0),
            "eth": WalletCategoryBreakdown(value=300.0, percentage=30.0),
        }
        total_assets = 2000.0

        # Act
        result = aggregator.aggregate_categories(
            category_assets, wallet_categories, total_assets
        )

        # Assert
        assert result["btc"].total_value == 1200.0  # 1000 + 200
        assert result["btc"].wallet_tokens_value == 200.0
        assert result["btc"].other_sources_value == 1000.0
        assert result["btc"].percentage_of_portfolio == 60.0  # 1200/2000

        assert result["eth"].total_value == 800.0  # 500 + 300
        assert result["eth"].wallet_tokens_value == 300.0
        assert result["eth"].other_sources_value == 500.0
        assert result["eth"].percentage_of_portfolio == 40.0  # 800/2000

    def test_aggregate_with_mixed_wallet_types(self, aggregator):
        """Verify aggregation handles mixed WalletCategoryBreakdown and dict types."""
        # Arrange
        category_assets = {"btc": 500.0}
        wallet_categories = {
            "btc": WalletCategoryBreakdown(
                value=100.0, percentage=10.0
            ),  # Value object
            "eth": {"value": 200.0, "percentage": 20.0},  # Dict
        }
        total_assets = 800.0

        # Act
        result = aggregator.aggregate_categories(
            category_assets, wallet_categories, total_assets
        )

        # Assert - BTC uses WalletCategoryBreakdown
        assert result["btc"].total_value == 600.0  # 500 + 100
        assert result["btc"].wallet_tokens_value == 100.0
        # Assert - ETH uses dict
        assert result["eth"].total_value == 200.0  # 0 + 200
        assert result["eth"].wallet_tokens_value == 200.0

    def test_aggregate_with_none_wallet_categories(self, aggregator):
        """Verify aggregation handles None wallet_categories gracefully."""
        # Arrange
        category_assets = {"btc": 1000.0, "eth": 500.0}
        wallet_categories = None
        total_assets = 1500.0

        # Act
        result = aggregator.aggregate_categories(
            category_assets, wallet_categories, total_assets
        )

        # Assert - should use only category_assets
        assert result["btc"].total_value == 1000.0
        assert result["btc"].wallet_tokens_value == 0.0
        assert result["eth"].total_value == 500.0
        assert result["eth"].wallet_tokens_value == 0.0

    def test_aggregate_with_none_category_assets(self, aggregator):
        """Verify aggregation handles None category_assets gracefully."""
        # Arrange
        category_assets = None
        wallet_categories = {
            "btc": WalletCategoryBreakdown(value=300.0, percentage=75.0),
            "eth": WalletCategoryBreakdown(value=100.0, percentage=25.0),
        }
        total_assets = 400.0

        # Act
        result = aggregator.aggregate_categories(
            category_assets, wallet_categories, total_assets
        )

        # Assert - should use only wallet_categories
        assert result["btc"].total_value == 300.0
        assert result["btc"].wallet_tokens_value == 300.0
        assert result["btc"].other_sources_value == 0.0
        assert result["eth"].total_value == 100.0
        assert result["eth"].wallet_tokens_value == 100.0


class TestAggregateWalletData:
    """Tests for the aggregate_wallet_data method."""

    def test_aggregate_with_wallet_aggregate_objects(self, aggregator):
        """Verify aggregation handles WalletAggregate objects directly."""
        # Arrange
        wallet1 = WalletAggregate(
            total_value=100.0,
            token_count=5,
            categories={
                "btc": WalletCategoryBreakdown(value=60.0, percentage=60.0),
                "eth": WalletCategoryBreakdown(value=40.0, percentage=40.0),
                "stablecoins": WalletCategoryBreakdown(),
                "others": WalletCategoryBreakdown(),
            },
        )
        wallet2 = WalletAggregate(
            total_value=200.0,
            token_count=10,
            categories={
                "btc": WalletCategoryBreakdown(value=80.0, percentage=40.0),
                "eth": WalletCategoryBreakdown(value=120.0, percentage=60.0),
                "stablecoins": WalletCategoryBreakdown(),
                "others": WalletCategoryBreakdown(),
            },
        )

        # Act
        result = aggregator.aggregate_wallet_data([wallet1, wallet2])

        # Assert
        assert result.total_value == 300.0  # 100 + 200
        assert result.token_count == 15  # 5 + 10
        assert result.categories["btc"].value == 140.0  # 60 + 80
        assert result.categories["eth"].value == 160.0  # 40 + 120
        # Verify percentages are recalculated
        assert abs(result.categories["btc"].percentage - 46.67) < 0.01  # 140/300
        assert abs(result.categories["eth"].percentage - 53.33) < 0.01  # 160/300

    def test_aggregate_with_mixed_wallet_aggregate_and_dict(self, aggregator):
        """Verify aggregation handles mixed WalletAggregate and dict types."""
        # Arrange
        wallet1 = WalletAggregate(
            total_value=150.0,
            token_count=7,
            categories={
                "btc": WalletCategoryBreakdown(value=100.0, percentage=66.67),
                "eth": WalletCategoryBreakdown(value=50.0, percentage=33.33),
                "stablecoins": WalletCategoryBreakdown(),
                "others": WalletCategoryBreakdown(),
            },
        )
        wallet2 = {
            "total_value": 150.0,
            "token_count": 8,
            "categories": {
                "btc": {"value": 50.0, "percentage": 33.33},
                "eth": {"value": 100.0, "percentage": 66.67},
            },
        }

        # Act
        result = aggregator.aggregate_wallet_data([wallet1, wallet2])

        # Assert
        assert result.total_value == 300.0  # 150 + 150
        assert result.token_count == 15  # 7 + 8
        assert result.categories["btc"].value == 150.0  # 100 + 50
        assert result.categories["eth"].value == 150.0  # 50 + 100

    def test_aggregate_empty_wallet_list(self, aggregator):
        """Verify aggregation returns empty summary for empty wallet list."""
        # Act
        result = aggregator.aggregate_wallet_data([])

        # Assert
        assert result.total_value == 0.0
        assert result.token_count == 0
        assert result.categories["btc"].value == 0.0
        assert result.categories["eth"].value == 0.0
        assert result.categories["stablecoins"].value == 0.0
        assert result.categories["others"].value == 0.0

    def test_aggregate_with_unknown_category_in_wallet(self, aggregator):
        """Verify aggregation ignores unknown categories not in CATEGORIES."""
        # Arrange
        wallet = WalletAggregate(
            total_value=100.0,
            token_count=5,
            categories={
                "btc": WalletCategoryBreakdown(value=50.0, percentage=50.0),
                "unknown_category": WalletCategoryBreakdown(
                    value=50.0, percentage=50.0
                ),
            },
        )

        # Act
        result = aggregator.aggregate_wallet_data([wallet])

        # Assert - unknown_category should be skipped
        assert result.total_value == 100.0
        assert result.token_count == 5
        assert result.categories["btc"].value == 50.0
        assert "unknown_category" not in result.categories


class TestCoerceWalletSummary:
    """Tests for the _coerce_wallet_summary method."""

    def test_coerce_wallet_aggregate_returns_as_is(self, aggregator):
        """Verify coercion returns WalletAggregate unchanged."""
        # Arrange
        wallet = WalletAggregate(
            total_value=200.0,
            token_count=10,
            categories={
                "btc": WalletCategoryBreakdown(value=100.0, percentage=50.0),
            },
        )

        # Act
        result = aggregator._coerce_wallet_summary(wallet)

        # Assert - should be the same instance
        assert result is wallet
        assert result.total_value == 200.0
        assert result.token_count == 10

    def test_coerce_dict_with_wallet_category_breakdown_objects(self, aggregator):
        """Verify coercion handles dict with WalletCategoryBreakdown objects."""
        # Arrange
        wallet_dict = {
            "total_value": 300.0,
            "token_count": 15,
            "categories": {
                "btc": WalletCategoryBreakdown(value=150.0, percentage=50.0),
                "eth": WalletCategoryBreakdown(value=150.0, percentage=50.0),
            },
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert
        assert isinstance(result, WalletAggregate)
        assert result.total_value == 300.0
        assert result.token_count == 15
        assert result.categories["btc"].value == 150.0
        assert result.categories["btc"].percentage == 50.0
        assert result.categories["eth"].value == 150.0
        assert result.categories["eth"].percentage == 50.0

    def test_coerce_dict_with_nested_dicts(self, aggregator):
        """Verify coercion handles dict with nested dict categories."""
        # Arrange
        wallet_dict = {
            "total_value": 400.0,
            "token_count": 20,
            "categories": {
                "btc": {"value": 200.0, "percentage": 50.0},
                "eth": {"value": 200.0, "percentage": 50.0},
            },
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert
        assert isinstance(result, WalletAggregate)
        assert result.total_value == 400.0
        assert result.token_count == 20
        assert result.categories["btc"].value == 200.0
        assert result.categories["btc"].percentage == 50.0
        assert result.categories["eth"].value == 200.0
        assert result.categories["eth"].percentage == 50.0

    def test_coerce_dict_with_scalar_category_values(self, aggregator):
        """Verify coercion handles dict with scalar category values."""
        # Arrange
        wallet_dict = {
            "total_value": 500.0,
            "token_count": 25,
            "categories": {
                "btc": 250.0,  # Scalar value
                "eth": 250.0,  # Scalar value
            },
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert
        assert isinstance(result, WalletAggregate)
        assert result.total_value == 500.0
        assert result.token_count == 25
        assert result.categories["btc"].value == 250.0
        assert result.categories["btc"].percentage == 0.0  # Not provided
        assert result.categories["eth"].value == 250.0
        assert result.categories["eth"].percentage == 0.0  # Not provided

    def test_coerce_dict_with_missing_categories(self, aggregator):
        """Verify coercion initializes missing categories to zero."""
        # Arrange
        wallet_dict = {
            "total_value": 100.0,
            "token_count": 5,
            "categories": {
                "btc": {"value": 100.0, "percentage": 100.0},
                # eth, stablecoins, others missing
            },
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert
        assert result.categories["btc"].value == 100.0
        assert result.categories["eth"].value == 0.0
        assert result.categories["stablecoins"].value == 0.0
        assert result.categories["others"].value == 0.0

    def test_coerce_dict_with_none_categories(self, aggregator):
        """Verify coercion handles None categories gracefully."""
        # Arrange
        wallet_dict = {
            "total_value": 100.0,
            "token_count": 5,
            "categories": None,
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert - all categories should be zero
        assert result.total_value == 100.0
        assert result.token_count == 5
        assert result.categories["btc"].value == 0.0
        assert result.categories["eth"].value == 0.0
        assert result.categories["stablecoins"].value == 0.0
        assert result.categories["others"].value == 0.0

    def test_coerce_dict_with_unknown_categories_skipped(self, aggregator):
        """Verify coercion ignores unknown categories."""
        # Arrange
        wallet_dict = {
            "total_value": 200.0,
            "token_count": 10,
            "categories": {
                "btc": {"value": 100.0, "percentage": 50.0},
                "unknown": {"value": 100.0, "percentage": 50.0},  # Should be skipped
            },
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert - unknown category should not appear
        assert result.categories["btc"].value == 100.0
        assert "unknown" not in result.categories
        # Known categories should still be initialized
        assert result.categories["eth"].value == 0.0

    def test_coerce_dict_with_mixed_category_types(self, aggregator):
        """Verify coercion handles mixed category types (objects, dicts, scalars)."""
        # Arrange
        wallet_dict = {
            "total_value": 600.0,
            "token_count": 30,
            "categories": {
                "btc": WalletCategoryBreakdown(value=200.0, percentage=33.33),  # Object
                "eth": {"value": 200.0, "percentage": 33.33},  # Dict
                "stablecoins": 200.0,  # Scalar
            },
        }

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert - all types should be handled correctly
        assert result.categories["btc"].value == 200.0
        assert result.categories["btc"].percentage == 33.33
        assert result.categories["eth"].value == 200.0
        assert result.categories["eth"].percentage == 33.33
        assert result.categories["stablecoins"].value == 200.0
        assert result.categories["stablecoins"].percentage == 0.0  # Scalar has no %

    def test_coerce_empty_dict(self, aggregator):
        """Verify coercion handles empty dict gracefully."""
        # Arrange
        wallet_dict = {}

        # Act
        result = aggregator._coerce_wallet_summary(wallet_dict)

        # Assert - should have zero values
        assert result.total_value == 0.0
        assert result.token_count == 0
        assert result.categories["btc"].value == 0.0
        assert result.categories["eth"].value == 0.0


class TestInitialiseCategoryTotals:
    """Tests for the _initialise_category_totals helper method."""

    def test_initialise_creates_all_categories(self, aggregator):
        """Verify initialization creates all standard categories."""
        # Act
        categories = aggregator._initialise_category_totals()

        # Assert
        assert "btc" in categories
        assert "eth" in categories
        assert "stablecoins" in categories
        assert "others" in categories

    def test_initialise_creates_zero_values(self, aggregator):
        """Verify initialization creates categories with zero values."""
        # Act
        categories = aggregator._initialise_category_totals()

        # Assert
        for _, breakdown in categories.items():
            assert breakdown.value == 0.0
            assert breakdown.percentage == 0.0


class TestEmptyWalletSummary:
    """Tests for the _empty_wallet_summary helper method."""

    def test_empty_wallet_has_zero_values(self, aggregator):
        """Verify empty wallet summary has zero values."""
        # Act
        result = aggregator._empty_wallet_summary()

        # Assert
        assert result.total_value == 0.0
        assert result.token_count == 0

    def test_empty_wallet_has_initialized_categories(self, aggregator):
        """Verify empty wallet summary has all categories initialized to zero."""
        # Act
        result = aggregator._empty_wallet_summary()

        # Assert
        assert result.categories["btc"].value == 0.0
        assert result.categories["eth"].value == 0.0
        assert result.categories["stablecoins"].value == 0.0
        assert result.categories["others"].value == 0.0

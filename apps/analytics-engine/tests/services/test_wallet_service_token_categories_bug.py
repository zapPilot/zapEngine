"""
Service-level integration tests for WalletService focusing on the token categories bug fix.

Tests the integration between WalletService and the fixed get_wallet_token_categories query,
ensuring the service correctly handles time-consistent data and provides proper error handling.

Related to bug fix in commit 5d84b2ed73b5fd51960b1866260e263d41c6980f
"""

from datetime import datetime
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.services.portfolio.wallet_service import WalletService
from src.services.shared.query_service import QueryService
from src.services.shared.value_objects import WalletAggregate, WalletCategoryBreakdown


class TestWalletServiceTokenCategoriesBugFix:
    """Test WalletService integration with fixed token categories query."""

    @pytest.fixture(autouse=True)
    def setup_services(self):
        """Setup services for each test."""
        QueryService._reset_cache_for_testing()
        self.query_service = QueryService()
        self.wallet_service = WalletService(self.query_service)
        yield
        QueryService._reset_cache_for_testing()

    @staticmethod
    def _build_summary(
        total_value: float,
        token_count: int,
        categories: dict[str, dict[str, float]],
    ) -> WalletAggregate:
        return WalletAggregate(
            total_value=total_value,
            token_count=token_count,
            categories={
                name: WalletCategoryBreakdown(
                    value=float(data.get("value", 0.0)),
                    percentage=float(data.get("percentage", 0.0)),
                )
                for name, data in categories.items()
            },
        )

    def test_get_wallet_token_summary_time_consistent_data(self, db_session: Session):
        """
        Test that get_wallet_token_summary receives time-consistent data from the fixed query.

        Verifies that the service correctly processes data where all tokens are from
        the same timestamp, preventing the original stale data bug.
        """
        wallet_address = "0xtest_time_consistent"

        # Mock query service to return time-consistent data as the fixed query would
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 100000.0,  # 2 BTC * $50k
                "token_count": 1,
                "percentage": 66.67,
            },
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 50000.0,  # 10 ETH * $5k
                "token_count": 1,
                "percentage": 33.33,
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Verify service correctly processes time-consistent data
        assert summary["total_value"] == 150000.0
        assert summary["token_count"] == 2

        # Verify category structure
        categories = summary["categories"]
        assert categories["btc"]["value"] == 100000.0
        assert categories["btc"]["percentage"] == 66.67
        assert categories["eth"]["value"] == 50000.0
        assert categories["eth"]["percentage"] == 33.33

        # Verify unused categories are zeroed
        assert categories["stablecoins"]["value"] == 0.0
        assert categories["others"]["value"] == 0.0

    def test_get_wallet_token_summary_handles_mixed_categories(
        self, db_session: Session
    ):
        """Test service handling of all four category types."""
        wallet_address = "0xtest_all_categories"

        # Mock data representing all categories from time-consistent query
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 50000.0,
                "token_count": 2,
                "percentage": 40.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 30000.0,
                "token_count": 1,
                "percentage": 24.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "stablecoins",
                "category_value": 25000.0,
                "token_count": 3,
                "percentage": 20.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "others",
                "category_value": 20000.0,
                "token_count": 5,
                "percentage": 16.0,
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Verify totals
        assert summary["total_value"] == 125000.0  # Sum of all categories
        assert summary["token_count"] == 11  # 2 + 1 + 3 + 5

        # Verify all categories are populated
        categories = summary["categories"]
        expected_categories = {
            "btc": {"value": 50000.0, "percentage": 40.0},
            "eth": {"value": 30000.0, "percentage": 24.0},
            "stablecoins": {"value": 25000.0, "percentage": 20.0},
            "others": {"value": 20000.0, "percentage": 16.0},
        }

        for category, expected in expected_categories.items():
            assert categories[category]["value"] == expected["value"]
            assert categories[category]["percentage"] == expected["percentage"]

    def test_get_wallet_token_summary_empty_wallet(self, db_session: Session):
        """Test service handling of empty wallet (no tokens found)."""
        wallet_address = "0xempty_wallet"

        with patch.object(self.query_service, "execute_query", return_value=[]):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Should return zero values for empty wallet
        assert summary["total_value"] == 0.0
        assert summary["token_count"] == 0

        # All categories should be zero
        for category in ["btc", "eth", "stablecoins", "others"]:
            assert summary["categories"][category]["value"] == 0.0
            assert summary["categories"][category]["percentage"] == 0.0

    def test_get_wallet_token_summary_unknown_category(self, db_session: Session):
        """Test service handling of unknown category from database."""
        wallet_address = "0xtest_unknown_category"

        # Mock data with unknown category (edge case)
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": 100000.0,
                "token_count": 1,
                "percentage": 80.0,
            },
            {
                "wallet_address": wallet_address,
                "category": "unknown_category",  # Not in service's expected categories
                "category_value": 25000.0,
                "token_count": 1,
                "percentage": 20.0,
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Known category should be processed
        assert summary["categories"]["btc"]["value"] == 100000.0

        # Unknown category should not affect known categories
        assert summary["categories"]["eth"]["value"] == 0.0
        assert summary["categories"]["stablecoins"]["value"] == 0.0
        assert summary["categories"]["others"]["value"] == 0.0

        # Total should include all returned data
        assert summary["total_value"] == 125000.0  # Includes unknown category
        assert summary["token_count"] == 2

    def test_get_wallet_token_summary_database_error_handling(
        self, db_session: Session
    ):
        """Test service error handling when database query fails."""
        wallet_address = "0xtest_db_error"

        with (
            patch.object(
                self.query_service,
                "execute_query",
                side_effect=SQLAlchemyError("Database connection error"),
            ),
            pytest.raises(SQLAlchemyError),
        ):
            self.wallet_service.get_wallet_token_summary(db_session, wallet_address)

    def test_get_wallet_token_summary_query_service_integration(
        self, db_session: Session
    ):
        """Test that service correctly calls query service with expected parameters."""
        wallet_address = "0xtest_integration"

        mock_query_service = Mock(spec=QueryService)
        mock_query_service.execute_query.return_value = []

        wallet_service = WalletService(mock_query_service)
        wallet_service.get_wallet_token_summary(db_session, wallet_address)

        # Verify query service called correctly
        mock_query_service.execute_query.assert_called_once_with(
            db_session,
            "get_wallet_token_categories",
            {"wallet_address": wallet_address},
        )

    @pytest.mark.skip(reason="APR calculations deprecated")
    def test_calculate_wallet_apr_with_bug_fix_data(self, db_session: Session): ...

    @pytest.mark.skip(reason="APR calculations deprecated")
    def test_calculate_wallet_apr_from_summary_time_consistency(self): ...

    def test_service_resilience_to_data_type_variations(self, db_session: Session):
        """Test service handles various data types from database correctly."""
        wallet_address = "0xtest_data_types"

        # Mock data with various numeric types (as might come from database)
        mock_category_data = [
            {
                "wallet_address": wallet_address,
                "category": "btc",
                "category_value": "75000.50",  # String number
                "token_count": 2.0,  # Float instead of int
                "percentage": 75.005,  # More decimal places
            },
            {
                "wallet_address": wallet_address,
                "category": "eth",
                "category_value": 25000,  # Integer
                "token_count": "1",  # String integer
                "percentage": None,  # None percentage (edge case)
            },
        ]

        with patch.object(
            self.query_service, "execute_query", return_value=mock_category_data
        ):
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )

        # Service should convert types appropriately
        assert summary["total_value"] == 100000.5  # 75000.50 + 25000
        assert summary["token_count"] == 3  # 2 + 1

        # Categories should be converted to floats
        assert summary["categories"]["btc"]["value"] == 75000.5
        assert summary["categories"]["btc"]["percentage"] == 75.005
        assert summary["categories"]["eth"]["value"] == 25000.0
        assert summary["categories"]["eth"]["percentage"] == 0.0  # None -> 0.0

    def test_integration_with_real_query_service(self, db_session: Session):
        """
        Integration test using real QueryService to ensure end-to-end functionality.

        This test verifies the complete integration works correctly with the actual
        query service and fixed SQL query structure by mocking the database results.
        """
        # Use real query service but mock the database results
        real_query_service = QueryService()
        real_wallet_service = WalletService(real_query_service)

        # Mock empty results for non-existent wallet
        with patch.object(real_query_service, "execute_query", return_value=[]):
            summary = real_wallet_service.get_wallet_token_summary(
                db_session, "0xnonexistent_integration_test"
            )

        # Should return valid empty structure
        assert isinstance(summary, WalletAggregate)
        assert summary["total_value"] == 0.0
        assert summary["token_count"] == 0
        assert len(summary["categories"]) == 4  # All four categories

        for category in ["btc", "eth", "stablecoins", "others"]:
            assert category in summary["categories"]
            assert summary["categories"][category]["value"] == 0.0
            assert summary["categories"][category]["percentage"] == 0.0

    def test_query_parameter_validation(self, db_session: Session):
        """Test service correctly normalizes wallet address to lowercase."""
        # Test that wallet address is normalized to lowercase before query
        with patch.object(self.query_service, "execute_query") as mock_execute:
            mock_execute.return_value = []

            # Service should normalize the address to lowercase
            self.wallet_service.get_wallet_token_summary(db_session, "0xABC123DEF456")

            mock_execute.assert_called_once_with(
                db_session,
                "get_wallet_token_categories",
                {"wallet_address": "0xabc123def456"},
            )

    def test_performance_with_large_category_results(self, db_session: Session):
        """Test service performance with large number of category results."""
        wallet_address = "0xtest_performance"

        # Mock large dataset (should still be handled efficiently)
        large_mock_data = []
        for _ in range(100):  # Large number of category entries
            large_mock_data.append(
                {
                    "wallet_address": wallet_address,
                    "category": "others",  # All in same category to test aggregation
                    "category_value": 1000.0,
                    "token_count": 1,
                    "percentage": 1.0,  # Will be recalculated
                }
            )

        with patch.object(
            self.query_service, "execute_query", return_value=large_mock_data
        ):
            start_time = datetime.now()
            summary = self.wallet_service.get_wallet_token_summary(
                db_session, wallet_address
            )
            end_time = datetime.now()

            # Should complete quickly even with large data
            execution_time = (end_time - start_time).total_seconds()
            assert execution_time < 1.0  # Should be very fast

            # Verify aggregation worked correctly
            assert summary["total_value"] == 100000.0  # 100 * 1000.0
            assert summary["token_count"] == 100

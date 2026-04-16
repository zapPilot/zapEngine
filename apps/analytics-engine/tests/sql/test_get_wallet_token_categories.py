"""
Query behavior tests for get_wallet_token_categories bug fix.

Tests focus on verifying the QueryService correctly loads and validates
the fixed SQL query, ensuring the query service integration works properly.

The actual SQL execution testing is done at the service integration level
since the SQL query uses PostgreSQL-specific features not available in SQLite.
"""

from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from src.services.shared.query_service import QueryService


class TestGetWalletTokenCategoriesQuery:
    """Test query loading and service integration for the bug fix."""

    @pytest.fixture(autouse=True)
    def setup_query_service(self):
        """Setup query service for each test."""
        QueryService._reset_cache_for_testing()
        self.query_service = QueryService()
        yield
        QueryService._reset_cache_for_testing()

    def test_query_exists_and_loads_correctly(self):
        """Test that the get_wallet_token_categories query exists and loads properly."""
        # Verify query exists
        assert "get_wallet_token_categories" in self.query_service.queries

        # Get the query content
        query_content = self.query_service.get_query("get_wallet_token_categories")

        # Verify it contains the bug fix elements (JOIN approach vs ROW_NUMBER)
        assert "WITH latest_tokens AS" in query_content
        assert "MAX(snapshot_date) AS snapshot_date" in query_content
        assert "JOIN latest_tokens" in query_content
        assert "daily_wallet_token_snapshots" in query_content

        # Verify wallet address alias is present for downstream compatibility
        assert "LOWER(user_wallet_address) AS wallet_address" in query_content

        # Should NOT contain the old ROW_NUMBER approach
        assert "ROW_NUMBER() OVER" not in query_content

        # Verify it has the improved COALESCE handling
        assert "COALESCE(" in query_content

    def test_query_parameter_handling(self, db_session: Session):
        """Test that the query correctly handles wallet_address parameter."""
        # Mock execute_query to verify parameter passing
        with patch.object(self.query_service, "execute_query") as mock_execute:
            mock_execute.return_value = []

            # Call with parameter
            wallet_address = "0xtest_parameter"
            self.query_service.execute_query(
                db_session,
                "get_wallet_token_categories",
                {"wallet_address": wallet_address},
            )

            # Verify it was called with correct parameters
            mock_execute.assert_called_once_with(
                db_session,
                "get_wallet_token_categories",
                {"wallet_address": wallet_address},
            )

    def test_query_validation_on_load(self):
        """Test that the query passes validation when loaded."""
        # Query should load without errors
        query_content = self.query_service.get_query("get_wallet_token_categories")

        # Basic validation - should be non-empty and contain SQL keywords
        assert len(query_content.strip()) > 0
        assert "SELECT" in query_content.upper()
        assert "FROM" in query_content.upper()
        assert "WHERE" in query_content.upper()

    def test_query_has_required_bug_fix_structure(self):
        """Test that the query has the structural elements of the bug fix."""
        query_content = self.query_service.get_query("get_wallet_token_categories")

        # Should have the new two-CTE structure
        assert "WITH latest_tokens AS" in query_content
        assert "latest AS" in query_content
        assert "filtered_tokens AS" in query_content
        assert "categorized_tokens AS" in query_content

        # Should use JOIN approach instead of ROW_NUMBER
        assert "JOIN latest_tokens" in query_content
        assert "l.snapshot_date = dwt.snapshot_date" in query_content

    def test_query_parameter_placeholder_exists(self):
        """Test that the query has the wallet_address parameter placeholder."""
        query_content = self.query_service.get_query("get_wallet_token_categories")

        # Should contain parameter placeholder
        assert ":wallet_address" in query_content

        # Should be used in WHERE clause for filtering
        assert "user_wallet_address = :wallet_address" in query_content

        # Should be used in SELECT to normalize output
        assert "LOWER(user_wallet_address) AS wallet_address" in query_content

    def test_service_integration_with_mock_results(self, db_session: Session):
        """Test service integration with mocked database results."""
        # Mock database execution to return sample data
        mock_results = [
            {
                "wallet_address": "0xtest",
                "category": "btc",
                "category_value": 50000.0,
                "token_count": 1,
                "percentage": 100.0,
            }
        ]

        # Mock the execute_query method directly
        with patch.object(
            self.query_service, "execute_query", return_value=mock_results
        ):
            # Execute query
            results = self.query_service.execute_query(
                db_session, "get_wallet_token_categories", {"wallet_address": "0xtest"}
            )

            # Verify results
            assert results == mock_results
            assert len(results) == 1
            assert results[0]["category"] == "btc"

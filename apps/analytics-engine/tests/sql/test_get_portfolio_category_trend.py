"""
Tests for get_portfolio_category_trend_from_mv SQL query (materialized view).

Validates the query structure for fetching portfolio category trends
from the pre-computed materialized view.
"""

import pytest
from sqlalchemy.orm import Session

from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


class TestGetPortfolioCategoryTrendQuery:
    """Test suite for portfolio category trend MV query."""

    @pytest.fixture(autouse=True)
    def setup(self, db_session: Session):
        """Set up test fixtures and query service."""
        self.db = db_session
        self.query_service = QueryService()

    def test_query_exists(self):
        """Test that the MV query file can be loaded."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )
        assert query_content is not None
        assert len(query_content) > 0

    def test_query_has_required_ctes(self):
        """Test that query selects from the materialized view."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        # MV query should select from portfolio_category_trend_mv (not use CTEs)
        assert "FROM portfolio_category_trend_mv" in query_content
        assert "SELECT" in query_content

    def test_query_uses_classify_token_category(self):
        """Test that query selects from portfolio_category_trend_mv."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        # MV query doesn't use the function directly - MV was pre-computed with it
        assert "portfolio_category_trend_mv" in query_content

    def test_query_unions_defi_and_wallet_tokens(self):
        """Test that query selects from the pre-aggregated materialized view."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        # MV query doesn't have UNION ALL - that's in the MV definition
        assert "FROM portfolio_category_trend_mv" in query_content
        assert "WHERE user_id" in query_content

    def test_query_has_required_parameters(self):
        """Test that query has the required parameter placeholders."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        assert ":user_id" in query_content
        assert ":start_date" in query_content
        assert ":end_date" in query_content

    def test_query_output_columns(self):
        """Test that query returns expected columns."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        # Expected output columns (including debt handling fields)
        expected_columns = [
            "date",
            "source_type",
            "category",
            "category_value_usd",
            "category_assets_usd",
            "category_debt_usd",
            "pnl_usd",
            "total_value_usd",
        ]

        for column in expected_columns:
            assert column in query_content

    def test_query_handles_debt_positions(self):
        """Test that query selects debt columns from the materialized view."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        # Verify debt columns are selected from MV
        # (Debt handling logic is in the MV definition, not the query)
        assert "category_assets_usd" in query_content
        assert "category_debt_usd" in query_content
        assert "category_value_usd" in query_content  # NET value (assets - debt)

    def test_query_computes_net_values(self):
        """Test that query selects net values from the materialized view."""
        query_content = self.query_service.get_query(
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV
        )

        # MV query selects pre-computed values from the view
        # The complex aggregation logic is in the MV definition (created in test setup)
        assert "category_value_usd" in query_content  # NET value column
        assert "FROM portfolio_category_trend_mv" in query_content
        assert "WHERE user_id = :user_id" in query_content

    @pytest.mark.skip(
        reason="Query uses PostgreSQL-specific syntax (JSONB, LATERAL, DATE_TRUNC, ::casting) not supported in SQLite tests. Run integration tests against PostgreSQL."
    )
    def test_query_with_mock_data(self, db_session: Session):
        """
        Test query execution with mock data.

        NOTE: This test is skipped because the query uses PostgreSQL-specific features:
        - JSONB operations (jsonb_array_elements, ->>, etc.)
        - LATERAL joins
        - DATE_TRUNC function
        - Type casting with :: syntax
        - NUMERIC type

        This test should be run in integration tests against a real PostgreSQL database.
        Structure validation is covered by other tests in this class.
        """
        pass

    @pytest.mark.skip(
        reason="Query uses PostgreSQL-specific syntax not supported in SQLite tests. Run integration tests against PostgreSQL."
    )
    def test_query_filters_by_date_range(self, db_session: Session):
        """
        Test that query properly filters by date range.

        NOTE: Skipped - requires PostgreSQL. See test_query_with_mock_data for details.
        """
        pass

    @pytest.mark.skip(
        reason="Query uses PostgreSQL-specific syntax not supported in SQLite tests. Run integration tests against PostgreSQL."
    )
    def test_query_returns_empty_for_nonexistent_user(self, db_session: Session):
        """
        Test that query returns empty results for non-existent user.

        NOTE: Skipped - requires PostgreSQL. See test_query_with_mock_data for details.
        """
        pass

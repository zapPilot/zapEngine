from unittest.mock import MagicMock, patch

from src.services.shared.query_service import QueryService


class TestQueryServiceCoverageGaps:
    def test_load_queries_no_sql_files(self):
        """Test _load_queries when directory exists but has no sql files."""
        service = QueryService()

        # Mock Path.glob to return empty list
        with (
            patch("pathlib.Path.glob", return_value=[]),
            patch("pathlib.Path.exists", return_value=True),
        ):
            # Reset cache to force reload logic (if we were calling init, but here calling method directly)
            queries = service._load_queries()
            assert queries == {}

    def test_execute_query_substitution(self):
        """Test execute_query substitutes query for 'get_portfolio_category_trend_from_mv' in non-prod."""
        service = QueryService()
        mock_db = MagicMock()

        # Mock queries directly on instance
        original_query = "SELECT * FROM mv"
        fallback_query = "SELECT * FROM fallback"
        service.queries = {
            "get_portfolio_category_trend_from_mv": original_query,
            "get_portfolio_category_trend_by_user_id": fallback_query,
        }

        # Ensure we are not in production
        # settings.environment should be 'test' or similar usually

        with patch.object(service, "get_query", return_value=original_query):
            service._execute(
                mock_db, "get_portfolio_category_trend_from_mv", {}, single=False
            )

            # Verify DB executed the fallback query
            # db.execute argument matching
            args, _ = mock_db.execute.call_args
            executed_sql = str(args[0])
            assert executed_sql == fallback_query

    def test_prepare_query_compatibility(self):
        """Test _prepare_query returns TextClause."""
        service = QueryService()
        res = service._prepare_query("SELECT 1")
        assert str(res) == "SELECT 1"

from unittest.mock import MagicMock, patch

import pytest

from src.core.config import Environment, settings
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

    @pytest.mark.parametrize(
        "environment",
        [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION],
    )
    def test_execute_query_never_substitutes_mv_query(self, environment, monkeypatch):
        """MV vs runtime routing belongs to TrendAnalysisService, not to the environment.

        The runtime 5-CTE query costs seconds; substituting it here made every
        non-production deployment pay that cost for bundle requests.
        """
        monkeypatch.setattr(settings, "environment", environment)

        service = QueryService()
        mock_db = MagicMock()

        mv_query = "SELECT * FROM mv"
        service.queries = {
            "get_portfolio_category_trend_from_mv": mv_query,
            "get_portfolio_category_trend_by_user_id": "SELECT * FROM fallback",
        }

        service._execute(
            mock_db, "get_portfolio_category_trend_from_mv", {}, single=False
        )

        args, _ = mock_db.execute.call_args
        assert str(args[0]) == mv_query

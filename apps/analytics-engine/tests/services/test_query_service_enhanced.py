"""
Test suite for the enhanced QueryService functionality.

Tests the new features: caching, validation, pathlib usage, and new utility methods.
"""

from datetime import UTC, date, datetime
from unittest.mock import patch
from uuid import UUID

import pytest

from src.services.shared.query_service import QueryService, get_query_service


class TestEnhancedQueryService:
    """Test enhanced QueryService features"""

    @pytest.fixture(autouse=True)
    def reset_cache(self):
        """Reset cache before each test"""
        QueryService._reset_cache_for_testing()
        yield
        QueryService._reset_cache_for_testing()

    def test_query_service_loads_real_queries(self):
        """Test that QueryService loads real SQL files"""
        service = QueryService()

        # Should load real queries from the project
        assert len(service.queries) > 0
        assert isinstance(service.queries, dict)

        # Check for some expected queries based on the SQL files we saw
        available_queries = service.list_available_queries()
        assert len(available_queries) > 0
        assert isinstance(available_queries, list)
        assert all(isinstance(q, str) for q in available_queries)

    def test_query_service_caching(self):
        """Test that multiple instances share cache"""
        service1 = QueryService()
        service2 = QueryService()

        # Both should reference the same cache
        assert service1.queries is service2.queries
        assert QueryService._cache_initialized is True

    def test_get_query_count(self):
        """Test getting query count"""
        service = QueryService()
        count = service.get_query_count()

        assert isinstance(count, int)
        assert count > 0
        assert count == len(service.queries)

    def test_list_available_queries(self):
        """Test listing available queries"""
        service = QueryService()
        queries = service.list_available_queries()

        assert isinstance(queries, list)
        assert len(queries) > 0
        assert queries == sorted(queries)  # Should be sorted

    def test_get_query_with_real_query(self):
        """Test getting a real query"""
        service = QueryService()
        available_queries = service.list_available_queries()

        if available_queries:
            first_query = available_queries[0]
            query_content = service.get_query(first_query)

            assert isinstance(query_content, str)
            assert len(query_content.strip()) > 0

    def test_get_query_not_found_error_message(self):
        """Test descriptive error message for missing query"""
        service = QueryService()

        with pytest.raises(ValueError) as exc_info:
            service.get_query("nonexistent_query")

        error_msg = str(exc_info.value)
        assert "nonexistent_query" in error_msg
        assert "Available queries:" in error_msg

    def test_get_query_empty_name(self):
        """Test error handling for empty query name"""
        service = QueryService()

        with pytest.raises(ValueError, match="Query name cannot be empty"):
            service.get_query("")

    def test_refresh_queries(self):
        """Test query refresh functionality"""
        service = QueryService()
        initial_count = service.get_query_count()

        # Refresh should reload queries
        service.refresh_queries()

        # Should still have queries (same ones in this case)
        assert service.get_query_count() == initial_count
        assert QueryService._cache_initialized is True

    def test_schema_removal_in_test_environment(self):
        """Test that schema prefixes are removed in test environment"""
        service = QueryService()

        # Mock a query with schema prefix
        with (
            patch.object(
                service, "queries", {"test_query": "SELECT * FROM alpha_raw.users"}
            ),
            patch("src.core.config.settings.environment") as mock_env,
        ):
            mock_env.value = "test"
            result = service.get_query("test_query")
            assert "alpha_raw." not in result
            assert result == "SELECT * FROM users"

    def test_schema_preserved_in_production(self):
        """Test that schema prefixes are preserved in production"""
        service = QueryService()

        # Mock a query with schema prefix
        with (
            patch.object(
                service, "queries", {"prod_query": "SELECT * FROM alpha_raw.users"}
            ),
            patch("src.core.config.settings.environment") as mock_env,
        ):
            mock_env.value = "production"
            result = service.get_query("prod_query")
            assert "alpha_raw." in result
            assert result == "SELECT * FROM alpha_raw.users"

    def test_singleton_function(self):
        """Test global singleton function"""
        service1 = get_query_service()
        service2 = get_query_service()

        # Should be the same instance
        assert service1 is service2
        assert isinstance(service1, QueryService)

    def test_cache_reset_for_testing(self):
        """Test cache reset functionality"""
        # Initialize cache
        QueryService()
        assert len(QueryService._query_cache) > 0
        assert QueryService._cache_initialized is True

        # Reset cache
        QueryService._reset_cache_for_testing()
        assert len(QueryService._query_cache) == 0
        assert QueryService._cache_initialized is False

    @pytest.mark.asyncio
    async def test_fetch_time_range_query_builds_params(self):
        """fetch_time_range_query forwards normalized params to execute_query."""
        service = QueryService()
        user_id = UUID("5fc63d4e-4e07-47d8-840b-ccd3420d553f")
        start_date = datetime(2025, 11, 1, tzinfo=UTC)
        end_date = datetime(2025, 11, 8, tzinfo=UTC)

        with patch.object(
            service, "execute_query", return_value=[{"rows": 1}]
        ) as mock_execute:
            result = await service.fetch_time_range_query(
                db="session",
                query_name="get_portfolio_daily_yield",
                user_id=user_id,
                start_date=start_date,
                end_date=end_date,
                limit=25,
                extra_params={"foo": "bar"},
            )

        mock_execute.assert_called_once_with(
            "session",
            "get_portfolio_daily_yield",
            {
                "user_id": str(user_id),
                "start_date": start_date,
                "end_date": end_date,
                "limit": 25,
                "wallet_address": None,
                "foo": "bar",
            },
        )
        assert result == [{"rows": 1}]

    @pytest.mark.asyncio
    async def test_fetch_time_range_query_optional_params(self):
        """Optional args should be excluded when not provided."""
        service = QueryService()
        start_date = datetime(2025, 11, 1, 12, 0, tzinfo=UTC)

        with patch.object(service, "execute_query", return_value=[]) as mock_execute:
            result = await service.fetch_time_range_query(
                db="session",
                query_name="get_portfolio_daily_yield",
                user_id="user-123",
                start_date=start_date,
            )

        mock_execute.assert_called_once_with(
            "session",
            "get_portfolio_daily_yield",
            {
                "user_id": "user-123",
                "start_date": start_date,
                "wallet_address": None,
            },
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_fetch_time_range_query_coerces_date_params(self):
        """Date inputs should be coerced to midnight datetimes."""
        service = QueryService()
        start_date = date(2025, 11, 1)
        end_date = date(2025, 11, 8)

        with patch.object(service, "execute_query", return_value=[]) as mock_execute:
            result = await service.fetch_time_range_query(
                db="session",
                query_name="get_portfolio_daily_yield",
                user_id="user-123",
                start_date=start_date,
                end_date=end_date,
            )

        mock_execute.assert_called_once_with(
            "session",
            "get_portfolio_daily_yield",
            {
                "user_id": "user-123",
                "start_date": datetime(2025, 11, 1, 0, 0),
                "end_date": datetime(2025, 11, 8, 0, 0),
                "wallet_address": None,
            },
        )
        assert result == []

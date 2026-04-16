"""
Comprehensive test suite for QueryService - targeting low coverage areas

Focuses on testing error conditions, file validation, SQL execution,
and edge cases that aren't covered by the existing enhanced tests.
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from src.services.shared.query_service import QueryService, get_query_service


class TestQueryServiceValidation:
    """Test query loading and validation functionality"""

    @pytest.fixture(autouse=True)
    def reset_cache(self):
        """Reset cache before each test"""
        QueryService._reset_cache_for_testing()
        yield
        QueryService._reset_cache_for_testing()

    def test_load_queries_missing_directory(self):
        """Test error when SQL queries directory doesn't exist"""
        with patch("pathlib.Path.exists", return_value=False):
            with pytest.raises(FileNotFoundError) as exc_info:
                QueryService()

            error_msg = str(exc_info.value)
            assert "SQL queries directory not found" in error_msg
            assert "Ensure the directory exists and contains .sql files" in error_msg

    def test_load_queries_empty_directory(self):
        """Test warning when SQL directory exists but has no .sql files"""
        with (
            patch("pathlib.Path.exists", return_value=True),
            patch("pathlib.Path.glob", return_value=[]),
            patch(
                "src.services.shared.query_service.QueryService._load_queries"
            ) as mock_load,
        ):
            mock_load.return_value = {}
            service = QueryService()
            assert len(service.queries) == 0

    def test_load_and_validate_sql_file_empty_file(self):
        """Test error handling for empty SQL files"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as tf:
            tf.write("")  # Empty file
            tf.flush()

            try:
                service = QueryService()
                sql_path = Path(tf.name)

                with pytest.raises(ValueError) as exc_info:
                    service._load_and_validate_sql_file(sql_path)

                error_msg = str(exc_info.value)
                assert "is empty" in error_msg
            finally:
                os.unlink(tf.name)

    def test_load_and_validate_sql_file_only_comments(self):
        """Test error handling for SQL files with only comments"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as tf:
            tf.write("-- This is just a comment\n-- Another comment\n   \n")
            tf.flush()

            try:
                service = QueryService()
                sql_path = Path(tf.name)

                with pytest.raises(ValueError) as exc_info:
                    service._load_and_validate_sql_file(sql_path)

                error_msg = str(exc_info.value)
                assert "contains no executable SQL statements" in error_msg
            finally:
                os.unlink(tf.name)

    def test_load_and_validate_sql_file_invalid_syntax(self):
        """Test error handling for SQL files with invalid syntax"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as tf:
            tf.write("SELECT * FROM WHERE;")  # Invalid SQL syntax
            tf.flush()

            try:
                service = QueryService()
                sql_path = Path(tf.name)

                # Mock text() to raise an exception for invalid SQL
                with patch(
                    "src.services.shared.query_service.text",
                    side_effect=Exception("Invalid SQL"),
                ):
                    with pytest.raises(ValueError) as exc_info:
                        service._load_and_validate_sql_file(sql_path)

                    error_msg = str(exc_info.value)
                    assert "Invalid SQL syntax" in error_msg
            finally:
                os.unlink(tf.name)

    def test_load_and_validate_sql_file_unicode_decode_error(self):
        """Test error handling for files with invalid encoding"""
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".sql", delete=False) as tf:
            tf.write(b"\xff\xfe")  # Invalid UTF-8 bytes
            tf.flush()

            try:
                service = QueryService()
                sql_path = Path(tf.name)

                with pytest.raises(OSError) as exc_info:
                    service._load_and_validate_sql_file(sql_path)

                error_msg = str(exc_info.value)
                assert "Cannot decode" in error_msg
                assert "UTF-8" in error_msg
            finally:
                os.unlink(tf.name)

    def test_load_and_validate_sql_file_permission_error(self):
        """Test error handling for files with permission issues"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as tf:
            tf.write("SELECT 1;")
            tf.flush()

            try:
                # Make file unreadable
                os.chmod(tf.name, 0o000)

                service = QueryService()
                sql_path = Path(tf.name)

                with pytest.raises(OSError) as exc_info:
                    service._load_and_validate_sql_file(sql_path)

                error_msg = str(exc_info.value)
                assert "Permission denied" in error_msg
            finally:
                # Restore permissions and clean up
                os.chmod(tf.name, 0o644)
                os.unlink(tf.name)

    def test_load_queries_with_file_loading_error(self):
        """Test error handling during SQL file loading process"""
        with (
            patch("pathlib.Path.exists", return_value=True),
            patch("pathlib.Path.glob") as mock_glob,
        ):
            # Mock a file that will cause an error
            mock_file = Mock()
            mock_file.stem = "test_query"
            mock_file.name = "test_query.sql"
            mock_file.read_text.side_effect = OSError("Test error")
            mock_glob.return_value = [mock_file]

            with pytest.raises(OSError) as exc_info:
                QueryService()

            error_msg = str(exc_info.value)
            assert "Failed to load query from test_query.sql" in error_msg
            assert "Check file permissions and SQL syntax" in error_msg


class TestQueryServiceExecution:
    """Test query execution functionality"""

    @pytest.fixture(autouse=True)
    def reset_cache(self):
        """Reset cache before each test"""
        QueryService._reset_cache_for_testing()
        yield
        QueryService._reset_cache_for_testing()

    def test_execute_query_database_error(self, db_session):
        """Test error handling during database query execution"""
        service = QueryService()

        # Mock a query that exists but will cause DB error
        with patch.object(
            service, "queries", {"failing_query": "SELECT * FROM nonexistent_table"}
        ):
            with pytest.raises(SQLAlchemyError) as exc_info:
                service.execute_query(db_session, "failing_query")

            error_msg = str(exc_info.value)
            assert "Database error executing query 'failing_query'" in error_msg
            assert "Check query syntax and database connectivity" in error_msg

    def test_execute_query_one_database_error(self, db_session):
        """Test error handling during single-result query execution"""
        service = QueryService()

        # Mock a query that exists but will cause DB error
        with patch.object(
            service, "queries", {"failing_query": "SELECT * FROM nonexistent_table"}
        ):
            with pytest.raises(SQLAlchemyError) as exc_info:
                service.execute_query_one(db_session, "failing_query")

            error_msg = str(exc_info.value)
            assert (
                "Database error executing single-result query 'failing_query'"
                in error_msg
            )
            assert "Check query syntax and database connectivity" in error_msg

    def test_execute_query_unexpected_error(self, db_session):
        """Test handling of unexpected errors during query execution"""
        service = QueryService()

        with (
            patch.object(service, "queries", {"test_query": "SELECT 1"}),
            patch(
                "src.services.shared.query_service.text",
                side_effect=RuntimeError("Unexpected error"),
            ),
        ):
            with pytest.raises(RuntimeError) as exc_info:
                service.execute_query(db_session, "test_query")

            error_msg = str(exc_info.value)
            assert "Unexpected error executing query 'test_query'" in error_msg
            assert "Check query parameters and database state" in error_msg

    def test_execute_query_one_unexpected_error(self, db_session):
        """Test handling of unexpected errors during single-result query execution"""
        service = QueryService()

        with (
            patch.object(service, "queries", {"test_query": "SELECT 1"}),
            patch(
                "src.services.shared.query_service.text",
                side_effect=RuntimeError("Unexpected error"),
            ),
        ):
            with pytest.raises(RuntimeError) as exc_info:
                service.execute_query_one(db_session, "test_query")

            error_msg = str(exc_info.value)
            assert (
                "Unexpected error executing single-result query 'test_query'"
                in error_msg
            )
            assert "Check query parameters and database state" in error_msg

    def test_execute_query_with_parameters(self, db_session):
        """Test query execution with parameters"""
        service = QueryService()

        with patch.object(
            service, "queries", {"param_query": "SELECT :value as result"}
        ):
            result = service.execute_query(db_session, "param_query", {"value": 42})

            assert len(result) == 1
            assert result[0]["result"] == 42

    def test_execute_query_one_returns_none(self, db_session):
        """Test execute_query_one returning None for no results"""
        service = QueryService()

        with patch.object(service, "queries", {"empty_query": "SELECT 1 WHERE 1=0"}):
            result = service.execute_query_one(db_session, "empty_query")

            assert result is None

    def test_execute_query_one_returns_single_result(self, db_session):
        """Test execute_query_one returning single result"""
        service = QueryService()

        with patch.object(service, "queries", {"single_query": "SELECT 42 as answer"}):
            result = service.execute_query_one(db_session, "single_query")

            assert result is not None
            assert result["answer"] == 42


class TestQueryServiceUtilities:
    """Test utility methods and edge cases"""

    @pytest.fixture(autouse=True)
    def reset_cache(self):
        """Reset cache before each test"""
        QueryService._reset_cache_for_testing()
        yield
        QueryService._reset_cache_for_testing()

    def test_refresh_queries_clears_and_reloads(self):
        """Test that refresh_queries properly clears cache and reloads"""
        service = QueryService()
        initial_queries = service.queries.copy()

        # Modify cache directly
        QueryService._query_cache["test_query"] = "SELECT 1"
        assert "test_query" in service.queries

        # Refresh should reload from filesystem
        service.refresh_queries()

        # Should not have the manually added query
        assert "test_query" not in service.queries
        # Should have the original queries
        for key in initial_queries:
            assert key in service.queries

    def test_get_query_with_none_parameter(self):
        """Test get_query with None parameter"""
        service = QueryService()

        with pytest.raises(ValueError, match="Query name cannot be empty"):
            service.get_query(None)

    def test_execute_query_with_none_parameters(self, db_session):
        """Test execute_query handles None parameters correctly"""
        service = QueryService()

        with patch.object(service, "queries", {"simple_query": "SELECT 1 as one"}):
            result = service.execute_query(db_session, "simple_query", None)

            assert len(result) == 1
            assert result[0]["one"] == 1

    def test_execute_query_one_with_none_parameters(self, db_session):
        """Test execute_query_one handles None parameters correctly"""
        service = QueryService()

        with patch.object(service, "queries", {"simple_query": "SELECT 1 as one"}):
            result = service.execute_query_one(db_session, "simple_query", None)

            assert result is not None
            assert result["one"] == 1


class TestQueryServiceSingleton:
    """Test singleton pattern and global instance management"""

    @pytest.fixture(autouse=True)
    def reset_global_instance(self):
        """Reset global instance before each test"""
        # Clear global instance
        import src.services.shared.query_service

        src.services.shared.query_service._query_service_instance = None
        QueryService._reset_cache_for_testing()
        yield
        src.services.shared.query_service._query_service_instance = None
        QueryService._reset_cache_for_testing()

    def test_get_query_service_singleton_pattern(self):
        """Test that get_query_service follows singleton pattern"""
        service1 = get_query_service()
        service2 = get_query_service()

        assert service1 is service2
        assert isinstance(service1, QueryService)

    def test_get_query_service_creates_instance_on_first_call(self):
        """Test that get_query_service creates instance on first call"""
        import src.services.shared.query_service

        # Verify no instance exists initially
        assert src.services.shared.query_service._query_service_instance is None

        service = get_query_service()

        # Should create and store instance
        assert src.services.shared.query_service._query_service_instance is not None
        assert src.services.shared.query_service._query_service_instance is service


class TestQueryServiceLogging:
    """Test logging functionality"""

    @pytest.fixture(autouse=True)
    def reset_cache(self):
        """Reset cache before each test"""
        QueryService._reset_cache_for_testing()
        yield
        QueryService._reset_cache_for_testing()

    def test_logger_configuration(self):
        """Test that logger is properly configured"""
        service = QueryService()

        assert hasattr(service, "logger")
        assert service.logger.name == "src.services.shared.query_service.QueryService"

    def test_execute_query_debug_logging(self, db_session):
        """Test debug logging during query execution"""
        service = QueryService()

        with (
            patch.object(service, "queries", {"debug_query": "SELECT 42 as result"}),
            patch.object(service.logger, "debug") as mock_debug,
        ):
            service.execute_query(db_session, "debug_query", {"param": "value"})

            # Should log query execution with parameter count
            mock_debug.assert_any_call(
                "Executing %s '%s' with %d parameters", "query", "debug_query", 1
            )
            # Should log result count
            mock_debug.assert_any_call("Query '%s' returned %d rows", "debug_query", 1)

    def test_execute_query_one_debug_logging(self, db_session):
        """Test debug logging during single-result query execution"""
        service = QueryService()

        with (
            patch.object(
                service, "queries", {"single_debug_query": "SELECT 42 as result"}
            ),
            patch.object(service.logger, "debug") as mock_debug,
        ):
            service.execute_query_one(db_session, "single_debug_query")

            # Should log single-result query execution
            mock_debug.assert_any_call(
                "Executing %s '%s' with %d parameters",
                "single-result query",
                "single_debug_query",
                0,
            )
            # Should log result
            mock_debug.assert_any_call(
                "Query '%s' returned 1 row", "single_debug_query"
            )

    def test_execute_query_one_no_results_logging(self, db_session):
        """Test logging when single-result query returns no results"""
        service = QueryService()

        with (
            patch.object(service, "queries", {"empty_query": "SELECT 1 WHERE 1=0"}),
            patch.object(service.logger, "debug") as mock_debug,
        ):
            result = service.execute_query_one(db_session, "empty_query")

            assert result is None
            mock_debug.assert_any_call("Query '%s' returned no rows", "empty_query")

    def test_get_query_schema_removal_logging(self):
        """Test logging when schema prefixes are removed"""
        service = QueryService()

        with (
            patch.object(
                service, "queries", {"schema_query": "SELECT * FROM alpha_raw.users"}
            ),
            patch.object(service.logger, "debug") as mock_debug,
            patch("src.services.shared.query_service.settings") as mock_settings,
        ):
            # Mock settings to be in test environment
            mock_settings.ENVIRONMENT = "test"
            result = service.get_query("schema_query")

            assert "alpha_raw." not in result
            mock_debug.assert_called_with(
                "Removed schema prefix from query '%s' for test environment",
                "schema_query",
            )

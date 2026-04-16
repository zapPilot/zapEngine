"""
Query Service - Centralized SQL Query Execution

Handles loading and executing parameterized SQL queries from the /queries/sql directory.
Provides query caching, startup validation, and modern file handling patterns.
"""

import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any, ClassVar, Literal, overload
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import TextClause

from src.core.config import Environment, settings
from src.core.utils import coerce_date_to_datetime, row_to_dict


class QueryService:
    """Manages loading and execution of SQL queries.

    Features:
    - Query caching for performance
    - Startup validation of SQL syntax
    - Modern pathlib-based file handling
    - Comprehensive error handling with descriptive messages
    - Logging for debugging and monitoring
    """

    # Class-level cache for queries (shared across instances)
    _query_cache: ClassVar[dict[str, str]] = {}
    _cache_initialized: ClassVar[bool] = False

    def __init__(self) -> None:
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

        # Use class-level cache if already initialized, otherwise load queries
        if not QueryService._cache_initialized:
            QueryService._query_cache = self._load_queries()
            QueryService._cache_initialized = True
            self.logger.info(
                "Loaded %d queries from SQL directory",
                len(QueryService._query_cache),
            )

        # Instance reference to class cache for compatibility
        self.queries = QueryService._query_cache

    def _load_queries(self) -> dict[str, str]:
        """Load and validate all .sql files from the queries directory.

        Returns:
            dict: Mapping of query names to SQL content

        Raises:
            FileNotFoundError: If queries directory doesn't exist
            IOError: If unable to read SQL files
            ValueError: If SQL files contain invalid syntax
        """
        queries: dict[str, str] = {}

        query_dir = self._resolve_query_dir()

        if not query_dir.exists():
            raise FileNotFoundError(
                f"SQL queries directory not found: {query_dir}. "
                "Ensure the directory exists and contains .sql files."
            )

        # Use glob pattern for file discovery
        sql_files = list(query_dir.glob("*.sql"))

        if not sql_files:
            self.logger.warning("No SQL files found in directory: %s", query_dir)
            return queries

        # Load each SQL file with proper error handling
        for sql_file in sql_files:
            try:
                query_content = self._load_and_validate_sql_file(sql_file)
                query_name = sql_file.stem  # filename without extension
                queries[query_name] = query_content
                self.logger.debug(
                    "Loaded query '%s' from %s", query_name, sql_file.name
                )

            except Exception as e:
                error_msg = (
                    f"Failed to load query from {sql_file.name}: {e}. "
                    "Check file permissions and SQL syntax."
                )
                self.logger.error(error_msg)
                raise OSError(error_msg) from e

        self.logger.info("Successfully loaded %d SQL queries", len(queries))
        return queries

    @staticmethod
    def _resolve_query_dir() -> Path:
        """Resolve the SQL query directory regardless of service module depth."""
        file_path = Path(__file__).resolve()

        for parent in file_path.parents:
            candidate = parent / "src" / "queries" / "sql"
            if candidate.exists():
                return candidate

        # Preserve previous error behavior with a deterministic fallback path
        return file_path.parents[2] / "src" / "queries" / "sql"

    def _load_and_validate_sql_file(self, sql_file: Path) -> str:
        """Load and validate a single SQL file.

        Args:
            sql_file: Path to the SQL file

        Returns:
            str: SQL content

        Raises:
            IOError: If file cannot be read
            ValueError: If SQL content is invalid
        """
        try:
            # Read file with UTF-8 encoding
            content = sql_file.read_text(encoding="utf-8").strip()

            if not content:
                raise ValueError(f"SQL file {sql_file.name} is empty")

            # Basic SQL validation - ensure it's not just whitespace or comments
            content_lines = [
                line.strip()
                for line in content.split("\n")
                if line.strip() and not line.strip().startswith("--")
            ]

            if not content_lines:
                raise ValueError(
                    f"SQL file {sql_file.name} contains no executable SQL statements"
                )

            # Validate that we can create a SQLAlchemy text object (basic syntax check)
            try:
                text(content)
            except Exception as e:
                raise ValueError(f"Invalid SQL syntax in {sql_file.name}: {e}") from e

            return content

        except UnicodeDecodeError as e:
            raise OSError(
                f"Cannot decode {sql_file.name} as UTF-8: {e}. "
                "Ensure the file is saved with UTF-8 encoding."
            ) from e
        except PermissionError as e:
            raise OSError(
                f"Permission denied reading {sql_file.name}: {e}. "
                "Check file permissions."
            ) from e

    def get_query(self, query_name: str) -> str:
        """Retrieve a loaded SQL query by name.

        Args:
            query_name: Name of the query to retrieve

        Returns:
            str: SQL query content, with schema prefixes removed in test environment

        Raises:
            ValueError: If query is not found
        """
        if not query_name:
            raise ValueError("Query name cannot be empty")

        query: str | None = self.queries.get(query_name)
        if query is None:
            available_queries = list(self.queries.keys())
            error_msg = (
                f"Query '{query_name}' not found. "
                f"Available queries: {sorted(available_queries)} "
                f"(Total: {len(available_queries)})"
            )
            self.logger.error(error_msg)
            raise ValueError(error_msg)

        # If in test environment, remove the schema prefix to work with SQLite
        if settings.ENVIRONMENT == "test":
            query = query.replace("alpha_raw.", "")
            self.logger.debug(
                "Removed schema prefix from query '%s' for test environment",
                query_name,
            )

        return query

    def execute_query(
        self, db: Session, query_name: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Execute a SQL query and return all results."""
        return self._execute(db, query_name, params or {}, single=False)

    async def fetch_time_range_query(
        self,
        db: Session,
        query_name: str,
        user_id: UUID | str,
        start_date: datetime | date,
        end_date: datetime | date | None = None,
        *,
        limit: int | None = None,
        wallet_address: str | None = None,
        extra_params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Execute a query constrained to a date range.

        Args:
            db: Active database session.
            query_name: Registered SQL query identifier.
            user_id: Portfolio owner identifier (UUID or string).
            start_date: Inclusive period start.
            end_date: Exclusive period end. When omitted, callers may rely on
                query defaults (some queries only need a single date).
            limit: Optional row limit forwarded to SQL.
            wallet_address: Optional wallet filter. When None, returns all user wallets (bundle).
                When provided, filters to specific wallet address.
            extra_params: Additional query parameters merged into the payload.

        Returns:
            List of dictionaries produced by ``execute_query``.
        """

        params: dict[str, Any] = {
            "user_id": str(user_id),
            "start_date": coerce_date_to_datetime(start_date),
            "wallet_address": wallet_address,
        }

        if end_date is not None:
            params["end_date"] = coerce_date_to_datetime(end_date)

        if limit is not None:
            params["limit"] = limit

        if extra_params:
            params.update(extra_params)

        return self.execute_query(db, query_name, params)

    def execute_query_one(
        self, db: Session, query_name: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        """Execute a SQL query and return a single result."""
        return self._execute(db, query_name, params or {}, single=True)

    @overload
    def _execute(
        self,
        db: Session,
        query_name: str,
        params: dict[str, Any],
        *,
        single: Literal[True],
    ) -> dict[str, Any] | None: ...

    @overload
    def _execute(
        self,
        db: Session,
        query_name: str,
        params: dict[str, Any],
        *,
        single: Literal[False],
    ) -> list[dict[str, Any]]: ...

    def _execute(
        self,
        db: Session,
        query_name: str,
        params: dict[str, Any],
        *,
        single: bool,
    ) -> list[dict[str, Any]] | dict[str, Any] | None:
        """Shared execution pipeline for single/all result paths.

        Preserves logging and error messages expected by tests.
        """
        try:
            query_string = self._resolve_query_string(query_name)
            self._log_query_start(query_name, params, single=single)
            result = db.execute(text(query_string), params)

            if single:
                return self._execute_single_result(result, query_name)

            return self._execute_many_results(result, query_name)

        except SQLAlchemyError as e:
            msg = self._build_execute_error_message(
                query_name, e, single=single, unexpected=False
            )
            self.logger.error(msg)
            raise SQLAlchemyError(msg) from e
        except Exception as e:
            msg = self._build_execute_error_message(
                query_name, e, single=single, unexpected=True
            )
            self.logger.error(msg)
            raise RuntimeError(msg) from e

    def _resolve_query_string(self, query_name: str) -> str:
        """Resolve the final query string, including environment-specific overrides."""
        query_string = self.get_query(query_name)
        if (
            query_name == "get_portfolio_category_trend_from_mv"
            and settings.environment != Environment.PRODUCTION
        ):
            return self.queries.get(
                "get_portfolio_category_trend_by_user_id", query_string
            )
        return query_string

    def _log_query_start(
        self, query_name: str, params: dict[str, Any], *, single: bool
    ) -> None:
        label = "single-result query" if single else "query"
        self.logger.debug(
            "Executing %s '%s' with %d parameters", label, query_name, len(params)
        )

    def _execute_single_result(
        self, result: Any, query_name: str
    ) -> dict[str, Any] | None:
        first = result.first()
        if first:
            out = row_to_dict(first)
            self.logger.debug("Query '%s' returned 1 row", query_name)
            return out
        self.logger.debug("Query '%s' returned no rows", query_name)
        return None

    def _execute_many_results(
        self, result: Any, query_name: str
    ) -> list[dict[str, Any]]:
        rows = result.fetchall()
        out_list = [row_to_dict(row) for row in rows]
        self.logger.debug("Query '%s' returned %d rows", query_name, len(out_list))
        return out_list

    @staticmethod
    def _build_execute_error_message(
        query_name: str, error: Exception, *, single: bool, unexpected: bool
    ) -> str:
        error_type = "Unexpected error" if unexpected else "Database error"
        query_label = "single-result query" if single else "query"
        advice = (
            "Check query parameters and database state."
            if unexpected
            else "Check query syntax and database connectivity."
        )
        return f"{error_type} executing {query_label} '{query_name}': {error}. {advice}"

    def list_available_queries(self) -> list[str]:
        """List all available query names.

        Returns:
            list: Sorted list of available query names
        """
        return sorted(self.queries.keys())

    def get_query_count(self) -> int:
        """Get the total number of loaded queries.

        Returns:
            int: Number of loaded queries
        """
        return len(self.queries)

    def refresh_queries(self) -> None:
        """Reload all queries from the file system.

        This method clears the cache and reloads all SQL files.
        Useful for development when SQL files are modified.
        """
        self.logger.info("Refreshing query cache...")
        QueryService._query_cache.clear()
        QueryService._cache_initialized = False

        # Reload queries
        QueryService._query_cache = self._load_queries()
        QueryService._cache_initialized = True
        self.queries = QueryService._query_cache

        self.logger.info("Query cache refreshed with %d queries", len(self.queries))

    @classmethod
    def _reset_cache_for_testing(cls) -> None:
        """Reset the class-level cache for testing purposes.

        This method is intended for use in test environments only.
        It clears the cache and resets the initialization flag.
        """
        cls._query_cache.clear()
        cls._cache_initialized = False

    # Compatibility helper used by some integration tests to validate raw SQL strings
    def _prepare_query(self, query_content: str) -> TextClause:
        """Return SQLAlchemy text() for legacy tests expecting prepared statements."""
        return text(query_content)


# Global instance for easy access (singleton pattern)
_query_service_instance: QueryService | None = None


def get_query_service() -> QueryService:
    """Get the global QueryService instance (singleton pattern).

    Returns:
        QueryService: The global query service instance
    """
    global _query_service_instance
    if _query_service_instance is None:
        _query_service_instance = QueryService()
    return _query_service_instance

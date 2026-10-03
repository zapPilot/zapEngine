"""Retry behaviour for transient PostgreSQL disconnects in QueryService."""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from src.core.db_retry import is_transient_disconnect
from src.services.shared.query_service import QUERY_MAX_ATTEMPTS, QueryService


def build_disconnect(
    message: str = "SSL connection has been closed",
) -> OperationalError:
    return OperationalError(
        "SELECT 1", {}, Exception(message), connection_invalidated=True
    )


class TestIsTransientDisconnect:
    def test_flags_an_invalidated_connection(self):
        assert is_transient_disconnect(build_disconnect()) is True

    @pytest.mark.parametrize(
        "message",
        [
            "server didn't return client encoding",
            "SSL connection has been closed unexpectedly",
            "server closed the connection unexpectedly",
            "terminating connection due to administrator command",
        ],
    )
    def test_flags_known_disconnect_messages_without_the_flag(self, message):
        error = OperationalError(
            "SELECT 1", {}, Exception(message), connection_invalidated=False
        )
        assert is_transient_disconnect(error) is True

    def test_ignores_a_sql_programming_error(self):
        error = OperationalError(
            "SELECT 1",
            {},
            Exception('relation "nope" does not exist'),
            connection_invalidated=False,
        )
        assert is_transient_disconnect(error) is False

    def test_ignores_non_dbapi_errors(self):
        assert is_transient_disconnect(RuntimeError("boom")) is False


class TestQueryServiceDisconnectRetry:
    @pytest.fixture(autouse=True)
    def reset_cache(self):
        QueryService._reset_cache_for_testing()
        yield
        QueryService._reset_cache_for_testing()

    def test_retries_once_on_a_dropped_connection(self):
        service = QueryService()
        result = MagicMock()
        result.fetchall.return_value = []
        db = MagicMock()
        db.execute.side_effect = [build_disconnect(), result]

        with patch.object(service, "queries", {"q": "SELECT 1"}):
            rows = service.execute_query(db, "q")

        assert rows == []
        assert db.execute.call_count == QUERY_MAX_ATTEMPTS
        db.rollback.assert_called_once()

    def test_surfaces_a_second_disconnect(self):
        service = QueryService()
        db = MagicMock()
        db.execute.side_effect = build_disconnect()

        with patch.object(service, "queries", {"q": "SELECT 1"}):
            with pytest.raises(SQLAlchemyError):
                service.execute_query(db, "q")

        assert db.execute.call_count == QUERY_MAX_ATTEMPTS

    def test_does_not_retry_a_statement_error(self):
        service = QueryService()
        db = MagicMock()
        db.execute.side_effect = OperationalError(
            "SELECT 1",
            {},
            Exception('relation "nope" does not exist'),
            connection_invalidated=False,
        )

        with patch.object(service, "queries", {"q": "SELECT 1"}):
            with pytest.raises(SQLAlchemyError):
                service.execute_query(db, "q")

        assert db.execute.call_count == 1
        db.rollback.assert_not_called()

    def test_retry_rollback_failure_still_retries(self):
        service = QueryService()
        result = MagicMock()
        result.fetchall.return_value = []
        db = MagicMock()
        db.execute.side_effect = [build_disconnect(), result]
        db.rollback.side_effect = SQLAlchemyError("rollback failed")

        with patch.object(service, "queries", {"q": "SELECT 1"}):
            rows = service.execute_query(db, "q")

        assert rows == []
        assert db.execute.call_count == QUERY_MAX_ATTEMPTS

"""Unit tests for database instrumentation helpers."""

from unittest.mock import MagicMock

import pytest
from sqlalchemy.exc import SQLAlchemyError

from src.core.database_metrics import (
    PREPARED_STATEMENT_QUERY,
    prepared_statements_in_use,
    with_session_factory,
)


class TestPreparedStatementsInUse:
    """Tests for prepared_statements_in_use function."""

    def test_success_returns_count(self):
        """Verify successful query returns integer count."""
        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 5
        mock_session.execute.return_value = mock_result
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        result = prepared_statements_in_use(mock_factory)

        assert result == 5
        mock_session.execute.assert_called_once_with(PREPARED_STATEMENT_QUERY)

    def test_success_zero_statements(self):
        """Verify zero prepared statements returns 0."""
        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 0
        mock_session.execute.return_value = mock_result
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        result = prepared_statements_in_use(mock_factory)

        assert result == 0

    def test_sqlalchemy_error_returns_minus_one(self):
        """Verify SQLAlchemy error returns -1."""
        mock_session = MagicMock()
        mock_session.execute.side_effect = SQLAlchemyError("DB Error")
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        result = prepared_statements_in_use(mock_factory)

        assert result == -1

    def test_unexpected_exception_returns_minus_one(self):
        """Verify unexpected exception returns -1."""
        mock_session = MagicMock()
        mock_session.execute.side_effect = RuntimeError("Unexpected")
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        result = prepared_statements_in_use(mock_factory)

        assert result == -1

    def test_scalar_one_exception_returns_minus_one(self):
        """Verify scalar_one exception returns -1."""
        mock_session = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one.side_effect = Exception("Invalid result")
        mock_session.execute.return_value = mock_result
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        result = prepared_statements_in_use(mock_factory)

        assert result == -1


class TestWithSessionFactory:
    """Tests for with_session_factory function."""

    def test_returns_session_factory_when_available(self):
        """Verify returns factory when supplier provides one."""
        mock_factory = MagicMock()

        result = with_session_factory(lambda: mock_factory)

        assert result == mock_factory

    def test_raises_runtime_error_when_none(self):
        """Verify raises RuntimeError when supplier returns None."""
        with pytest.raises(RuntimeError) as exc_info:
            with_session_factory(lambda: None)

        assert "Database session factory is not initialized" in str(exc_info.value)
        assert "init_database()" in str(exc_info.value)

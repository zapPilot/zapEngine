"""
Comprehensive tests for database.py to improve coverage from 55% to 85%+

Tests all error scenarios, edge cases, and helper functions not covered by existing tests.
"""

from contextlib import nullcontext
from unittest.mock import Mock, patch

import pytest
from sqlalchemy import create_engine

from src.core.database import DatabaseManager, db_manager


class TestDatabaseManagerExtensive:
    """Extended DatabaseManager tests for edge cases"""

    def test_database_manager_init_with_custom_url(self):
        """Test DatabaseManager initialization with custom URL"""
        custom_url = "postgresql://test:test@localhost:5432/custom_db"
        manager = DatabaseManager(custom_url)
        assert manager.db_url == custom_url
        assert manager.engine is None
        assert manager.SessionLocal is None

    def test_postgresql_url_uses_psycopg2_default_driver(self):
        """Bare postgresql:// URLs should resolve to psycopg2."""
        engine = create_engine("postgresql://user:pass@localhost:5432/db")
        try:
            assert engine.dialect.driver == "psycopg2"
        finally:
            engine.dispose()

    def test_close_database_no_engine(self):
        """Test closing database when no engine exists"""
        manager = DatabaseManager("test://db")
        # Should not raise exception
        manager.close_database()

    def test_get_db_not_initialized(self):
        """Test get_db when database not initialized"""
        manager = DatabaseManager("test://db")
        with pytest.raises(RuntimeError, match="Database not initialized"):
            list(manager.get_db())

    def test_health_check_no_session(self):
        """Test health check when get_db yields no sessions"""
        manager = DatabaseManager("test://db")
        manager.SessionLocal = Mock()

        with patch.object(manager, "get_db", return_value=iter([])):
            result = manager.health_check()
            assert result is False

    def test_health_check_exception(self):
        """Test health check with database exception"""
        manager = DatabaseManager("test://db")

        with patch.object(manager, "get_db", side_effect=Exception("Database error")):
            result = manager.health_check()
            assert result is False

    def test_prepared_statements_success(self):
        """Test prepared statements check success"""
        manager = DatabaseManager("test://db")
        mock_session = Mock()
        mock_session.__enter__ = Mock(return_value=mock_session)
        mock_session.__exit__ = Mock(return_value=None)
        mock_result = Mock()
        mock_result.scalar_one.return_value = 5
        mock_session.execute.return_value = mock_result

        manager.SessionLocal = lambda: nullcontext(mock_session)

        result = manager.prepared_statements_in_use()
        assert result == 5

    def test_prepared_statements_no_session(self):
        """Test prepared statements when no session yielded"""
        manager = DatabaseManager("test://db")
        failing_session = Mock()
        failing_session.__enter__ = Mock(return_value=failing_session)
        failing_session.__exit__ = Mock(return_value=None)
        failing_result = Mock()
        failing_result.scalar_one.side_effect = Exception("bad scalar")
        failing_session.execute.return_value = failing_result

        manager.SessionLocal = lambda: nullcontext(failing_session)

        result = manager.prepared_statements_in_use()
        assert result == -1

    def test_prepared_statements_exception(self):
        """Test prepared statements with database exception"""
        manager = DatabaseManager("test://db")

        with patch("src.core.database.logger") as mock_logger:
            result = manager.prepared_statements_in_use()
            assert result == -1
            mock_logger.debug.assert_called()


class TestGlobalDatabaseManager:
    """Test the global db_manager instance"""

    def test_global_db_manager_exists(self):
        """Test that global db_manager is properly initialized"""
        assert db_manager is not None
        assert isinstance(db_manager, DatabaseManager)
        assert db_manager.db_url is not None

    def test_global_functions_delegate_to_manager(self):
        """Test that global functions properly delegate to db_manager"""
        with patch.object(db_manager, "init_database") as mock_init:
            from src.core.database import init_database

            init_database()
            mock_init.assert_called_once()

        with patch.object(db_manager, "close_database") as mock_close:
            from src.core.database import close_database

            close_database()
            mock_close.assert_called_once()

        with patch.object(db_manager, "get_db") as mock_get_db:
            from src.core.database import get_db

            list(get_db())
            mock_get_db.assert_called_once()

        with patch.object(db_manager, "health_check", return_value=True) as mock_health:
            from src.core.database import health_check

            result = health_check()
            mock_health.assert_called_once()
            assert result is True

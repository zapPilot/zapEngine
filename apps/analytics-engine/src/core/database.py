"""
Simple SQLAlchemy configuration for Supabase PostgreSQL.

Provides helpers for both FastAPI dependencies and standalone scripts.
"""

import logging
from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

from src.core.config import settings
from src.core.connection_pool import ConnectionPoolConfig
from src.core.database_metrics import (
    prepared_statements_in_use as resolve_prepared_statements,
)
from src.core.database_metrics import (
    with_session_factory,
)

logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self, db_url: str) -> None:
        self.db_url = db_url
        self.engine: Engine | None = None
        self.SessionLocal: sessionmaker[Session] | None = None

    def init_database(self) -> None:
        """Initialize database connection with optimized pool settings for analytics workload."""
        # Connection pooling tuned for analytics workload characteristics:
        # - Read-heavy operations with long-running queries benefit from more base connections
        # - LIFO pattern improves PostgreSQL buffer cache hit rates
        # - Total pool capacity (30) is safe for PgBouncer transaction mode
        # - Explicit timeout prevents indefinite waits during traffic spikes
        connect_args: dict[str, str] = {}
        cli_options: list[str] = []

        if settings.db_idle_in_transaction_session_timeout_ms > 0:
            cli_options.append(
                f"-c idle_in_transaction_session_timeout="
                f"{settings.db_idle_in_transaction_session_timeout_ms}"
            )
        if settings.db_statement_timeout_ms > 0:
            cli_options.append(
                f"-c statement_timeout={settings.db_statement_timeout_ms}"
            )

        if cli_options:
            connect_args["options"] = " ".join(cli_options)

        # Create validated connection pool configuration from settings
        pool_config = ConnectionPoolConfig(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_pool_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_recycle=settings.db_pool_recycle,
            pool_use_lifo=True,  # LIFO improves cache locality
            pool_pre_ping=True,  # Verify connection health before use
        )

        self.engine = create_engine(
            self.db_url,
            echo=settings.debug,
            poolclass=QueuePool,
            **pool_config.to_engine_kwargs(),
            connect_args=connect_args,
        )

        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )

        if settings.is_read_only:
            logger.info("Database initialized in READ-ONLY mode")
        else:
            logger.warning(
                "Database initialized with WRITE access - ensure this is intentional"
            )

    def close_database(self) -> None:
        """Close database connections."""
        if self.engine:
            self.engine.dispose()

    def get_db(self) -> Generator[Session, None, None]:
        """Dependency to get database session."""
        if self.SessionLocal is None:
            raise RuntimeError("Database not initialized. Call init_database() first.")
        with self.SessionLocal() as session:
            logger.debug("Yielding database session from get_db")
            yield session
            logger.debug("Database session from get_db closed")

    def health_check(self) -> bool:
        """Simple health check."""
        try:
            for session in self.get_db():
                session.execute(text("SELECT 1"))
                return True
            return False
        except Exception:
            return False

    def prepared_statements_in_use(self) -> int:
        """Delegate prepared statement metrics to instrumentation helpers."""

        try:
            session_factory = with_session_factory(lambda: self.SessionLocal)
        except RuntimeError:
            logger.debug(
                "Prepared statement metrics requested before database initialization",
                exc_info=True,
            )
            return -1

        return resolve_prepared_statements(session_factory)


db_manager = DatabaseManager(settings.effective_database_url)


def init_database() -> None:
    db_manager.init_database()


def close_database() -> None:
    db_manager.close_database()


def get_db() -> Generator[Session, None, None]:
    yield from db_manager.get_db()


@contextmanager
def session_scope() -> Iterator[Session]:
    """
    Provide a transactional scope around a series of operations.

    Intended for scripts, background jobs, or other non-FastAPI contexts.
    Ensures sessions are properly closed and transactions committed/rolled back.
    """

    if db_manager.SessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")

    session = db_manager.SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        logger.exception("Session error encountered; performing rollback")
        session.rollback()
        raise
    finally:
        logger.debug("Closing session_scope session")
        session.close()


def health_check() -> bool:
    return db_manager.health_check()


def is_read_only_mode() -> bool:
    """Return True when the application is running in read-only database mode."""
    return settings.is_read_only


def validate_write_operation() -> None:
    """Ensure write operations are not executed while in read-only mode."""

    if is_read_only_mode():
        raise RuntimeError(
            "Write operations are disabled while the database is in read-only mode."
        )

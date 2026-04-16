"""Database instrumentation helpers decoupled from manager lifecycle."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class SessionFactory(Protocol):
    """Protocol for callables producing SQLAlchemy sessions."""

    def __call__(self) -> Session:  # pragma: no cover - protocol
        ...


PREPARED_STATEMENT_QUERY = text(
    "SELECT COALESCE(COUNT(*), 0) FROM pg_prepared_statements"
)


def prepared_statements_in_use(session_factory: SessionFactory) -> int:
    """Return the number of prepared statements registered with PostgreSQL."""

    try:
        with session_factory() as session:
            result = session.execute(PREPARED_STATEMENT_QUERY)
            try:
                return int(result.scalar_one())
            except Exception:  # pragma: no cover - defensive logging path
                logger.debug(
                    "Prepared statement query returned unexpected result",
                    exc_info=True,
                )
                return -1
    except SQLAlchemyError as exc:  # pragma: no cover - defensive logging path
        logger.debug(
            "Failed to query prepared statements usage via SQLAlchemy: %s",
            exc,
            exc_info=True,
        )
        return -1
    except Exception as exc:  # pragma: no cover - defensive logging path
        logger.debug(
            "Unexpected error querying prepared statements usage: %s",
            exc,
            exc_info=True,
        )
        return -1


def with_session_factory(
    factory_supplier: Callable[[], SessionFactory | None],
) -> SessionFactory:
    """Resolve a session factory or raise when unavailable."""

    session_factory = factory_supplier()
    if session_factory is None:
        raise RuntimeError(
            "Database session factory is not initialized. Call init_database() first."
        )
    return session_factory

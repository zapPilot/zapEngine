"""Shared SQLAlchemy schema introspection helpers for strategy stores."""

from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


def table_exists(db: Session, table_name: str) -> bool:
    """Return whether a table exists, treating inspection failures as unavailable."""
    try:
        bind = db.get_bind()
        return bool(inspect(bind).has_table(table_name))
    except SQLAlchemyError:
        return False

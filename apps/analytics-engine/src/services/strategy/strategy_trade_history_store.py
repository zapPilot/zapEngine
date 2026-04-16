"""Read-only store for persisted strategy trade history."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

_TABLE_NAME = "strategy_trade_history"


def _coerce_trade_date(value: object) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise ValueError("Unsupported trade_date value")


class StrategyTradeHistoryStore:
    """Load persisted executed-trade dates for quota-aware live suggestions."""

    def __init__(self, db: Session):
        self.db = db

    def list_trade_dates(
        self,
        user_id: UUID,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[date]:
        if not self._table_exists():
            return []
        clauses = ["user_id = :user_id"]
        params: dict[str, object] = {"user_id": str(user_id)}
        if start_date is not None:
            clauses.append("trade_date >= :start_date")
            params["start_date"] = start_date.isoformat()
        if end_date is not None:
            clauses.append("trade_date <= :end_date")
            params["end_date"] = end_date.isoformat()
        where_clause = " AND ".join(clauses)
        rows = self.db.execute(
            text(
                f"""
                SELECT trade_date
                FROM {_TABLE_NAME}
                WHERE {where_clause}
                ORDER BY trade_date ASC, created_at ASC, id ASC
                """
            ),
            params,
        ).scalars()
        return list(self._deserialize_rows(rows))

    def _table_exists(self) -> bool:
        try:
            bind = self.db.get_bind()
            return bool(inspect(bind).has_table(_TABLE_NAME))
        except SQLAlchemyError:
            return False

    @staticmethod
    def _deserialize_rows(rows: Iterable[object]) -> Iterable[date]:
        for value in rows:
            yield _coerce_trade_date(value)


class SeedStrategyTradeHistoryStore:
    """Static fallback store used when no persistent trade history exists."""

    def list_trade_dates(
        self,
        user_id: UUID,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[date]:
        del user_id, start_date, end_date
        return []


__all__ = [
    "SeedStrategyTradeHistoryStore",
    "StrategyTradeHistoryStore",
    "_coerce_trade_date",
]

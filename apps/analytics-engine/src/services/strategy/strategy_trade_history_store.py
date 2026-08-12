"""Read-only store for persisted strategy trade history."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.utils import normalize_date
from src.services.strategy._db_introspection import table_exists

_TABLE_NAME = "strategy_trade_history"


def _coerce_trade_date(value: object) -> date:
    raw_date = value[:10] if isinstance(value, str) else value
    try:
        trade_date = normalize_date(raw_date)
    except ValueError as exc:
        raise ValueError("Unsupported trade_date value") from exc
    assert trade_date is not None
    return trade_date


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
        return table_exists(self.db, _TABLE_NAME)

    @staticmethod
    def _deserialize_rows(rows: Iterable[object]) -> Iterable[date]:
        for value in rows:
            yield _coerce_trade_date(value)


class SeedStrategyTradeHistoryStore:
    """Static fallback store used when no persistent trade history exists."""

    # jscpd:ignore-start
    # Reason: fallback store intentionally mirrors the persistent store protocol.
    def list_trade_dates(
        self,
        user_id: UUID,
        *,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[date]:
        del user_id, start_date, end_date
        return []

    # jscpd:ignore-end


__all__ = [
    "SeedStrategyTradeHistoryStore",
    "StrategyTradeHistoryStore",
    "_coerce_trade_date",
]

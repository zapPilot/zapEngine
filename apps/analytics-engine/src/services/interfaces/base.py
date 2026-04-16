from __future__ import annotations

from datetime import date, datetime
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.orm import Session


class QueryServiceProtocol(Protocol):
    """Interface for query execution services"""

    def execute_query_one(
        self, db: Session, query_name: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        """Execute a query and return one result"""
        ...  # pragma: no cover

    def execute_query(
        self, db: Session, query_name: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Execute a query and return all results"""
        ...  # pragma: no cover

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
        """Execute a date-bounded query asynchronously"""
        ...  # pragma: no cover

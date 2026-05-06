"""Shared constructor for read-only market database services."""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.services.interfaces import QueryServiceProtocol


class QueryBackedMarketService:
    """Base for market services that execute named SQL queries."""

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol | None = None,
    ) -> None:
        self.db = db
        if query_service is None:
            from src.services.dependencies import get_query_service

            self.query_service = get_query_service()
        else:
            self.query_service = query_service

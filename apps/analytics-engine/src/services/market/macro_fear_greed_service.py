"""Read-only access to CNN macro Fear & Greed snapshots."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any, TypedDict, cast

from sqlalchemy.orm import Session

from src.services.interfaces import QueryServiceProtocol
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class MacroFearGreedPoint(TypedDict):
    score: float
    label: str
    source: str
    updated_at: str
    raw_rating: str | None


class MacroFearGreedDatabaseService:
    """Read CNN US equity Fear & Greed data collected by alpha-etl."""

    def __init__(
        self, db: Session, query_service: QueryServiceProtocol | None = None
    ) -> None:
        self.db = db
        if query_service is None:
            from src.services.dependencies import get_query_service

            self.query_service = get_query_service()
        else:
            self.query_service = query_service

    @staticmethod
    def _coerce_snapshot_date(raw_date: object) -> date:
        if isinstance(raw_date, datetime):
            return raw_date.date()
        if isinstance(raw_date, date):
            return raw_date
        if isinstance(raw_date, str):
            return date.fromisoformat(raw_date[:10])
        raise ValueError(f"Invalid macro FGI snapshot_date: {raw_date!r}")

    @staticmethod
    def _coerce_updated_at(raw_value: object) -> str:
        if isinstance(raw_value, datetime):
            value = raw_value
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            return value.astimezone(UTC).isoformat()
        if isinstance(raw_value, str):
            return (
                datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
                .astimezone(UTC)
                .isoformat()
            )
        raise ValueError(f"Invalid macro FGI provider_updated_at: {raw_value!r}")

    @classmethod
    def _transform_row(cls, row: dict[str, object]) -> tuple[date, MacroFearGreedPoint]:
        snapshot_date = cls._coerce_snapshot_date(row.get("snapshot_date"))
        score = float(cast(Any, row.get("score")))
        if not (0.0 <= score <= 100.0):
            raise ValueError(f"Invalid macro FGI score row: {row!r}")
        label = str(row.get("label") or "").strip()
        source = str(row.get("source") or "").strip()
        if not label or not source:
            raise ValueError(f"Invalid macro FGI label/source row: {row!r}")
        raw_rating_value = row.get("raw_rating")
        raw_rating = str(raw_rating_value) if raw_rating_value is not None else None
        return snapshot_date, MacroFearGreedPoint(
            score=score,
            label=label,
            source=source,
            updated_at=cls._coerce_updated_at(row.get("provider_updated_at")),
            raw_rating=raw_rating,
        )

    def get_current_macro_fear_greed(self) -> MacroFearGreedPoint | None:
        row = self.query_service.execute_query_one(
            self.db, QUERY_NAMES.MACRO_FEAR_GREED_CURRENT
        )
        if row is None:
            return None
        _, point = self._transform_row(row)
        return point

    def get_daily_macro_fear_greed(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[date, MacroFearGreedPoint]:
        rows = self.query_service.execute_query(
            self.db,
            QUERY_NAMES.MACRO_FEAR_GREED_DAILY,
            {"start_date": start_date, "end_date": end_date},
        )
        out: dict[date, MacroFearGreedPoint] = {}
        for row in rows:
            try:
                snapshot_date, point = self._transform_row(row)
            except Exception as error:
                logger.warning("Skipping malformed macro FGI row: %s", error)
                continue
            out[snapshot_date] = point
        return out


__all__ = ["MacroFearGreedDatabaseService", "MacroFearGreedPoint"]

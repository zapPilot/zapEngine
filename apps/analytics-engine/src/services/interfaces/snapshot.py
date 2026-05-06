from __future__ import annotations

from datetime import date
from typing import Any, Protocol
from uuid import UUID

from src.models.analytics_responses import SnapshotInfo
from src.models.portfolio_snapshot import PortfolioSnapshot


class CanonicalSnapshotServiceProtocol(Protocol):
    """Interface for canonical snapshot date services."""

    def get_snapshot_info(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> SnapshotInfo | None: ...  # pragma: no cover

    def get_snapshot_date(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> date | None: ...  # pragma: no cover

    def get_snapshot_date_range(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> tuple[date, date]: ...  # pragma: no cover

    def validate_snapshot_consistency(
        self,
        user_id: UUID,
        snapshot_date: date,
        expected_wallet_count: int | None = None,
    ) -> dict[str, Any]: ...  # pragma: no cover


class PortfolioSnapshotServiceProtocol(Protocol):
    """Interface for canonical portfolio snapshot service."""

    def get_portfolio_snapshot(
        self, user_id: UUID, *, snapshot_date: date
    ) -> PortfolioSnapshot | None: ...  # pragma: no cover

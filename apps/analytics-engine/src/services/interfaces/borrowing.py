from __future__ import annotations

from datetime import date
from typing import Protocol
from uuid import UUID

from src.models.borrowing import BorrowingPositionsResponse
from src.models.portfolio import BorrowingRiskMetrics, BorrowingSummary


class BorrowingServiceProtocol(Protocol):
    """Unified interface for all borrowing analytics services."""

    def get_borrowing_positions(
        self, user_id: UUID, snapshot_date: date | None = None
    ) -> BorrowingPositionsResponse: ...

    def calculate_borrowing_risk(
        self,
        user_id: UUID,
        total_assets_usd: float,
        total_debt_usd: float,
        total_net_usd: float,
    ) -> BorrowingRiskMetrics | None: ...

    def get_borrowing_summary(
        self,
        user_id: UUID,
        total_assets_usd: float,
        total_debt_usd: float,
        total_net_usd: float,
    ) -> BorrowingSummary: ...

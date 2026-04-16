"""Backtesting service protocol definitions."""

from __future__ import annotations

from typing import Protocol

from src.models.backtesting import (
    BacktestCompareRequestV3,
    BacktestResponse,
)


class BacktestingServiceProtocol(Protocol):
    """Protocol for backtesting services."""

    async def run_compare_v3(
        self, request: BacktestCompareRequestV3
    ) -> BacktestResponse:
        """Run the v3 multi-config strategy comparison endpoint."""
        ...  # pragma: no cover

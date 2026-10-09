"""Backtesting service protocol used by FastAPI dependency wiring."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from src.models.backtesting import (
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestWindowInfo,
    MarketSnapshot,
    StrategyState,
)
from src.models.market_data_freshness import MarketDataFreshness


@dataclass(frozen=True)
class ModelReplay:
    """The model portfolio's last bar from a rolling-window backtest replay.

    This is what the live suggestion follows: the strategy is run over the same
    window the published backtest uses, and its final bar is the answer. A user
    is then projected onto that bar's target; nothing live-specific decides.
    """

    config_id: str
    window: BacktestWindowInfo
    data_freshness: MarketDataFreshness | None
    market: MarketSnapshot
    state: StrategyState

    @property
    def traded(self) -> bool:
        """Whether the model itself moved money on its last bar."""
        return bool(self.state.execution.transfers)


class BacktestingServiceProtocol(Protocol):
    """Protocol for the deliberately lazy-loaded backtesting service."""

    async def run_compare_v3(
        self, request: BacktestCompareRequestV3
    ) -> BacktestResponse:
        """Run the v3 multi-config strategy comparison endpoint."""
        ...  # pragma: no cover

    def replay_model(self, saved_config_id: str, requested_end: date) -> ModelReplay:
        """Replay a saved config over the model window and return its last bar."""
        ...  # pragma: no cover

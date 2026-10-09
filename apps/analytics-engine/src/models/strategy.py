"""Daily suggestion API models for the recipe-first v3 framework."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, JsonValue

from src.models.backtesting import (
    ActionType,
    AssetAllocation,
    BacktestWindowInfo,
    ExecutionStatus,
    MarketSnapshot,
    PortfolioState,
    SignalState,
    StrategyId,
    TargetAllocation,
    TransferRecord,
)
from src.models.market_data_freshness import MarketDataFreshness
from src.services.backtesting.decision import RuleGroup


class DailySuggestionPortfolioState(PortfolioState):
    """Portfolio payload for live daily suggestions.

    `total_value` remains the gross/assets-based runtime value used by the
    strategy engine. The additional totals expose debt-aware landing-page
    metrics for downstream consumers like Telegram.
    """

    total_assets_usd: float = Field(default=0.0, ge=0.0)
    total_debt_usd: float = Field(default=0.0, ge=0.0)
    total_net_usd: float = Field(default=0.0)


class DailySuggestionActionState(BaseModel):
    status: ExecutionStatus
    required: bool
    kind: Literal["rebalance"] | None = None
    reason_code: str
    transfers: list[TransferRecord] = Field(default_factory=list)


class DailySuggestionTargetState(BaseModel):
    allocation: TargetAllocation


class DailySuggestionStrategyContextState(BaseModel):
    stance: ActionType
    reason_code: str
    rule_group: RuleGroup
    details: dict[str, JsonValue] = Field(default_factory=dict)


class DailySuggestionModelState(BaseModel):
    """The model portfolio the suggestion follows.

    ``allocation`` is what the model itself holds after its last bar and
    ``window`` is the rolling backtest window it was replayed over, so a
    consumer can tell how far the user's holdings are from the model's.
    """

    allocation: AssetAllocation
    window: BacktestWindowInfo


class DailySuggestionContextState(BaseModel):
    market: MarketSnapshot
    signal: SignalState
    portfolio: DailySuggestionPortfolioState
    target: DailySuggestionTargetState
    strategy: DailySuggestionStrategyContextState
    model: DailySuggestionModelState


class DailySuggestionResponse(BaseModel):
    as_of: datetime = Field(description="Suggestion generation timestamp")
    config_id: str
    config_display_name: str
    strategy_id: StrategyId
    action: DailySuggestionActionState
    context: DailySuggestionContextState
    data_freshness: MarketDataFreshness | None = None

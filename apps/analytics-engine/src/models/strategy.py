"""Daily suggestion API models for the recipe-first v3 framework."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, JsonValue, PrivateAttr

from src.models.backtesting import (
    ActionType,
    DecisionState,
    ExecutionDiagnostics,
    ExecutionState,
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


class DailySuggestionContextState(BaseModel):
    market: MarketSnapshot
    signal: SignalState
    portfolio: DailySuggestionPortfolioState
    target: DailySuggestionTargetState
    strategy: DailySuggestionStrategyContextState


class DailySuggestionResponse(BaseModel):
    _signal_state: SignalState | None = PrivateAttr(default=None)
    _decision_state: DecisionState | None = PrivateAttr(default=None)
    _execution_state: ExecutionState | None = PrivateAttr(default=None)

    as_of: datetime = Field(description="Suggestion generation timestamp")
    config_id: str
    config_display_name: str
    strategy_id: StrategyId
    action: DailySuggestionActionState
    context: DailySuggestionContextState
    data_freshness: MarketDataFreshness | None = None

    @property
    def signal(self) -> SignalState | None:
        return self._signal_state or self.context.signal

    @property
    def decision(self) -> DecisionState:
        if self._decision_state is not None:
            return self._decision_state
        return DecisionState(
            action=self.context.strategy.stance,
            reason=self.context.strategy.reason_code,
            rule_group=self.context.strategy.rule_group,
            target_allocation=self.context.target.allocation,
            immediate=False,
            details=dict(self.context.strategy.details),
        )

    @property
    def execution(self) -> ExecutionState:
        if self._execution_state is not None:
            return self._execution_state
        return ExecutionState(
            event=self.action.kind,
            transfers=list(self.action.transfers),
            blocked_reason=(
                self.action.reason_code if self.action.status == "blocked" else None
            ),
            status=self.action.status,
            action_required=self.action.required,
            step_count=0,
            steps_remaining=0,
            interval_days=0,
            diagnostics=ExecutionDiagnostics(),
        )

"""Calendar-driven SPY/BTC/ETH/Stable target-weight rebalancer.

Experimental research-only strategy. Auto-excluded from the production
500-day snapshot by its ``[RESEARCH] `` display-name prefix
(see ``scripts/attribution/sweep_production_window.py``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_FIXED_INTERVAL_REBALANCE,
)
from src.services.backtesting.decision import AllocationIntent, DecisionAction
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.rule_based.allocation_executor import (
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
    TransferIntent,
)
from src.services.backtesting.target_allocation import normalize_target_allocation

_NEUTRAL_HINTS = ExecutionHints(
    signal_id="fixed_interval_rebalance",
    current_regime="neutral",
    signal_value=None,
    signal_confidence=0.0,
    decision_score=0.0,
    decision_action="hold",
)
_DRIFT_KEYS = ("btc", "eth", "spy", "stable")


@dataclass
class FixedIntervalRebalanceStrategy(BaseStrategy):
    """Rebalance to a fixed target every ``interval_days`` calendar days.

    Optionally gated by ``min_drift_pct`` — when set, a rebalance day only
    fires if the maximum per-asset deviation from target meets the threshold.
    """

    total_capital: float = 0.0
    target_weights: dict[str, float] = field(default_factory=dict)
    interval_days: int = 30
    min_drift_pct: float | None = None
    user_start_date: date | None = None

    strategy_id: str = STRATEGY_FIXED_INTERVAL_REBALANCE
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_FIXED_INTERVAL_REBALANCE]
    canonical_strategy_id: str = STRATEGY_FIXED_INTERVAL_REBALANCE
    public_params: dict[str, Any] = field(default_factory=dict)

    executor: RuleBasedAllocationExecutor = field(init=False, repr=False)
    _last_rebalance_date: date | None = field(default=None, init=False)
    daily_data: list[dict[str, Any]] = field(default_factory=list)

    def initialize(self, portfolio: Any, config: Any, context: StrategyContext) -> None:
        del portfolio, config, context
        self.executor = RuleBasedAllocationExecutor()
        self.executor.reset()
        self._last_rebalance_date = None
        self.daily_data = []

    def on_day(self, context: StrategyContext) -> StrategyAction:
        if self.user_start_date and context.date < self.user_start_date:
            return self._hold(reason="pre_start_hold")

        if not self._calendar_due(context.date):
            return self._hold(reason="interval_not_due")

        target = normalize_target_allocation(dict(self.target_weights))

        if self.min_drift_pct is not None and not self._drift_meets_threshold(
            context, target
        ):
            return self._hold(reason="below_drift_threshold")

        intent = AllocationIntent(
            action="buy",
            target_allocation=target,
            allocation_name="fixed_interval_target",
            immediate=True,
            reason="calendar_rebalance",
            rule_group="none",
            decision_score=0.0,
        )
        execution = self.executor.execute(
            context=context,
            intent=intent,
            hints=_NEUTRAL_HINTS,
        )
        transfers: list[TransferIntent] = list(execution.transfers or [])
        if transfers:
            self._last_rebalance_date = context.date
        snapshot = StrategySnapshot(
            signal=None,
            decision=intent,
            execution=ExecutionOutcome(
                event=execution.event,
                transfers=transfers,
            ),
        )
        return StrategyAction(
            snapshot=snapshot,
            target_allocations=target,
            transfers=transfers or None,
            apply_yield=True,
        )

    def parameters(self) -> dict[str, Any]:
        return {
            "total_capital": self.total_capital,
            "interval_days": self.interval_days,
            "min_drift_pct": self.min_drift_pct,
            "target_weights": dict(self.target_weights),
        }

    def _calendar_due(self, current_date: date) -> bool:
        if self._last_rebalance_date is None:
            return True
        return (current_date - self._last_rebalance_date).days >= self.interval_days

    def _drift_meets_threshold(
        self,
        context: StrategyContext,
        target: dict[str, float],
    ) -> bool:
        assert self.min_drift_pct is not None
        current = context.portfolio.asset_allocation_percentages(
            context.portfolio_price
        )
        max_drift = max(
            abs(float(current.get(key, 0.0)) - float(target.get(key, 0.0)))
            for key in _DRIFT_KEYS
        )
        return max_drift >= self.min_drift_pct

    @staticmethod
    def _hold(*, reason: str) -> StrategyAction:
        action: DecisionAction = "hold"
        snapshot = StrategySnapshot(
            signal=None,
            decision=AllocationIntent(
                action=action,
                target_allocation=None,
                allocation_name=None,
                immediate=False,
                reason=reason,
                rule_group="none",
                decision_score=0.0,
            ),
            execution=ExecutionOutcome(event=None, transfers=[]),
        )
        return StrategyAction(snapshot=snapshot, apply_yield=True)

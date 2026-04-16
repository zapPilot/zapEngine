"""DCA classic strategy implementation (equal capital pool)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DISPLAY_NAMES,
)
from src.services.backtesting.decision import AllocationIntent, DecisionAction
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
    TransferIntent,
)


@dataclass
class DcaClassicStrategy(BaseStrategy):
    """Normal DCA strategy that spends a fixed USD amount per day.

    DCA Classic is a BTC-only strategy that deploys a fixed amount daily from
    stable reserves into spot holdings.
    """

    total_days: int
    total_capital: float
    initial_allocation: dict[str, float]
    user_start_date: date | None = None

    strategy_id: str = STRATEGY_DCA_CLASSIC
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DCA_CLASSIC]
    canonical_strategy_id: str = STRATEGY_DCA_CLASSIC

    daily_amount: float = 0.0
    days_processed: int = 0
    total_deployed: float = 0.0
    daily_data: list[dict[str, Any]] = field(default_factory=list)

    @staticmethod
    def _snapshot(
        *,
        action: DecisionAction,
        reason: str,
        target_allocation: dict[str, float] | None,
        transfers: list[TransferIntent] | None = None,
        event: str | None = None,
    ) -> StrategySnapshot:
        return StrategySnapshot(
            signal=None,
            decision=AllocationIntent(
                action=action,
                target_allocation=target_allocation,
                allocation_name=None,
                immediate=False,
                reason=reason,
                rule_group="none",
                decision_score=0.0,
            ),
            execution=ExecutionOutcome(
                event=event,
                transfers=[] if transfers is None else list(transfers),
            ),
        )

    def initialize(self, portfolio: Any, config: Any, context: StrategyContext) -> None:
        stable_pool = portfolio.stable_balance
        effective_days = max(self.total_days, 1)
        self.daily_amount = stable_pool / effective_days
        self.total_deployed = self.total_capital * self.initial_allocation.get(
            "spot", 0.0
        )
        self.days_processed = 0
        self.daily_data = []

    def on_day(self, context: StrategyContext) -> StrategyAction:
        if self.user_start_date and context.date < self.user_start_date:
            return StrategyAction(
                snapshot=self._snapshot(
                    action="hold",
                    reason="pre_start_hold",
                    target_allocation=None,
                ),
                apply_yield=True,
            )

        if self.days_processed >= self.total_days:
            return StrategyAction(
                snapshot=self._snapshot(
                    action="hold",
                    reason="capital_exhausted",
                    target_allocation=None,
                ),
                apply_yield=True,
            )

        self.days_processed += 1
        deploy_amount = min(self.daily_amount, context.portfolio.stable_balance)
        if deploy_amount > 0:
            transfer = TransferIntent(
                from_bucket="stable",
                to_bucket="spot",
                amount_usd=deploy_amount,
            )
            self.total_deployed += deploy_amount
            return StrategyAction(
                snapshot=self._snapshot(
                    action="buy",
                    reason="daily_buy",
                    target_allocation=None,
                    transfers=[transfer],
                    event="buy",
                ),
                transfers=[transfer],
                apply_yield=True,
            )

        return StrategyAction(
            snapshot=self._snapshot(
                action="hold",
                reason="no_cash",
                target_allocation=None,
            ),
            apply_yield=True,
        )

    def record_day(
        self,
        context: StrategyContext,
        action: StrategyAction,
        yield_breakdown: dict[str, float],
        trade_executed: bool,
    ) -> None:
        # Use base implementation which records standard fields
        super().record_day(context, action, yield_breakdown, trade_executed)

    def parameters(self) -> dict[str, Any]:
        return {
            "total_capital": self.total_capital,
            "daily_amount": self.daily_amount,
            "model": "equal_capital_pool",
        }

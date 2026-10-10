"""Atomic allocation executor for portfolio-rule strategies."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.rebalance_calculator import (
    RebalanceCalculator,
    plan_transfers_to_target,
)
from src.services.backtesting.strategies.base import StrategyContext, TransferIntent


# jscpd:ignore-start
# Reason: legacy rule-based result mirrors the shared executor result contract.
@dataclass(frozen=True)
class AllocationExecutionResult:
    target_allocation: dict[str, float]
    allocation_name: str | None
    transfers: list[TransferIntent] | None
    event: str | None
    drift: float
    block_reason: str | None = None


# jscpd:ignore-end


@dataclass
class RuleBasedAllocationExecutor:
    """Execute each matched allocation intent in full on the current bar."""

    last_trade_date: date | None = field(default=None, init=False)
    trade_dates: list[date] = field(default_factory=list, init=False)

    def reset(self) -> None:
        self.trade_dates = []
        self.last_trade_date = None

    def execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
    ) -> AllocationExecutionResult:
        assert intent.target_allocation is not None
        target_allocation = dict(intent.target_allocation)
        current_allocation = (
            RebalanceCalculator.calculate_current_allocation_from_context(
                context,
                target_allocation=target_allocation,
            )
        )
        drift = RebalanceCalculator.calculate_drift(
            current_allocation,
            target_allocation,
        )
        transfers = plan_transfers_to_target(
            portfolio=context.portfolio,
            price=context.portfolio_price,
            target_allocation=target_allocation,
        )
        if transfers:
            self.last_trade_date = context.date
            self.trade_dates.append(context.date)

        return AllocationExecutionResult(
            target_allocation=target_allocation,
            allocation_name=intent.allocation_name,
            transfers=transfers or None,
            event="rebalance" if transfers else None,
            drift=drift,
        )


__all__ = ["AllocationExecutionResult", "RuleBasedAllocationExecutor"]

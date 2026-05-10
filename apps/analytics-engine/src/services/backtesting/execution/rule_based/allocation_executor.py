"""Atomic allocation executor for portfolio-rule strategies."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.rebalance_calculator import RebalanceCalculator
from src.services.backtesting.execution.transfer_netting import build_bucket_transfers
from src.services.backtesting.strategies.base import StrategyContext, TransferIntent


@dataclass(frozen=True)
class AllocationExecutionResult:
    target_allocation: dict[str, float]
    allocation_name: str | None
    transfers: list[TransferIntent] | None
    event: str | None
    drift: float
    immediate_execution: bool = True
    block_reason: str | None = None


@dataclass
class RuleBasedAllocationExecutor:
    """Execute each matched allocation intent in full on the current bar."""

    last_trade_date: date | None = field(default=None, init=False)
    trade_dates: list[date] = field(default_factory=list, init=False)
    _seeded_trade_dates: tuple[date, ...] = field(default=(), init=False)

    def reset(self) -> None:
        self.trade_dates = list(self._seeded_trade_dates)
        self.last_trade_date = max(self._seeded_trade_dates, default=None)

    def seed_trade_dates(self, trade_dates: list[date] | tuple[date, ...]) -> None:
        self._seeded_trade_dates = tuple(sorted(set(trade_dates)))
        self.reset()

    def observe(self, hints: ExecutionHints) -> None:
        del hints

    def execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
    ) -> AllocationExecutionResult:
        del hints
        assert intent.target_allocation is not None
        target_allocation = dict(intent.target_allocation)
        current_allocation = (
            RebalanceCalculator.calculate_current_allocation_from_context(
                context,
                target_allocation=target_allocation,
            )
        )
        deltas = RebalanceCalculator.calculate_deltas_from_context(
            context,
            target_allocation,
        )
        drift = RebalanceCalculator.calculate_drift(
            current_allocation,
            target_allocation,
        )

        if self._is_effectively_at_target(deltas):
            return AllocationExecutionResult(
                target_allocation=target_allocation,
                allocation_name=intent.allocation_name,
                transfers=None,
                event=None,
                drift=drift,
                immediate_execution=True,
            )

        transfers = self._build_atomic_transfers(deltas=deltas)
        if transfers:
            self.last_trade_date = context.date
            self.trade_dates.append(context.date)

        return AllocationExecutionResult(
            target_allocation=target_allocation,
            allocation_name=intent.allocation_name,
            transfers=transfers or None,
            event="rebalance" if transfers else None,
            drift=drift,
            immediate_execution=True,
        )

    @staticmethod
    def _build_atomic_transfers(
        *,
        deltas: dict[str, float],
    ) -> list[TransferIntent]:
        return build_bucket_transfers(deltas=deltas)

    @staticmethod
    def _is_effectively_at_target(
        deltas: dict[str, float],
        *,
        tolerance: float = 1e-6,
    ) -> bool:
        if not deltas:
            return True
        return max(abs(delta) for delta in deltas.values()) <= tolerance


__all__ = ["AllocationExecutionResult", "RuleBasedAllocationExecutor"]

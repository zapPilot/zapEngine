"""Benchmarks a strategy is read against.

Every benchmark runs through the same engine, under the same assumptions, over
the same bars as the strategy, so a difference is the strategy's and not the
yardstick's. Starting holdings are free for every strategy alike, so the hold
benchmarks start fully invested on day one.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.services.backtesting.constants import STRATEGY_DCA_CLASSIC
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
)
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy
from src.services.backtesting.target_allocation import normalize_target_allocation

DCA_CLASSIC = STRATEGY_DCA_CLASSIC
BUY_HOLD_BTC = "buy_hold_btc"
BUY_HOLD_EQUAL_WEIGHT = "buy_hold_equal_weight"
BENCHMARK_IDS = (DCA_CLASSIC, BUY_HOLD_BTC, BUY_HOLD_EQUAL_WEIGHT)

_HOLD_WEIGHTS: dict[str, dict[str, float]] = {
    BUY_HOLD_BTC: {"btc": 1.0},
    BUY_HOLD_EQUAL_WEIGHT: {"spy": 1.0, "btc": 1.0, "eth": 1.0},
}


@dataclass
class HoldStrategy(BaseStrategy):
    """Holds a fixed mix from the first day and never trades."""

    weights: Mapping[str, float]
    # BaseStrategy gives these class-level defaults, so they must follow ``weights``.
    strategy_id: str
    display_name: str
    initial_asset_allocation: dict[str, float] = field(init=False)

    def __post_init__(self) -> None:
        self.initial_asset_allocation = normalize_target_allocation(self.weights)

    def on_day(self, context: StrategyContext) -> StrategyAction:
        return StrategyAction(
            snapshot=StrategySnapshot(
                signal=None,
                decision=AllocationIntent(
                    action="hold",
                    target_allocation=None,
                    allocation_name=None,
                    immediate=False,
                    reason="hold",
                    rule_group="none",
                    decision_score=0.0,
                ),
                execution=ExecutionOutcome(event=None, transfers=[]),
            )
        )

    def parameters(self) -> dict[str, Any]:
        return {"weights": dict(self.initial_asset_allocation)}


def build_benchmarks(
    ids: Sequence[str],
    *,
    total_capital: float,
    total_days: int,
    user_start_date: date,
    initial_allocation: dict[str, float],
) -> list[BaseStrategy]:
    """The named benchmarks as strategies ready for the engine."""
    strategies: list[BaseStrategy] = []
    for benchmark_id in ids:
        if benchmark_id == DCA_CLASSIC:
            strategies.append(
                DcaClassicStrategy(
                    total_days=total_days,
                    total_capital=total_capital,
                    initial_allocation=initial_allocation,
                    user_start_date=user_start_date,
                    strategy_id=benchmark_id,
                    display_name=benchmark_id,
                )
            )
        elif benchmark_id in _HOLD_WEIGHTS:
            strategies.append(
                HoldStrategy(
                    strategy_id=benchmark_id,
                    display_name=benchmark_id,
                    weights=_HOLD_WEIGHTS[benchmark_id],
                )
            )
        else:
            raise ValueError(
                f"Unknown benchmark '{benchmark_id}'; use one of "
                f"{', '.join(BENCHMARK_IDS)}"
            )
    return strategies


__all__ = [
    "BENCHMARK_IDS",
    "BUY_HOLD_BTC",
    "BUY_HOLD_EQUAL_WEIGHT",
    "DCA_CLASSIC",
    "HoldStrategy",
    "build_benchmarks",
]

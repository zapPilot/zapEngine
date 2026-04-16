"""Cost model abstractions for backtesting trades."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class CostModel(Protocol):
    """Protocol for trade cost calculation."""

    def calculate_cost(self, amount: float) -> float: ...


@dataclass(frozen=True)
class PercentageSlippageModel:
    """Cost model applying percentage-based slippage/fees."""

    percent: float = 0.0

    def calculate_cost(self, amount: float) -> float:
        if amount <= 0:
            return 0.0
        return amount * self.percent

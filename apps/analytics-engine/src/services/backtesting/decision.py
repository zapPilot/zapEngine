"""Core decision contracts shared by backtesting strategies and execution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

DecisionAction = Literal["buy", "sell", "hold"]
RuleGroup = Literal["cross", "cooldown", "dma_fgi", "ath", "rotation", "none"]


@dataclass(frozen=True, slots=True)
class AllocationIntent:
    """Target-allocation intent emitted by a strategy decision."""

    action: DecisionAction
    target_allocation: dict[str, float] | None
    allocation_name: str | None
    immediate: bool
    reason: str
    rule_group: RuleGroup
    decision_score: float
    target_spot_asset: str | None = None

    def to_signal_payload(self) -> dict[str, Any]:
        """Serialize the decision to the legacy signal metadata shape."""
        if self.action == "hold" and self.target_allocation is None:
            return {"hold": True, "immediate": False, "target": None, "name": None}
        return {
            "target": (
                None if self.target_allocation is None else dict(self.target_allocation)
            ),
            "name": self.allocation_name,
            "hold": self.action == "hold",
            "immediate": self.immediate,
        }


__all__ = ["AllocationIntent", "DecisionAction", "RuleGroup"]

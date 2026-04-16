"""Multi-step rebalancing plan executor.

This module tracks multi-step rebalancing plans, allowing large portfolio
adjustments to be spread over multiple trading days.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StepPlanExecutor:
    """Manages multi-step rebalancing plans.

    This component tracks step-based rebalancing state, allowing large portfolio
    adjustments to be spread over multiple trading days.

    Attributes:
        step_plan: Per-step USD amounts by bucket, or None if no plan active
        steps_remaining: Number of steps left to execute
        rebalance_step_count: Total number of steps for new plans
    """

    rebalance_step_count: int  # Stored for potential introspection/debugging
    step_plan: dict[str, float] | None = field(default=None)
    steps_remaining: int = field(default=0)

    def clear(self) -> None:
        """Clear the current step plan."""
        self.step_plan = None
        self.steps_remaining = 0

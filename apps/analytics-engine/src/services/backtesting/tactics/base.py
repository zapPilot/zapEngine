"""Base contracts for composable tactical rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.signals.dma_gated_fgi.constants import (
    SCORE_BY_REASON,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaMarketState,
    Zone,
)


@dataclass(frozen=True)
class RuleConfig:
    dma_overextension_threshold: float = 0.30
    fgi_slope_reversal_threshold: float = -0.05
    fgi_slope_recovery_threshold: float = 0.05


class Rule(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def priority(self) -> int: ...

    @property
    def rule_group(self) -> RuleGroup: ...

    @property
    def description(self) -> str: ...

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool: ...

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent: ...


def hold_reason(zone: Zone) -> str:
    return "regime_no_signal" if zone != "at" else "price_equal_dma_hold"


def hold_intent(*, reason: str, rule_group: RuleGroup) -> AllocationIntent:
    return AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason=reason,
        rule_group=rule_group,
        decision_score=0.0,
    )


def target_intent(
    *,
    action: DecisionAction,
    target: dict[str, float],
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    immediate: bool = False,
) -> AllocationIntent:
    return AllocationIntent(
        action=action,
        target_allocation=dict(target),
        allocation_name=allocation_name,
        immediate=immediate,
        reason=reason,
        rule_group=rule_group,
        decision_score=SCORE_BY_REASON.get(reason, 0.0),
    )


__all__ = [
    "Rule",
    "RuleConfig",
    "hold_intent",
    "hold_reason",
    "target_intent",
]

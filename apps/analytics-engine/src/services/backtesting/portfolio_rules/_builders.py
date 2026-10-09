"""The decision score of an intent and the intent builder every rule shares."""

from __future__ import annotations

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)

SCORE_BY_REASON: dict[str, float] = {
    "portfolio_cross_down_exit": -1.0,
    "portfolio_cross_up_equal_weight": 1.0,
    "portfolio_dma_overextension_dca_sell": -0.8,
    "portfolio_fgi_downshift_dca_sell": -0.6,
}


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


__all__ = ["SCORE_BY_REASON", "target_intent"]

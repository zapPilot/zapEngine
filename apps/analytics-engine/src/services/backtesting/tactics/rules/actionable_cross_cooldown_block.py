"""Cooldown block for same-tick actionable DMA crosses."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.dma_gated_fgi.utils import _cross_target_zone
from src.services.backtesting.tactics.base import RuleConfig, hold_intent


@dataclass(frozen=True)
class ActionableCrossCooldownBlockRule:
    name: str = "actionable_cross_cooldown_block"
    priority: int = 10
    rule_group: RuleGroup = "cooldown"
    description: str = (
        "Hold when an actionable DMA cross targets a cooldown-blocked side."
    )

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        actionable_cross = snapshot.actionable_cross_event
        if actionable_cross != snapshot.cross_event or actionable_cross is None:
            return False
        target_zone = _cross_target_zone(actionable_cross)
        return (
            snapshot.cooldown_state.active
            and target_zone == snapshot.cooldown_state.blocked_zone
        )

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        actionable_cross = snapshot.actionable_cross_event
        assert actionable_cross is not None
        target_zone = _cross_target_zone(actionable_cross)
        return hold_intent(
            reason=f"{target_zone}_side_cooldown_active",
            rule_group=self.rule_group,
        )

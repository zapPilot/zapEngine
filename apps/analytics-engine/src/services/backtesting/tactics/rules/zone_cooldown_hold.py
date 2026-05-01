"""Cooldown hold for the currently blocked DMA zone."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, hold_intent


@dataclass(frozen=True)
class ZoneCooldownHoldRule:
    name: str = "zone_cooldown_hold"
    priority: int = 40
    rule_group: RuleGroup = "cooldown"
    description: str = "Hold while the current DMA side is still cooldown-blocked."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return (
            snapshot.cooldown_state.active
            and snapshot.zone == snapshot.cooldown_state.blocked_zone
        )

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return hold_intent(
            reason=f"{snapshot.zone}_side_cooldown_active",
            rule_group=self.rule_group,
        )

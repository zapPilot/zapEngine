"""Immediate buy for actionable DMA cross-up events."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import BUY_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class ActionableCrossUpBuyRule:
    name: str = "actionable_cross_up_buy"
    priority: int = 30
    rule_group: RuleGroup = "cross"
    description: str = "Buy immediately on an actionable DMA cross-up."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        actionable_cross = snapshot.actionable_cross_event
        return (
            actionable_cross == snapshot.cross_event and actionable_cross == "cross_up"
        )

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return target_intent(
            action="buy",
            target=BUY_TARGET,
            allocation_name="dma_cross_up_entry",
            reason="dma_cross_up",
            rule_group=self.rule_group,
            immediate=True,
        )

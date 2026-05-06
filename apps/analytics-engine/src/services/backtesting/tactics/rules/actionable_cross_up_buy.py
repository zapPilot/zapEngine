"""Immediate buy for actionable DMA cross-up events."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import BUY_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent_builder


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

    build_intent = target_intent_builder(
        action="buy",
        target=BUY_TARGET,
        allocation_name="dma_cross_up_entry",
        reason="dma_cross_up",
        immediate=True,
    )

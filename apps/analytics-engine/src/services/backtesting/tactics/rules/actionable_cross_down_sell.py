"""Immediate sell for actionable DMA cross-down events."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import SELL_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class ActionableCrossDownSellRule:
    name: str = "actionable_cross_down_sell"
    priority: int = 20
    rule_group: RuleGroup = "cross"
    description: str = "Sell immediately on an actionable DMA cross-down."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        actionable_cross = snapshot.actionable_cross_event
        return (
            actionable_cross == snapshot.cross_event
            and actionable_cross == "cross_down"
        )

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_cross_down_exit",
            reason="dma_cross_down",
            rule_group=self.rule_group,
            immediate=True,
        )

"""Sell when price is far above DMA."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import SELL_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class AboveOverextendedSellRule:
    name: str = "above_overextended_sell"
    priority: int = 50
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Sell when price is above DMA and overextension exceeds the configured threshold."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return (
            snapshot.zone == "above"
            and snapshot.dma_distance >= config.dma_overextension_threshold
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
            allocation_name="dma_above_overextended_sell",
            reason="above_dma_overextended_sell",
            rule_group=self.rule_group,
        )

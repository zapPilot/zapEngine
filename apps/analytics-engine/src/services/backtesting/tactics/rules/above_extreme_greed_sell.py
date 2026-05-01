"""Sell when price is above DMA during extreme greed."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import SELL_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class AboveExtremeGreedSellRule:
    name: str = "above_extreme_greed_sell"
    priority: int = 60
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Sell when price is above DMA and FGI is extreme greed."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return snapshot.zone == "above" and snapshot.fgi_regime == "extreme_greed"

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_above_extreme_greed_sell",
            reason="above_extreme_greed_sell",
            rule_group=self.rule_group,
        )

"""Buy below DMA during extreme fear."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import BUY_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class BelowExtremeFearBuyRule:
    name: str = "below_extreme_fear_buy"
    priority: int = 90
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Buy when price is below DMA and FGI is extreme fear."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return snapshot.zone == "below" and snapshot.fgi_regime == "extreme_fear"

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return target_intent(
            action="buy",
            target=BUY_TARGET,
            allocation_name="dma_below_extreme_fear_buy",
            reason="below_extreme_fear_buy",
            rule_group=self.rule_group,
        )

"""Buy below DMA when fear momentum is recovering."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import BUY_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class BelowFearRecoveringBuyRule:
    name: str = "below_fear_recovering_buy"
    priority: int = 100
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Buy when price is below DMA and fear momentum is recovering."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return (
            snapshot.zone == "below"
            and snapshot.fgi_regime in ("fear", "extreme_fear")
            and snapshot.fgi_slope > config.fgi_slope_recovery_threshold
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
            allocation_name="dma_below_fear_recovering_buy",
            reason="below_fear_recovering_buy",
            rule_group=self.rule_group,
        )

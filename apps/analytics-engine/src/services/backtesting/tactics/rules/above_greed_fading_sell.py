"""Sell when greed is fading above DMA."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import SELL_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent_builder


@dataclass(frozen=True)
class AboveGreedFadingSellRule:
    name: str = "above_greed_fading_sell"
    priority: int = 70
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Sell when price is above DMA and greed momentum is fading."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return (
            snapshot.zone == "above"
            and snapshot.fgi_regime in ("greed", "extreme_greed")
            and snapshot.fgi_slope < config.fgi_slope_reversal_threshold
        )

    build_intent = target_intent_builder(
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_above_greed_fading_sell",
        reason="above_greed_fading_sell",
    )

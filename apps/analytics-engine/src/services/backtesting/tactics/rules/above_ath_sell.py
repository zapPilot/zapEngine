"""Sell above DMA on ATH events."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.constants import SELL_TARGET
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent


@dataclass(frozen=True)
class AboveAthSellRule:
    name: str = "above_ath_sell"
    priority: int = 110
    rule_group: RuleGroup = "ath"
    description: str = "Sell on an ATH event while price is above DMA."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return snapshot.ath_event is not None and snapshot.zone == "above"

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_ath_sell",
            reason="ath_sell",
            rule_group=self.rule_group,
        )

"""Buy SPY below DMA during macro extreme fear."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import RuleConfig, target_intent

SPY_BUY_TARGET: dict[str, float] = {
    "btc": 0.0,
    "eth": 0.0,
    "spy": 0.20,
    "stable": 0.80,
    "alt": 0.0,
}


@dataclass(frozen=True)
class SpyBelowExtremeFearBuyRule:
    name: str = "spy_below_extreme_fear_buy"
    priority: int = 89
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Buy SPY when SPY is below DMA and macro FGI is extreme fear."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return (
            snapshot.asset_symbol == "SPY"
            and snapshot.zone == "below"
            and snapshot.macro_fear_greed_regime == "extreme_fear"
        )

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return target_intent(
            action="buy",
            target=SPY_BUY_TARGET,
            allocation_name="spy_dma_below_extreme_fear_buy",
            reason="spy_below_extreme_fear_buy",
            rule_group=self.rule_group,
        )

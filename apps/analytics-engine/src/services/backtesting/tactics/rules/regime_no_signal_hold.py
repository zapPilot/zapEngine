"""Default no-signal hold rule."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.tactics.base import (
    RuleConfig,
    hold_intent,
    hold_reason,
)


@dataclass(frozen=True)
class RegimeNoSignalHoldRule:
    name: str = "regime_no_signal_hold"
    priority: int = 120
    rule_group: RuleGroup = "none"
    description: str = "Hold when no higher-priority DMA/FGI rule matches."

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return True

    def build_intent(
        self,
        snapshot: DmaMarketState,
        *,
        config: RuleConfig,
    ) -> AllocationIntent:
        return hold_intent(
            reason=hold_reason(snapshot.zone), rule_group=self.rule_group
        )

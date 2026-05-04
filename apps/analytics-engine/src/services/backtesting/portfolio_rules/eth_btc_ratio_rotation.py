"""Portfolio rule: rotate BTC and ETH on ETH/BTC ratio crosses."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    portfolio_target_intent,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class EthBtcRatioRotationRule:
    name: str = "eth_btc_ratio_rotation"
    priority: int = 15
    rule_group: RuleGroup = "cross"
    description: str = "Rotate BTC <-> ETH when ETH/BTC ratio crosses its 200-day DMA."

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        ratio_state = snapshot.eth_btc_ratio_state
        return (
            ratio_state is not None and ratio_state.actionable_cross_event is not None
        )

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del config
        ratio_state = snapshot.eth_btc_ratio_state
        target = current_target(snapshot)
        btc = float(target.get("btc", 0.0))
        eth = float(target.get("eth", 0.0))
        if ratio_state is not None and ratio_state.actionable_cross_event == "cross_up":
            target["eth"] = eth + btc
            target["btc"] = 0.0
            allocation_name = "portfolio_eth_btc_ratio_rotation_to_eth"
        else:
            target["btc"] = btc + eth
            target["eth"] = 0.0
            allocation_name = "portfolio_eth_btc_ratio_rotation_to_btc"
        return portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name=allocation_name,
            reason=allocation_name,
            rule_group=self.rule_group,
            assets=["BTC", "ETH"],
            immediate=True,
        )


__all__ = ["EthBtcRatioRotationRule"]

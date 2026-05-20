"""Portfolio rule: rotate BTC and ETH on ETH/BTC ratio crosses."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    eth_btc_ratio_rotation_intent,
)


@dataclass(frozen=True)
class EthBtcRatioRotationRule:
    name: str = "eth_btc_ratio_rotation"
    priority: int = 21
    cooldown_days: int = 30
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
        ratio_state = snapshot.eth_btc_ratio_state
        target = current_target(snapshot)
        btc = float(target.get("btc", 0.0))
        eth = float(target.get("eth", 0.0))
        stable = float(target.get("stable", 0.0))
        if ratio_state is not None and ratio_state.actionable_cross_event == "cross_up":
            target["eth"] = eth + btc + stable
            target["btc"] = 0.0
            target["stable"] = 0.0
            allocation_name = "portfolio_eth_btc_ratio_rotation_to_eth"
        else:
            target["btc"] = btc + eth
            target["eth"] = 0.0
            allocation_name = "portfolio_eth_btc_ratio_rotation_to_btc"
        return eth_btc_ratio_rotation_intent(
            snapshot=snapshot,
            config=config,
            target=target,
            allocation_name=allocation_name,
            rule_group=self.rule_group,
        )


__all__ = ["EthBtcRatioRotationRule"]

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


@dataclass(frozen=True, kw_only=True)
class EthBtcRatioRotationRule:
    name: str
    priority: int
    cooldown_days: int
    # Allocation keys swept into the destination on a cross-up (ETH is the
    # stronger leg) and on a cross-down.
    up_sources: tuple[str, ...]
    up_destination: str
    down_sources: tuple[str, ...]
    down_destination: str
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
        if ratio_state is not None and ratio_state.actionable_cross_event == "cross_up":
            _sweep(target, self.up_sources, self.up_destination)
            allocation_name = "portfolio_eth_btc_ratio_rotation_to_eth"
        else:
            _sweep(target, self.down_sources, self.down_destination)
            allocation_name = "portfolio_eth_btc_ratio_rotation_to_btc"
        return eth_btc_ratio_rotation_intent(
            snapshot=snapshot,
            config=config,
            target=target,
            allocation_name=allocation_name,
            rule_group=self.rule_group,
            starts_ratio_cooldown=True,
        )


def _sweep(
    target: dict[str, float],
    sources: tuple[str, ...],
    destination: str,
) -> None:
    """Move everything held in ``sources`` into ``destination``."""
    total = float(target.get(destination, 0.0))
    for key in sources:
        total = total + float(target.get(key, 0.0))
    for key in sources:
        target[key] = 0.0
    target[destination] = total


__all__ = ["EthBtcRatioRotationRule"]

"""Portfolio rule 22: DCA ETH/BTC allocation on large DMA deviations."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_COOLDOWN_KEY,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    eth_btc_ratio_rotation_intent,
)
from src.services.backtesting.signals.ratio_state import EthBtcRatioState

CooldownKey = str | tuple[str, str]


@dataclass(frozen=True)
class EthBtcDeviationDcaRule:
    name: str = "eth_btc_deviation_dca"
    priority: int = 22
    cooldown_days: int = 7
    rule_group: RuleGroup = "cross"
    description: str = (
        "Mean-revert BTC/ETH allocation when ETH/BTC ratio is far from its 200-day DMA."
    )
    dca_deviation_threshold: float = 0.50
    large_deviation_threshold: float = 0.65
    dca_rotation_fraction: float = 0.25
    large_rotation_fraction: float = 0.75
    dca_cooldown_days: int = 14
    large_cooldown_days: int = 60
    symmetric_enabled: bool = True

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return _tier_for_snapshot(snapshot, rule=self) is not None

    def cooldown_key(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> CooldownKey:
        del config
        tier = _require_tier(snapshot, rule=self)
        return (self.name, tier["cooldown_suffix"])

    def cooldown_days_for_snapshot(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> int:
        del config
        tier = _require_tier(snapshot, rule=self)
        return (
            self.large_cooldown_days
            if tier["tier"] == "large"
            else self.dca_cooldown_days
        )

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        tier = _require_tier(snapshot, rule=self)
        target = current_target(snapshot)
        source_key = str(tier["source_key"])
        destination_key = str(tier["destination_key"])
        rotation_fraction = float(tier["rotation_fraction"])
        rotated = max(0.0, float(target.get(source_key, 0.0))) * rotation_fraction
        target[source_key] = max(0.0, float(target.get(source_key, 0.0)) - rotated)
        target[destination_key] = (
            max(0.0, float(target.get(destination_key, 0.0))) + rotated
        )
        intent = eth_btc_ratio_rotation_intent(
            snapshot=snapshot,
            config=config,
            target=target,
            allocation_name=str(tier["allocation_name"]),
            rule_group=self.rule_group,
        )
        diagnostics = dict(intent.diagnostics or {})
        diagnostics[DIAG_PORTFOLIO_RULE_COOLDOWN_KEY] = [
            self.name,
            str(tier["cooldown_suffix"]),
        ]
        diagnostics["eth_btc_ratio_deviation"] = tier["deviation"]
        diagnostics["portfolio_rule_tier"] = tier["tier"]
        return replace(intent, diagnostics=diagnostics)


def _require_tier(
    snapshot: PortfolioSnapshot,
    *,
    rule: EthBtcDeviationDcaRule,
) -> dict[str, Any]:
    tier = _tier_for_snapshot(snapshot, rule=rule)
    if tier is None:
        raise ValueError("ETH/BTC deviation DCA intent requested without a match")
    return tier


def _tier_for_snapshot(
    snapshot: PortfolioSnapshot,
    *,
    rule: EthBtcDeviationDcaRule,
) -> dict[str, Any] | None:
    deviation = _ratio_deviation(snapshot.eth_btc_ratio_state)
    if deviation is None:
        return None
    if deviation <= -rule.large_deviation_threshold:
        return _tier(
            deviation=deviation,
            tier="large",
            source_key="btc",
            destination_key="eth",
            rotation_fraction=rule.large_rotation_fraction,
            allocation_name="portfolio_eth_btc_deviation_large_to_eth",
            cooldown_suffix="large_to_eth",
        )
    if -rule.large_deviation_threshold < deviation <= -rule.dca_deviation_threshold:
        return _tier(
            deviation=deviation,
            tier="dca",
            source_key="btc",
            destination_key="eth",
            rotation_fraction=rule.dca_rotation_fraction,
            allocation_name="portfolio_eth_btc_deviation_dca_to_eth",
            cooldown_suffix="dca_to_eth",
        )
    if not rule.symmetric_enabled:
        return None
    if deviation >= rule.large_deviation_threshold:
        return _tier(
            deviation=deviation,
            tier="large",
            source_key="eth",
            destination_key="btc",
            rotation_fraction=rule.large_rotation_fraction,
            allocation_name="portfolio_eth_btc_deviation_large_to_btc",
            cooldown_suffix="large_to_btc",
        )
    if rule.dca_deviation_threshold <= deviation < rule.large_deviation_threshold:
        return _tier(
            deviation=deviation,
            tier="dca",
            source_key="eth",
            destination_key="btc",
            rotation_fraction=rule.dca_rotation_fraction,
            allocation_name="portfolio_eth_btc_deviation_dca_to_btc",
            cooldown_suffix="dca_to_btc",
        )
    return None


def _tier(
    *,
    deviation: float,
    tier: str,
    source_key: str,
    destination_key: str,
    rotation_fraction: float,
    allocation_name: str,
    cooldown_suffix: str,
) -> dict[str, Any]:
    return {
        "deviation": deviation,
        "tier": tier,
        "source_key": source_key,
        "destination_key": destination_key,
        "rotation_fraction": rotation_fraction,
        "allocation_name": allocation_name,
        "cooldown_suffix": cooldown_suffix,
    }


def _ratio_deviation(ratio_state: EthBtcRatioState | None) -> float | None:
    if ratio_state is None:
        return None
    explicit = getattr(ratio_state, "deviation_from_dma_200", None)
    if isinstance(explicit, int | float) and not isinstance(explicit, bool):
        return float(explicit)
    if ratio_state.ratio_dma_200 <= 0.0:
        return None
    return (ratio_state.ratio - ratio_state.ratio_dma_200) / ratio_state.ratio_dma_200


__all__ = ["EthBtcDeviationDcaRule"]

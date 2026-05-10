"""Portfolio rule: continuously weight BTC/ETH by ETH/BTC DMA distance."""

from __future__ import annotations

from dataclasses import dataclass, replace

from src.services.backtesting.asset_class_allocator import score_dma_distance
from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    portfolio_target_intent,
    ratio_signals_consulted,
)
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class EthBtcContinuousWeightRule:
    name: str = "eth_btc_continuous_weight"
    priority: int = 22
    cooldown_days: int = 7
    rotation_max_deviation: float = 0.20
    rotation_drift_threshold: float = 0.03
    rule_group: RuleGroup = "rotation"
    description: str = (
        "Continuous ETH/BTC weight from ratio DMA distance, saturating at +/-20%."
    )

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        target = _continuous_target(snapshot, rule=self)
        if target is None:
            return False
        current = current_target(snapshot)
        return any(
            abs(float(current.get(bucket, 0.0)) - float(target.get(bucket, 0.0)))
            > self.rotation_drift_threshold
            for bucket in ("btc", "eth")
        )

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        target = _continuous_target(snapshot, rule=self)
        if target is None:
            raise ValueError("ETH/BTC continuous weight intent requested without match")
        intent = portfolio_target_intent(
            action="sell",
            target=normalize_target_allocation(target),
            allocation_name="portfolio_eth_btc_continuous_weight",
            reason="portfolio_eth_btc_continuous_weight",
            rule_group=self.rule_group,
            assets=["BTC", "ETH"],
            immediate=False,
            signals_consulted=ratio_signals_consulted(snapshot)
            if config.emit_signals_consulted
            else None,
        )
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["eth_btc_ratio_deviation"] = _ratio_deviation(
            snapshot.eth_btc_ratio_state
        )
        diagnostics["eth_btc_target_eth_share_in_risk_on"] = _eth_share_for_snapshot(
            snapshot,
            rule=self,
        )
        return replace(intent, diagnostics=diagnostics)


def _continuous_target(
    snapshot: PortfolioSnapshot,
    *,
    rule: EthBtcContinuousWeightRule,
) -> dict[str, float] | None:
    eth_share = _eth_share_for_snapshot(snapshot, rule=rule)
    if eth_share is None:
        return None
    current = current_target(snapshot)
    stable_share = max(0.0, min(1.0, float(current.get("stable", 0.0))))
    spy_share = max(0.0, min(1.0, float(current.get("spy", 0.0))))
    crypto_share = max(0.0, 1.0 - stable_share - spy_share)
    return normalize_target_allocation(
        {
            "btc": crypto_share * (1.0 - eth_share),
            "eth": crypto_share * eth_share,
            "spy": spy_share,
            "stable": stable_share,
            "alt": 0.0,
        }
    )


def _eth_share_for_snapshot(
    snapshot: PortfolioSnapshot,
    *,
    rule: EthBtcContinuousWeightRule,
) -> float | None:
    ratio_state = snapshot.eth_btc_ratio_state
    if ratio_state is None or ratio_state.cooldown_state.active:
        return None
    return score_dma_distance(
        _ratio_deviation(ratio_state),
        band=rule.rotation_max_deviation,
    )


def _ratio_deviation(ratio_state: EthBtcRatioState | None) -> float | None:
    if ratio_state is None or ratio_state.ratio_dma_200 <= 0.0:
        return None
    return (ratio_state.ratio - ratio_state.ratio_dma_200) / ratio_state.ratio_dma_200


__all__ = ["EthBtcContinuousWeightRule"]

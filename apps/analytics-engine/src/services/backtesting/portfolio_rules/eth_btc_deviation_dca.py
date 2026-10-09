"""Portfolio rule 22: DCA ETH/BTC allocation on large DMA deviations."""

from __future__ import annotations

from dataclasses import dataclass, replace
from itertools import pairwise
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
class DeviationTier:
    """One band of the ratio's distance from its 200-day DMA."""

    name: str
    # The tier applies from this absolute deviation outwards.
    threshold: float
    # Share of the source leg that moves to the destination.
    rotation_fraction: float
    cooldown_days: int


@dataclass(frozen=True)
class DeviationLeg:
    """Which allocation key moves into which when a tier is hit."""

    source: str
    destination: str


@dataclass(frozen=True)
class _TierMatch:
    deviation: float
    tier: DeviationTier
    leg: DeviationLeg

    @property
    def cooldown_suffix(self) -> str:
        return f"{self.tier.name}_to_{self.leg.destination}"

    @property
    def allocation_name(self) -> str:
        return f"portfolio_eth_btc_deviation_{self.cooldown_suffix}"


@dataclass(frozen=True, kw_only=True)
class EthBtcDeviationDcaRule:
    name: str
    priority: int
    # Strongest tier first; each tier has its own cooldown, so a mild move that
    # just fired does not block a stronger one.
    tiers: tuple[DeviationTier, ...]
    # Ratio far below its DMA: the leg that moves. ``None`` turns it off.
    below: DeviationLeg | None
    # Ratio far above its DMA: the mirror image. ``None`` turns it off.
    above: DeviationLeg | None
    rule_group: RuleGroup = "cross"
    description: str = (
        "Mean-revert BTC/ETH allocation when ETH/BTC ratio is far from its 200-day DMA."
    )

    def __post_init__(self) -> None:
        thresholds = [tier.threshold for tier in self.tiers]
        if not thresholds or thresholds[-1] <= 0.0:
            raise ValueError("Deviation tiers need positive thresholds")
        if any(stronger <= weaker for stronger, weaker in pairwise(thresholds)):
            raise ValueError("Deviation tiers must be ordered strongest first")

    @property
    def cooldown_days(self) -> int:
        """The shortest wait before the rule can fire again (tiers override it)."""
        return min(tier.cooldown_days for tier in self.tiers)

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return _match_for_snapshot(snapshot, rule=self) is not None

    def cooldown_key(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> CooldownKey:
        del config
        return (self.name, _require_match(snapshot, rule=self).cooldown_suffix)

    def cooldown_days_for_snapshot(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> int:
        del config
        return _require_match(snapshot, rule=self).tier.cooldown_days

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        match = _require_match(snapshot, rule=self)
        target = current_target(snapshot)
        source_key = match.leg.source
        destination_key = match.leg.destination
        rotated = (
            max(0.0, float(target.get(source_key, 0.0))) * match.tier.rotation_fraction
        )
        target[source_key] = max(0.0, float(target.get(source_key, 0.0)) - rotated)
        target[destination_key] = (
            max(0.0, float(target.get(destination_key, 0.0))) + rotated
        )
        intent = eth_btc_ratio_rotation_intent(
            snapshot=snapshot,
            config=config,
            target=target,
            allocation_name=match.allocation_name,
            rule_group=self.rule_group,
            starts_ratio_cooldown=False,
        )
        diagnostics: dict[str, Any] = dict(intent.diagnostics or {})
        diagnostics[DIAG_PORTFOLIO_RULE_COOLDOWN_KEY] = [
            self.name,
            match.cooldown_suffix,
        ]
        diagnostics["eth_btc_ratio_deviation"] = match.deviation
        diagnostics["portfolio_rule_tier"] = match.tier.name
        return replace(intent, diagnostics=diagnostics)


def _require_match(
    snapshot: PortfolioSnapshot,
    *,
    rule: EthBtcDeviationDcaRule,
) -> _TierMatch:
    match = _match_for_snapshot(snapshot, rule=rule)
    if match is None:
        raise ValueError("ETH/BTC deviation DCA intent requested without a match")
    return match


def _match_for_snapshot(
    snapshot: PortfolioSnapshot,
    *,
    rule: EthBtcDeviationDcaRule,
) -> _TierMatch | None:
    deviation = _ratio_deviation(snapshot.eth_btc_ratio_state)
    if deviation is None:
        return None
    for leg, magnitude in ((rule.below, -deviation), (rule.above, deviation)):
        if leg is None:
            continue
        for tier in rule.tiers:
            if magnitude >= tier.threshold:
                return _TierMatch(deviation=deviation, tier=tier, leg=leg)
    return None


def _ratio_deviation(ratio_state: EthBtcRatioState | None) -> float | None:
    if ratio_state is None:
        return None
    explicit = getattr(ratio_state, "deviation_from_dma_200", None)
    if isinstance(explicit, int | float) and not isinstance(explicit, bool):
        return float(explicit)
    if ratio_state.ratio_dma_200 <= 0.0:
        return None
    return (ratio_state.ratio - ratio_state.ratio_dma_200) / ratio_state.ratio_dma_200


__all__ = ["DeviationLeg", "DeviationTier", "EthBtcDeviationDcaRule"]

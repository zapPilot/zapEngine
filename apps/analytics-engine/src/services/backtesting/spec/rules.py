"""The rule kinds a strategy spec can list, and how each becomes a rule object.

Every kind spells out all of its behavior: nothing is defaulted, so reading a
spec is reading the strategy. Array order in the spec is precedence: the first
rule that matches decides.
"""

from __future__ import annotations

from typing import Annotated, Literal, get_args

from pydantic import Field, field_validator

from src.services.backtesting.portfolio_rules.base import FgiRegime, PortfolioRule
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_deviation_dca import (
    DeviationLeg,
    DeviationTier,
    EthBtcDeviationDcaRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.portfolio_rules.fgi_downshift_dca_sell import (
    FgiDownshiftDcaSellRule,
)
from src.services.backtesting.portfolio_rules.spy_latch import SpyLatchRule
from src.services.backtesting.portfolio_rules.technical_experiments import (
    TechnicalDcaBuyRule,
    TechnicalDcaSellRule,
)
from src.services.backtesting.spec.common import (
    TUNABLE,
    Asset,
    AssetThresholds,
    BuyStep,
    Holding,
    ProceedsSpec,
    Regime,
    RegimeMultipliers,
    RuleCooldown,
    RuleId,
    SellStep,
    Slug,
    SpecModel,
)
from src.services.backtesting.spec.triggers import TriggerSpec

REGIME_ORDER: tuple[Regime, ...] = (
    "extreme_fear",
    "fear",
    "neutral",
    "greed",
    "extreme_greed",
)


def _in_regime_order(regimes: tuple[Regime, ...]) -> tuple[Regime, ...]:
    return tuple(sorted(regimes, key=REGIME_ORDER.index))


class DmaCrossDownExit(SpecModel):
    """Sells an asset to stable when its price crosses below its 200-day DMA."""

    kind: Literal["dma_cross_down_exit"]
    id: RuleId
    cooldown_days: RuleCooldown
    peer_groups: tuple[tuple[Asset, ...], ...] = Field(
        description=(
            "Assets that leave together when one of them crosses down. An asset "
            "in no group leaves alone."
        ),
    )
    proceeds: ProceedsSpec = Field(description="Where the cash from the exits goes.")

    def to_rule(self, priority: int) -> PortfolioRule:
        return CrossDownExitRule(
            name=self.id,
            priority=priority,
            cooldown_days=self.cooldown_days,
            peer_groups=tuple(tuple(group) for group in self.peer_groups),
            proceeds=self.proceeds.to_routing(),
        )


class DmaCrossUpRebalance(SpecModel):
    """Equal-weights every asset above its DMA when one of them crosses up."""

    kind: Literal["dma_cross_up_rebalance"]
    id: RuleId
    cooldown_days: int = Field(
        ge=0,
        le=365,
        description="Days an asset that triggered the rule cannot trigger it again.",
        json_schema_extra=TUNABLE,
    )

    def to_rule(self, priority: int) -> PortfolioRule:
        return CrossUpEqualWeightRule(
            name=self.id,
            priority=priority,
            cooldown_days=self.cooldown_days,
        )


class RotationLeg(SpecModel):
    sources: tuple[Holding, ...] = Field(
        description="Holdings swept into the destination.",
    )
    destination: Holding = Field(description="Holding that receives everything.")


class RatioCrossRotation(SpecModel):
    """Rotates between BTC and ETH when the ETH/BTC ratio crosses its 200-day DMA."""

    kind: Literal["ratio_cross_rotation"]
    id: RuleId
    cooldown_days: RuleCooldown
    cross_up: RotationLeg = Field(
        description="Move when the ratio crosses above its DMA (ETH is the stronger leg).",
    )
    cross_down: RotationLeg = Field(
        description="Move when the ratio crosses below its DMA.",
    )

    def to_rule(self, priority: int) -> PortfolioRule:
        return EthBtcRatioRotationRule(
            name=self.id,
            priority=priority,
            cooldown_days=self.cooldown_days,
            up_sources=_keys(self.cross_up.sources),
            up_destination=self.cross_up.destination.lower(),
            down_sources=_keys(self.cross_down.sources),
            down_destination=self.cross_down.destination.lower(),
        )


class DeviationTierSpec(SpecModel):
    name: Slug = Field(description="Tier name; it appears in the trade's name.")
    threshold: float = Field(
        gt=0.0,
        le=10.0,
        description="The tier applies from this distance from the ratio's DMA outwards.",
        json_schema_extra=TUNABLE,
    )
    rotation_fraction: float = Field(
        gt=0.0,
        le=1.0,
        description="Share of the source leg that moves.",
        json_schema_extra=TUNABLE,
    )
    cooldown_days: int = Field(
        ge=0,
        le=365,
        description="Days this tier stays off after it trades.",
        json_schema_extra=TUNABLE,
    )


class DeviationLegSpec(SpecModel):
    source: Literal["BTC", "ETH"] = Field(description="Holding the rotation sells.")
    destination: Literal["BTC", "ETH"] = Field(description="Holding it buys.")


class RatioDeviationRotation(SpecModel):
    """Moves part of BTC or ETH into the other when the ratio is far from its DMA."""

    kind: Literal["ratio_deviation_rotation"]
    id: RuleId
    tiers: tuple[DeviationTierSpec, ...] = Field(
        min_length=1,
        description=(
            "Distance bands, strongest first. A stronger move is not blocked by "
            "the cooldown of a milder one."
        ),
    )
    below: DeviationLegSpec | None = Field(
        description="Move when the ratio is far below its DMA; null turns it off.",
    )
    above: DeviationLegSpec | None = Field(
        description="Move when the ratio is far above its DMA; null turns it off.",
    )

    def to_rule(self, priority: int) -> PortfolioRule:
        return EthBtcDeviationDcaRule(
            name=self.id,
            priority=priority,
            tiers=tuple(
                DeviationTier(
                    name=tier.name,
                    threshold=tier.threshold,
                    rotation_fraction=tier.rotation_fraction,
                    cooldown_days=tier.cooldown_days,
                )
                for tier in self.tiers
            ),
            below=_deviation_leg(self.below),
            above=_deviation_leg(self.above),
        )


class DmaOverextensionTrim(SpecModel):
    """Sells a slice of an asset that has run far above its DMA."""

    kind: Literal["dma_overextension_trim"]
    id: RuleId
    cooldown_days: RuleCooldown
    sell_step: SellStep
    thresholds: AssetThresholds = Field(
        description="How far above its DMA an asset may run before it is sold into.",
    )
    fgi_multipliers: RegimeMultipliers = Field(
        description=(
            "Multiplies the thresholds by the asset's fear/greed regime. Below 1 "
            "the sale starts earlier."
        ),
    )
    proceeds: ProceedsSpec = Field(description="Where the cash from the sales goes.")

    def to_rule(self, priority: int) -> PortfolioRule:
        return DmaOverextensionDcaSellRule(
            name=self.id,
            priority=priority,
            cooldown_days=self.cooldown_days,
            sell_step=self.sell_step,
            proceeds=self.proceeds.to_routing(),
            dma_overextension_thresholds=self.thresholds.model_dump(),
            fgi_threshold_multipliers={
                FgiRegime(regime): multiplier
                for regime, multiplier in self.fgi_multipliers.model_dump().items()
            },
        )


class FgiDownshiftTrim(SpecModel):
    """Sells a slice of an asset when its fear/greed regime cools off."""

    kind: Literal["fgi_downshift_trim"]
    id: RuleId
    cooldown_days: RuleCooldown
    sell_step: SellStep
    from_regimes: tuple[Regime, ...] = Field(
        min_length=1,
        description="Regimes the asset was in the day before.",
    )
    to_regimes: tuple[Regime, ...] = Field(
        min_length=1,
        description="Regimes the asset is in today.",
    )
    proceeds: ProceedsSpec = Field(description="Where the cash from the sales goes.")

    _order_regimes = field_validator("from_regimes", "to_regimes")(_in_regime_order)

    def to_rule(self, priority: int) -> PortfolioRule:
        return FgiDownshiftDcaSellRule(
            name=self.id,
            priority=priority,
            cooldown_days=self.cooldown_days,
            sell_step=self.sell_step,
            from_regimes=frozenset(FgiRegime(regime) for regime in self.from_regimes),
            to_regimes=frozenset(FgiRegime(regime) for regime in self.to_regimes),
            proceeds=self.proceeds.to_routing(),
        )


class TechnicalTrim(SpecModel):
    """Sells a slice of an asset above its DMA when a technical signal fires."""

    kind: Literal["technical_trim"]
    id: RuleId
    cooldown_days: RuleCooldown
    sell_step: SellStep
    trigger: TriggerSpec = Field(
        description="The technical signal, read for each asset that is above its DMA.",
    )
    proceeds: ProceedsSpec = Field(description="Where the cash from the sales goes.")

    def to_rule(self, priority: int) -> PortfolioRule:
        return TechnicalDcaSellRule(
            name=self.id,
            priority=priority,
            description=_research_description("trim", self.trigger.signal),
            predicate=self.trigger.to_trigger(),
            cooldown_days=self.cooldown_days,
            sell_step=self.sell_step,
            proceeds=self.proceeds.to_routing(),
        )


class TechnicalAdd(SpecModel):
    """Buys into an asset above its DMA, out of stable, when a technical signal fires."""

    kind: Literal["technical_add"]
    id: RuleId
    cooldown_days: RuleCooldown
    buy_step: BuyStep
    trigger: TriggerSpec = Field(
        description="The technical signal, read for each asset that is above its DMA.",
    )

    def to_rule(self, priority: int) -> PortfolioRule:
        return TechnicalDcaBuyRule(
            name=self.id,
            priority=priority,
            description=_research_description("buy", self.trigger.signal),
            predicate=self.trigger.to_trigger(),
            cooldown_days=self.cooldown_days,
            buy_step=self.buy_step,
        )


RuleModel = (
    DmaCrossDownExit
    | DmaCrossUpRebalance
    | RatioCrossRotation
    | RatioDeviationRotation
    | DmaOverextensionTrim
    | FgiDownshiftTrim
    | TechnicalTrim
    | TechnicalAdd
)
RuleSpec = Annotated[RuleModel, Field(discriminator="kind")]
# The tag each model carries, as pydantic reports it in an error location.
RULE_KINDS: frozenset[str] = frozenset(
    get_args(model.model_fields["kind"].annotation)[0] for model in get_args(RuleModel)
)


class SpyLatchOverlay(SpecModel):
    """After SPY crosses up, parks fresh stable in SPY for a few days."""

    kind: Literal["spy_latch"]
    id: Slug = Field(description="Name of the overlay in decision traces.")
    follow_through_days: int = Field(
        ge=1,
        le=90,
        description="Days after the cross-up during which new stable goes to SPY.",
        json_schema_extra=TUNABLE,
    )

    def to_rule(self, priority: int) -> PortfolioRule:
        return SpyLatchRule(
            name=self.id,
            priority=priority,
            follow_through_days=self.follow_through_days,
        )


OverlaySpec = SpyLatchOverlay


def _research_description(verb: str, signal: str) -> str:
    return f"Research-only {verb} on the {signal} signal."


def _keys(holdings: tuple[Holding, ...]) -> tuple[str, ...]:
    return tuple(holding.lower() for holding in holdings)


def _deviation_leg(leg: DeviationLegSpec | None) -> DeviationLeg | None:
    if leg is None:
        return None
    return DeviationLeg(source=leg.source.lower(), destination=leg.destination.lower())


__all__ = [
    "DmaCrossDownExit",
    "DmaCrossUpRebalance",
    "DmaOverextensionTrim",
    "FgiDownshiftTrim",
    "OverlaySpec",
    "REGIME_ORDER",
    "RULE_KINDS",
    "RatioCrossRotation",
    "RatioDeviationRotation",
    "RuleModel",
    "RuleSpec",
    "SpyLatchOverlay",
    "TechnicalAdd",
    "TechnicalTrim",
]

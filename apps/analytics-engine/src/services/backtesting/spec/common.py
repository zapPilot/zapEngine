"""Building blocks shared by the strategy spec models."""

from __future__ import annotations

from typing import Annotated, Any, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from src.services.backtesting.portfolio_rules.base import ProceedsRouting
from src.services.backtesting.sizing.base import SizingStrategy
from src.services.backtesting.sizing.flat import FlatSizing
from src.services.backtesting.sizing.weights import RelativeSizing

Asset = Literal["SPY", "BTC", "ETH"]
# An asset or the cash bucket.
Holding = Literal["SPY", "BTC", "ETH", "STABLE"]
Regime = Literal["extreme_fear", "fear", "neutral", "greed", "extreme_greed"]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{2,47}$")]
# Marks a number or flag that is a behavior knob: sweeps vary it and the liveness
# check perturbs it. Identity, structure and data preparation are not tunable.
TUNABLE: dict[str, Any] = {"x-tunable": True}
# Fields every rule kind shares.
RuleId = Annotated[Slug, Field(description="Name of the rule in decision traces.")]
RuleCooldown = Annotated[
    int,
    Field(
        ge=0,
        le=365,
        description="Days the rule stays off after it trades.",
        json_schema_extra=TUNABLE,
    ),
]
SellStep = Annotated[
    float,
    Field(
        gt=0.0,
        le=1.0,
        description=(
            "Share sold per matching asset: of the portfolio under absolute "
            "sizing, of the asset's own position under relative sizing."
        ),
        json_schema_extra=TUNABLE,
    ),
]
BuyStep = Annotated[
    float,
    Field(
        gt=0.0,
        le=1.0,
        description="Share of the portfolio bought per matching asset, out of stable.",
        json_schema_extra=TUNABLE,
    ),
]


class SpecModel(BaseModel):
    """Base of every spec model: unknown keys are errors, values are immutable."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class AbsoluteSizingSpec(SpecModel):
    """A sale is a share of the portfolio. This is how every sale read before sizing existed."""

    mode: Literal["absolute"]

    def to_sizing(self) -> SizingStrategy:
        return FlatSizing()


class RelativeSizingSpec(SpecModel):
    """A sale is a share of the asset's own position, and it never cuts into a core."""

    mode: Literal["relative"]
    floor_weight: float = Field(
        ge=0.0,
        lt=1.0,
        description="Share of the portfolio the asset is never sold below.",
        json_schema_extra=TUNABLE,
    )

    def to_sizing(self) -> SizingStrategy:
        return RelativeSizing(floor_weight=self.floor_weight)


SizingModel = AbsoluteSizingSpec | RelativeSizingSpec
SizingSpec = Annotated[SizingModel, Field(discriminator="mode")]
# What a trim that does not name its sizing does: the way sales always read.
ABSOLUTE_SIZING = AbsoluteSizingSpec(mode="absolute")
# The tag each model carries, as pydantic reports it in an error location.
SIZING_MODES: frozenset[str] = frozenset(
    get_args(model.model_fields["mode"].annotation)[0]
    for model in get_args(SizingModel)
)


class AssetCooldowns(SpecModel):
    """One cooldown, in days, per asset."""

    SPY: int = Field(
        ge=0,
        le=365,
        description="Cooldown for SPY.",
        json_schema_extra=TUNABLE,
    )
    BTC: int = Field(
        ge=0,
        le=365,
        description="Cooldown for BTC.",
        json_schema_extra=TUNABLE,
    )
    ETH: int = Field(
        ge=0,
        le=365,
        description="Cooldown for ETH.",
        json_schema_extra=TUNABLE,
    )


class AssetThresholds(SpecModel):
    """One distance above the 200-day DMA, as a fraction, per asset."""

    SPY: float = Field(
        gt=0.0,
        le=10.0,
        description="Threshold for SPY.",
        json_schema_extra=TUNABLE,
    )
    BTC: float = Field(
        gt=0.0,
        le=10.0,
        description="Threshold for BTC.",
        json_schema_extra=TUNABLE,
    )
    ETH: float = Field(
        gt=0.0,
        le=10.0,
        description="Threshold for ETH.",
        json_schema_extra=TUNABLE,
    )


class RegimeMultipliers(SpecModel):
    """One multiplier per fear/greed regime."""

    extreme_fear: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is extreme fear.",
        json_schema_extra=TUNABLE,
    )
    fear: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is fear.",
        json_schema_extra=TUNABLE,
    )
    neutral: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is neutral.",
        json_schema_extra=TUNABLE,
    )
    greed: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is greed.",
        json_schema_extra=TUNABLE,
    )
    extreme_greed: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is extreme greed.",
        json_schema_extra=TUNABLE,
    )


class ProceedsShare(SpecModel):
    asset: Asset = Field(description="Asset that receives part of the proceeds.")
    share: float = Field(
        gt=0.0,
        le=1.0,
        description="Fraction of the proceeds that goes to the asset.",
        json_schema_extra=TUNABLE,
    )


class ProceedsSpec(SpecModel):
    """Where the cash from a sale goes. Whatever is not routed stays in stable."""

    to: tuple[ProceedsShare, ...] = Field(
        description="Assets that receive a share of the proceeds, in order.",
    )

    def to_routing(self) -> ProceedsRouting:
        return ProceedsRouting(to=tuple((part.asset, part.share) for part in self.to))


__all__ = [
    "ABSOLUTE_SIZING",
    "AbsoluteSizingSpec",
    "Asset",
    "AssetCooldowns",
    "AssetThresholds",
    "BuyStep",
    "Holding",
    "ProceedsShare",
    "ProceedsSpec",
    "Regime",
    "RegimeMultipliers",
    "RelativeSizingSpec",
    "RuleCooldown",
    "RuleId",
    "SIZING_MODES",
    "SellStep",
    "SizingModel",
    "SizingSpec",
    "Slug",
    "TUNABLE",
    "SpecModel",
]

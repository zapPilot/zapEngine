"""Building blocks shared by the strategy spec models."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from src.services.backtesting.portfolio_rules.base import ProceedsRouting

Asset = Literal["SPY", "BTC", "ETH"]
# An asset or the cash bucket.
Holding = Literal["SPY", "BTC", "ETH", "STABLE"]
Regime = Literal["extreme_fear", "fear", "neutral", "greed", "extreme_greed"]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{2,47}$")]
# Fields every rule kind shares.
RuleId = Annotated[Slug, Field(description="Name of the rule in decision traces.")]
RuleCooldown = Annotated[
    int,
    Field(ge=0, le=365, description="Days the rule stays off after it trades."),
]
SellStep = Annotated[
    float,
    Field(
        gt=0.0,
        le=1.0,
        description="Share of the portfolio sold per matching asset.",
    ),
]


class SpecModel(BaseModel):
    """Base of every spec model: unknown keys are errors, values are immutable."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class AssetCooldowns(SpecModel):
    """One cooldown, in days, per asset."""

    SPY: int = Field(ge=0, le=365, description="Cooldown for SPY.")
    BTC: int = Field(ge=0, le=365, description="Cooldown for BTC.")
    ETH: int = Field(ge=0, le=365, description="Cooldown for ETH.")


class AssetThresholds(SpecModel):
    """One distance above the 200-day DMA, as a fraction, per asset."""

    SPY: float = Field(gt=0.0, le=10.0, description="Threshold for SPY.")
    BTC: float = Field(gt=0.0, le=10.0, description="Threshold for BTC.")
    ETH: float = Field(gt=0.0, le=10.0, description="Threshold for ETH.")


class RegimeMultipliers(SpecModel):
    """One multiplier per fear/greed regime."""

    extreme_fear: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is extreme fear.",
    )
    fear: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is fear.",
    )
    neutral: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is neutral.",
    )
    greed: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is greed.",
    )
    extreme_greed: float = Field(
        ge=0.0,
        le=2.0,
        description="Multiplier while the regime is extreme greed.",
    )


class ProceedsShare(SpecModel):
    asset: Asset = Field(description="Asset that receives part of the proceeds.")
    share: float = Field(
        gt=0.0,
        le=1.0,
        description="Fraction of the proceeds that goes to the asset.",
    )


class ProceedsSpec(SpecModel):
    """Where the cash from a sale goes. Whatever is not routed stays in stable."""

    to: tuple[ProceedsShare, ...] = Field(
        description="Assets that receive a share of the proceeds, in order.",
    )

    def to_routing(self) -> ProceedsRouting:
        return ProceedsRouting(to=tuple((part.asset, part.share) for part in self.to))


__all__ = [
    "Asset",
    "AssetCooldowns",
    "AssetThresholds",
    "Holding",
    "ProceedsShare",
    "ProceedsSpec",
    "Regime",
    "RegimeMultipliers",
    "RuleCooldown",
    "RuleId",
    "SellStep",
    "Slug",
    "SpecModel",
]

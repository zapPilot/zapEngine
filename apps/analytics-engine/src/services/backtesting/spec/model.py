"""The strategy spec: a declarative, validated description of a rule strategy."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from src.services.backtesting.spec.common import (
    TUNABLE,
    AssetCooldowns,
    Slug,
    SpecModel,
)
from src.services.backtesting.spec.rules import OverlaySpec, RuleSpec

SPEC_FORMAT = "strategy-spec/1"


class DmaSignal(SpecModel):
    """The 200-day moving-average signal of each asset."""

    feature: Literal["dma_200"] = Field(
        description="Moving average that prices are compared with.",
    )
    cross_cooldown_days: AssetCooldowns = Field(
        description=(
            "Days after a cross during which the opposite cross of the same asset "
            "is ignored."
        ),
    )
    cross_on_touch: bool = Field(
        description="Count a price that touches its DMA as a cross.",
        json_schema_extra=TUNABLE,
    )


class RatioSignal(SpecModel):
    """The ETH/BTC ratio against its own 200-day moving average."""

    cross_cooldown_days: int = Field(
        ge=0,
        le=365,
        description="Days after a ratio rotation during which the next cross is ignored.",
        json_schema_extra=TUNABLE,
    )


class Signals(SpecModel):
    warmup_days: int = Field(
        ge=0,
        le=365,
        description="Days of history replayed before the first decision.",
    )
    dma: DmaSignal
    ratio: RatioSignal


class Execution(SpecModel):
    mode: Literal["full_target"] = Field(
        description="A matched rule moves the portfolio to its target in full.",
    )


class StrategySpec(SpecModel):
    """A rule strategy over SPY, BTC and ETH against stable."""

    spec_format: Literal["strategy-spec/1"] = Field(
        description="Version of this format.",
    )
    id: Slug = Field(description="Name of the strategy.")
    version: int = Field(
        ge=1,
        description="Bumped whenever the behavior changes; pinned by the lock file.",
    )
    description: str = Field(
        min_length=1,
        max_length=500,
        description="What the strategy does, in a sentence or two.",
    )
    signals: Signals = Field(description="How the signals the rules read are built.")
    rules: tuple[RuleSpec, ...] = Field(
        min_length=1,
        description=(
            "Rules in precedence order: the first one that matches and is off "
            "cooldown decides the day."
        ),
    )
    guards: tuple[()] = Field(
        description=(
            "Always empty. The format once had guards; the key stays so that the "
            "behavior hash of every locked spec stays what it was."
        ),
    )
    overlays: tuple[OverlaySpec, ...] = Field(
        description="Adjustments applied to the decision after the rules and guards.",
    )
    execution: Execution = Field(description="How a decision becomes trades.")


__all__ = [
    "DmaSignal",
    "Execution",
    "RatioSignal",
    "SPEC_FORMAT",
    "Signals",
    "StrategySpec",
]

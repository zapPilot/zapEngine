"""The technical signals a research rule can act on, as spec models.

Each model spells out the level its signal fires at (nothing is defaulted) and
becomes the trigger object the rule holds. A signal is read for one asset at a
time, from that asset's own close history, so it never looks ahead.
"""

from __future__ import annotations

from typing import Annotated, Literal, get_args

from pydantic import Field

from src.services.backtesting.portfolio_rules.technical_triggers import (
    BollingerLowerBand,
    BollingerUpperBand,
    Breakdown20d,
    Breakout20d,
    MacdBearishCross,
    MacdBullishCross,
    MomentumBreakdown,
    RsiBearishDivergence,
    RsiBullishDivergence,
    RsiOverboughtTurningDown,
    RsiOversoldRecovering,
    TechnicalTrigger,
    VolatilitySpike,
)
from src.services.backtesting.spec.common import TUNABLE, SpecModel


class RsiBearishDivergenceSignal(SpecModel):
    """Price makes a newer high while the trailing RSI fails to confirm it."""

    signal: Literal["rsi_bearish_divergence"]

    def to_trigger(self) -> TechnicalTrigger:
        return RsiBearishDivergence()


class RsiBullishDivergenceSignal(SpecModel):
    """Price makes a newer low while the trailing RSI refuses to follow it down."""

    signal: Literal["rsi_bullish_divergence"]

    def to_trigger(self) -> TechnicalTrigger:
        return RsiBullishDivergence()


class RsiOverboughtTurningDownSignal(SpecModel):
    """RSI(14) is overbought and its five-day slope has turned down."""

    signal: Literal["rsi_overbought_turning_down"]
    rsi_at_least: float = Field(
        gt=0.0,
        lt=100.0,
        description="RSI(14) level at or above which the asset counts as overbought.",
        json_schema_extra=TUNABLE,
    )

    def to_trigger(self) -> TechnicalTrigger:
        return RsiOverboughtTurningDown(rsi_at_least=self.rsi_at_least)


class RsiOversoldRecoveringSignal(SpecModel):
    """RSI(14) is oversold and its five-day slope has turned up."""

    signal: Literal["rsi_oversold_recovering"]
    rsi_at_most: float = Field(
        gt=0.0,
        lt=100.0,
        description="RSI(14) level at or below which the asset counts as oversold.",
        json_schema_extra=TUNABLE,
    )

    def to_trigger(self) -> TechnicalTrigger:
        return RsiOversoldRecovering(rsi_at_most=self.rsi_at_most)


class MacdBearishCrossSignal(SpecModel):
    """The MACD(12, 26, 9) histogram crosses below zero today."""

    signal: Literal["macd_bearish_cross"]

    def to_trigger(self) -> TechnicalTrigger:
        return MacdBearishCross()


class MacdBullishCrossSignal(SpecModel):
    """The MACD(12, 26, 9) histogram crosses above zero today."""

    signal: Literal["macd_bullish_cross"]

    def to_trigger(self) -> TechnicalTrigger:
        return MacdBullishCross()


class MomentumBreakdownSignal(SpecModel):
    """Short-term momentum has turned down while the longer trend still stands."""

    signal: Literal["momentum_breakdown"]
    short_momentum_below: float = Field(
        ge=-1.0,
        le=5.0,
        description="30-day price change must be below this (a fraction, 0.1 is 10%).",
        json_schema_extra=TUNABLE,
    )
    long_momentum_above: float = Field(
        ge=-1.0,
        le=5.0,
        description="90-day price change must be above this (a fraction).",
        json_schema_extra=TUNABLE,
    )

    def to_trigger(self) -> TechnicalTrigger:
        return MomentumBreakdown(
            short_momentum_below=self.short_momentum_below,
            long_momentum_above=self.long_momentum_above,
        )


class AssetVolatility(SpecModel):
    """One annualized volatility level per asset."""

    SPY: float = Field(
        gt=0.0,
        le=10.0,
        description="Volatility at which SPY counts as spiking.",
        json_schema_extra=TUNABLE,
    )
    BTC: float = Field(
        gt=0.0,
        le=10.0,
        description="Volatility at which BTC counts as spiking.",
        json_schema_extra=TUNABLE,
    )
    ETH: float = Field(
        gt=0.0,
        le=10.0,
        description="Volatility at which ETH counts as spiking.",
        json_schema_extra=TUNABLE,
    )


class VolatilitySpikeSignal(SpecModel):
    """Annualized 20-day realized volatility is at or above the asset's level."""

    signal: Literal["volatility_spike"]
    thresholds: AssetVolatility = Field(
        description="Annualized volatility per asset (0.8 is 80%).",
    )

    def to_trigger(self) -> TechnicalTrigger:
        return VolatilitySpike(thresholds=self.thresholds.model_dump())


class BollingerUpperBandSignal(SpecModel):
    """The 20-day Bollinger z-score has reached the upper band."""

    signal: Literal["bollinger_upper_band"]
    zscore_at_least: float = Field(
        gt=0.0,
        le=10.0,
        description="Standard deviations above the 20-day mean at which it fires.",
        json_schema_extra=TUNABLE,
    )

    def to_trigger(self) -> TechnicalTrigger:
        return BollingerUpperBand(zscore_at_least=self.zscore_at_least)


class BollingerLowerBandSignal(SpecModel):
    """The 20-day Bollinger z-score has reached the lower band."""

    signal: Literal["bollinger_lower_band"]
    zscore_at_most: float = Field(
        ge=-10.0,
        lt=0.0,
        description="Standard deviations below the 20-day mean at which it fires.",
        json_schema_extra=TUNABLE,
    )

    def to_trigger(self) -> TechnicalTrigger:
        return BollingerLowerBand(zscore_at_most=self.zscore_at_most)


class Breakout20dSignal(SpecModel):
    """Today's close is above the highest close of the 20 days before it."""

    signal: Literal["breakout_20d"]

    def to_trigger(self) -> TechnicalTrigger:
        return Breakout20d()


class Breakdown20dSignal(SpecModel):
    """Today's close is below the lowest close of the 20 days before it."""

    signal: Literal["breakdown_20d"]

    def to_trigger(self) -> TechnicalTrigger:
        return Breakdown20d()


TriggerModel = (
    RsiBearishDivergenceSignal
    | RsiBullishDivergenceSignal
    | RsiOverboughtTurningDownSignal
    | RsiOversoldRecoveringSignal
    | MacdBearishCrossSignal
    | MacdBullishCrossSignal
    | MomentumBreakdownSignal
    | VolatilitySpikeSignal
    | BollingerUpperBandSignal
    | BollingerLowerBandSignal
    | Breakout20dSignal
    | Breakdown20dSignal
)
TriggerSpec = Annotated[TriggerModel, Field(discriminator="signal")]
# The tag each model carries, as pydantic reports it in an error location.
TRIGGER_SIGNALS: frozenset[str] = frozenset(
    get_args(model.model_fields["signal"].annotation)[0]
    for model in get_args(TriggerModel)
)

__all__ = [
    "AssetVolatility",
    "TRIGGER_SIGNALS",
    "BollingerLowerBandSignal",
    "BollingerUpperBandSignal",
    "Breakdown20dSignal",
    "Breakout20dSignal",
    "MacdBearishCrossSignal",
    "MacdBullishCrossSignal",
    "MomentumBreakdownSignal",
    "RsiBearishDivergenceSignal",
    "RsiBullishDivergenceSignal",
    "RsiOverboughtTurningDownSignal",
    "RsiOversoldRecoveringSignal",
    "TriggerModel",
    "TriggerSpec",
    "VolatilitySpikeSignal",
]

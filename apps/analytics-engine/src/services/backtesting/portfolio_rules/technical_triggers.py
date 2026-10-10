"""Conditions on an asset's technical signals that a technical rule acts on.

A trigger answers one question about one asset: does this signal fire today? Each
is a small frozen value, so a rule that holds one can be compared and copied, and
a spec can write it down. The defaults are the thresholds the research rules
shipped with.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar, Protocol

from src.services.backtesting.signals.technical import TechnicalSignalSnapshot


def _at_least(value: float | None, level: float) -> bool:
    return value is not None and value >= level


def _at_most(value: float | None, level: float) -> bool:
    return value is not None and value <= level


def _over(value: float | None, level: float) -> bool:
    return value is not None and value > level


def _under(value: float | None, level: float) -> bool:
    return value is not None and value < level


class TechnicalTrigger(Protocol):
    """A callable condition on one asset's technical snapshot."""

    signal: ClassVar[str]

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool: ...


@dataclass(frozen=True)
class RsiBearishDivergence:
    signal: ClassVar[str] = "rsi_bearish_divergence"

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return technical.bearish_rsi_divergence


@dataclass(frozen=True)
class RsiBullishDivergence:
    signal: ClassVar[str] = "rsi_bullish_divergence"

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return technical.bullish_rsi_divergence


@dataclass(frozen=True)
class RsiOverboughtTurningDown:
    signal: ClassVar[str] = "rsi_overbought_turning_down"
    rsi_at_least: float = 70.0

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return _at_least(technical.rsi_14, self.rsi_at_least) and _under(
            technical.rsi_slope_5d, 0.0
        )


@dataclass(frozen=True)
class RsiOversoldRecovering:
    signal: ClassVar[str] = "rsi_oversold_recovering"
    rsi_at_most: float = 35.0

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return _at_most(technical.rsi_14, self.rsi_at_most) and _over(
            technical.rsi_slope_5d, 0.0
        )


@dataclass(frozen=True)
class MacdBearishCross:
    signal: ClassVar[str] = "macd_bearish_cross"

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return technical.macd_bearish_cross


@dataclass(frozen=True)
class MacdBullishCross:
    signal: ClassVar[str] = "macd_bullish_cross"

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return technical.macd_bullish_cross


@dataclass(frozen=True)
class MomentumBreakdown:
    signal: ClassVar[str] = "momentum_breakdown"
    short_momentum_below: float = 0.0
    long_momentum_above: float = 0.0

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return _under(technical.momentum_30d, self.short_momentum_below) and _over(
            technical.momentum_90d, self.long_momentum_above
        )


@dataclass(frozen=True)
class VolatilitySpike:
    signal: ClassVar[str] = "volatility_spike"
    thresholds: dict[str, float] = field(
        default_factory=lambda: {"SPY": 0.30, "BTC": 0.80, "ETH": 1.00}
    )

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        threshold = self.thresholds.get(symbol)
        return threshold is not None and _at_least(
            technical.realized_volatility_20d, threshold
        )


@dataclass(frozen=True)
class BollingerUpperBand:
    signal: ClassVar[str] = "bollinger_upper_band"
    zscore_at_least: float = 2.0

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return _at_least(technical.bollinger_zscore_20, self.zscore_at_least)


@dataclass(frozen=True)
class BollingerLowerBand:
    signal: ClassVar[str] = "bollinger_lower_band"
    zscore_at_most: float = -2.0

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return _at_most(technical.bollinger_zscore_20, self.zscore_at_most)


@dataclass(frozen=True)
class Breakout20d:
    signal: ClassVar[str] = "breakout_20d"

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return technical.breakout_20d


@dataclass(frozen=True)
class Breakdown20d:
    signal: ClassVar[str] = "breakdown_20d"

    def __call__(self, symbol: str, technical: TechnicalSignalSnapshot) -> bool:
        del symbol
        return technical.breakdown_20d


__all__ = [
    "BollingerLowerBand",
    "BollingerUpperBand",
    "Breakdown20d",
    "Breakout20d",
    "MacdBearishCross",
    "MacdBullishCross",
    "MomentumBreakdown",
    "RsiBearishDivergence",
    "RsiBullishDivergence",
    "RsiOverboughtTurningDown",
    "RsiOversoldRecovering",
    "TechnicalTrigger",
    "VolatilitySpike",
]

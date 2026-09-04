"""Non-default technical-indicator portfolio-rule experiments.

These rules intentionally live in the existing portfolio-rule universe so they
can be enabled through `enabled_rules` for attribution without changing the
canonical default rule set. Their priorities stay below the existing default
rules in precedence (numerically above them), so default + experiment runs keep
canonical decisions first and use technical rules as an additive fallback layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    DcaSellRuleBase,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_split_proceeds,
    normalize_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


def _above_dma_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if snapshot.assets[symbol].zone == "above"
    ]


def _technical_signals_for_symbols(
    snapshot: PortfolioSnapshot,
    symbols: list[str],
) -> dict[str, dict[str, float | bool | None]]:
    payload: dict[str, dict[str, float | bool | None]] = {}
    for symbol in symbols:
        normalized = normalize_symbol(symbol)
        technical = snapshot.assets[normalized].technical
        payload[normalized] = {
            "rsi_14": technical.rsi_14,
            "rsi_slope_5d": technical.rsi_slope_5d,
            "realized_volatility_20d": technical.realized_volatility_20d,
            "momentum_30d": technical.momentum_30d,
            "momentum_90d": technical.momentum_90d,
            "macd_12_26": technical.macd_12_26,
            "macd_signal_9": technical.macd_signal_9,
            "macd_histogram": technical.macd_histogram,
            "bollinger_zscore_20": technical.bollinger_zscore_20,
            "bearish_rsi_divergence": technical.bearish_rsi_divergence,
            "bullish_rsi_divergence": technical.bullish_rsi_divergence,
            "macd_bearish_cross": technical.macd_bearish_cross,
            "macd_bullish_cross": technical.macd_bullish_cross,
            "breakout_20d": technical.breakout_20d,
            "breakdown_20d": technical.breakdown_20d,
        }
    return payload


def _with_technical_diagnostics(
    intent: AllocationIntent,
    *,
    snapshot: PortfolioSnapshot,
    symbols: list[str],
) -> AllocationIntent:
    diagnostics = dict(intent.diagnostics or {})
    diagnostics["technical_signals"] = _technical_signals_for_symbols(
        snapshot,
        symbols,
    )
    return replace(intent, diagnostics=diagnostics)


class _TechnicalSellRuleBase(DcaSellRuleBase):
    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = self._matching_symbols(snapshot)
        intent = super().build_intent(snapshot, config=config)
        return _with_technical_diagnostics(
            intent,
            snapshot=snapshot,
            symbols=matching_symbols,
        )


class _TechnicalBuyRuleBase(DcaBuyRuleBase):
    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = self._matching_symbols(snapshot)
        intent = super().build_intent(snapshot, config=config)
        return _with_technical_diagnostics(
            intent,
            snapshot=snapshot,
            symbols=matching_symbols,
        )


@dataclass(frozen=True)
class RsiBearishDivergenceDcaSellRule(_TechnicalSellRuleBase):
    name: str = "rsi_bearish_divergence_dca_sell"
    priority: int = 60
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Research-only trim when price makes a newer high while trailing RSI "
        "fails to confirm it."
    )
    allocation_name: str = "portfolio_rsi_bearish_divergence_dca_sell"
    reason: str = "portfolio_rsi_bearish_divergence_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in _above_dma_symbols(snapshot)
            if snapshot.assets[symbol].technical.bearish_rsi_divergence
        ]

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class RsiOverboughtDcaSellRule(_TechnicalSellRuleBase):
    name: str = "rsi_overbought_dca_sell"
    priority: int = 61
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Research-only trim when RSI is overbought and its five-day slope turns down."
    )
    allocation_name: str = "portfolio_rsi_overbought_dca_sell"
    reason: str = "portfolio_rsi_overbought_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    rsi_threshold: float = 70.0
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        matches: list[str] = []
        for symbol in _above_dma_symbols(snapshot):
            technical = snapshot.assets[symbol].technical
            if (
                technical.rsi_14 is not None
                and technical.rsi_slope_5d is not None
                and technical.rsi_14 >= self.rsi_threshold
                and technical.rsi_slope_5d < 0.0
            ):
                matches.append(symbol)
        return matches

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class MomentumBreakdownDcaSellRule(_TechnicalSellRuleBase):
    name: str = "momentum_breakdown_dca_sell"
    priority: int = 62
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Research-only trim when 30-day momentum turns negative while 90-day "
        "momentum remains positive."
    )
    allocation_name: str = "portfolio_momentum_breakdown_dca_sell"
    reason: str = "portfolio_momentum_breakdown_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        matches: list[str] = []
        for symbol in _above_dma_symbols(snapshot):
            technical = snapshot.assets[symbol].technical
            if (
                technical.momentum_30d is not None
                and technical.momentum_90d is not None
                and technical.momentum_30d < 0.0
                and technical.momentum_90d > 0.0
            ):
                matches.append(symbol)
        return matches

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class VolatilitySpikeDcaSellRule(_TechnicalSellRuleBase):
    name: str = "volatility_spike_dca_sell"
    priority: int = 63
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Research-only trim when annualized 20-day realized volatility exceeds "
        "an asset-specific threshold."
    )
    allocation_name: str = "portfolio_volatility_spike_dca_sell"
    reason: str = "portfolio_volatility_spike_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    volatility_thresholds: dict[str, float] = field(
        default_factory=lambda: {"SPY": 0.30, "BTC": 0.80, "ETH": 1.00}
    )
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        matches: list[str] = []
        for symbol in _above_dma_symbols(snapshot):
            volatility = snapshot.assets[symbol].technical.realized_volatility_20d
            threshold = self.volatility_thresholds.get(normalize_symbol(symbol))
            if (
                volatility is not None
                and threshold is not None
                and volatility >= threshold
            ):
                matches.append(symbol)
        return matches

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class RsiBullishDivergenceDcaBuyRule(_TechnicalBuyRuleBase):
    name: str = "rsi_bullish_divergence_dca_buy"
    priority: int = 64
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Research-only buy-the-dip rule for bullish RSI divergence while the "
        "asset remains above its long-term trend."
    )
    allocation_name: str = "portfolio_rsi_bullish_divergence_dca_buy"
    reason: str = "portfolio_rsi_bullish_divergence_dca_buy"
    buy_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in _above_dma_symbols(snapshot)
            if snapshot.assets[symbol].technical.bullish_rsi_divergence
        ]


@dataclass(frozen=True)
class RsiOversoldRecoveryDcaBuyRule(_TechnicalBuyRuleBase):
    name: str = "rsi_oversold_recovery_dca_buy"
    priority: int = 65
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Research-only buy-the-dip rule when RSI is oversold and starts recovering "
        "without breaking the long-term trend."
    )
    allocation_name: str = "portfolio_rsi_oversold_recovery_dca_buy"
    reason: str = "portfolio_rsi_oversold_recovery_dca_buy"
    buy_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    rsi_threshold: float = 35.0

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        matches: list[str] = []
        for symbol in _above_dma_symbols(snapshot):
            technical = snapshot.assets[symbol].technical
            if (
                technical.rsi_14 is not None
                and technical.rsi_slope_5d is not None
                and technical.rsi_14 <= self.rsi_threshold
                and technical.rsi_slope_5d > 0.0
            ):
                matches.append(symbol)
        return matches


@dataclass(frozen=True)
class MacdBearishCrossDcaSellRule(_TechnicalSellRuleBase):
    name: str = "macd_bearish_cross_dca_sell"
    priority: int = 66
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Research-only trim on a bearish MACD histogram zero cross."
    allocation_name: str = "portfolio_macd_bearish_cross_dca_sell"
    reason: str = "portfolio_macd_bearish_cross_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in _above_dma_symbols(snapshot)
            if snapshot.assets[symbol].technical.macd_bearish_cross
        ]

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class MacdBullishCrossDcaBuyRule(_TechnicalBuyRuleBase):
    name: str = "macd_bullish_cross_dca_buy"
    priority: int = 67
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Research-only buy on a bullish MACD histogram zero cross."
    allocation_name: str = "portfolio_macd_bullish_cross_dca_buy"
    reason: str = "portfolio_macd_bullish_cross_dca_buy"
    buy_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in _above_dma_symbols(snapshot)
            if snapshot.assets[symbol].technical.macd_bullish_cross
        ]


@dataclass(frozen=True)
class BollingerUpperBandDcaSellRule(_TechnicalSellRuleBase):
    name: str = "bollinger_upper_band_dca_sell"
    priority: int = 68
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Research-only trim when the 20-day Bollinger z-score reaches +2."
    allocation_name: str = "portfolio_bollinger_upper_band_dca_sell"
    reason: str = "portfolio_bollinger_upper_band_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    zscore_threshold: float = 2.0
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        matches: list[str] = []
        for symbol in _above_dma_symbols(snapshot):
            zscore = snapshot.assets[symbol].technical.bollinger_zscore_20
            if zscore is not None and zscore >= self.zscore_threshold:
                matches.append(symbol)
        return matches

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class BollingerLowerBandDcaBuyRule(_TechnicalBuyRuleBase):
    name: str = "bollinger_lower_band_dca_buy"
    priority: int = 69
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Research-only buy when the 20-day Bollinger z-score reaches -2."
    allocation_name: str = "portfolio_bollinger_lower_band_dca_buy"
    reason: str = "portfolio_bollinger_lower_band_dca_buy"
    buy_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    zscore_threshold: float = -2.0

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        matches: list[str] = []
        for symbol in _above_dma_symbols(snapshot):
            zscore = snapshot.assets[symbol].technical.bollinger_zscore_20
            if zscore is not None and zscore <= self.zscore_threshold:
                matches.append(symbol)
        return matches


@dataclass(frozen=True)
class Breakout20dDcaBuyRule(_TechnicalBuyRuleBase):
    name: str = "breakout_20d_dca_buy"
    priority: int = 70
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Research-only buy when price closes above the prior 20-day high."
    allocation_name: str = "portfolio_breakout_20d_dca_buy"
    reason: str = "portfolio_breakout_20d_dca_buy"
    buy_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in _above_dma_symbols(snapshot)
            if snapshot.assets[symbol].technical.breakout_20d
        ]


@dataclass(frozen=True)
class Breakdown20dDcaSellRule(_TechnicalSellRuleBase):
    name: str = "breakdown_20d_dca_sell"
    priority: int = 71
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "Research-only trim when price closes below the prior 20-day low."
    allocation_name: str = "portfolio_breakdown_20d_dca_sell"
    reason: str = "portfolio_breakdown_20d_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    spy_share: float = 0.5

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in _above_dma_symbols(snapshot)
            if snapshot.assets[symbol].technical.breakdown_20d
        ]

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


TECHNICAL_EXPERIMENT_RULES = (
    RsiBearishDivergenceDcaSellRule(),
    RsiOverboughtDcaSellRule(),
    MomentumBreakdownDcaSellRule(),
    VolatilitySpikeDcaSellRule(),
    RsiBullishDivergenceDcaBuyRule(),
    RsiOversoldRecoveryDcaBuyRule(),
    MacdBearishCrossDcaSellRule(),
    MacdBullishCrossDcaBuyRule(),
    BollingerUpperBandDcaSellRule(),
    BollingerLowerBandDcaBuyRule(),
    Breakout20dDcaBuyRule(),
    Breakdown20dDcaSellRule(),
)

TECHNICAL_EXPERIMENT_RULE_NAMES = frozenset(
    rule.name for rule in TECHNICAL_EXPERIMENT_RULES
)


__all__ = [
    "BollingerLowerBandDcaBuyRule",
    "BollingerUpperBandDcaSellRule",
    "Breakdown20dDcaSellRule",
    "Breakout20dDcaBuyRule",
    "MacdBearishCrossDcaSellRule",
    "MacdBullishCrossDcaBuyRule",
    "MomentumBreakdownDcaSellRule",
    "RsiBearishDivergenceDcaSellRule",
    "RsiBullishDivergenceDcaBuyRule",
    "RsiOverboughtDcaSellRule",
    "RsiOversoldRecoveryDcaBuyRule",
    "TECHNICAL_EXPERIMENT_RULE_NAMES",
    "TECHNICAL_EXPERIMENT_RULES",
    "VolatilitySpikeDcaSellRule",
]

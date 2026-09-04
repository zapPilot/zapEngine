"""Non-default technical-indicator portfolio-rule experiments.

These rules intentionally live in the existing portfolio-rule universe so they
can be enabled through `enabled_rules` for attribution without changing the
canonical default rule set.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    DcaSellRuleBase,
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


@dataclass(frozen=True)
class RsiBearishDivergenceDcaSellRule(DcaSellRuleBase):
    name: str = "rsi_bearish_divergence_dca_sell"
    priority: int = 31
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
class RsiOverboughtDcaSellRule(DcaSellRuleBase):
    name: str = "rsi_overbought_dca_sell"
    priority: int = 32
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
class MomentumBreakdownDcaSellRule(DcaSellRuleBase):
    name: str = "momentum_breakdown_dca_sell"
    priority: int = 33
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
class VolatilitySpikeDcaSellRule(DcaSellRuleBase):
    name: str = "volatility_spike_dca_sell"
    priority: int = 34
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
class RsiBullishDivergenceDcaBuyRule(DcaBuyRuleBase):
    name: str = "rsi_bullish_divergence_dca_buy"
    priority: int = 35
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
class RsiOversoldRecoveryDcaBuyRule(DcaBuyRuleBase):
    name: str = "rsi_oversold_recovery_dca_buy"
    priority: int = 36
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


TECHNICAL_EXPERIMENT_RULES = (
    RsiBearishDivergenceDcaSellRule(),
    RsiOverboughtDcaSellRule(),
    MomentumBreakdownDcaSellRule(),
    VolatilitySpikeDcaSellRule(),
    RsiBullishDivergenceDcaBuyRule(),
    RsiOversoldRecoveryDcaBuyRule(),
)

TECHNICAL_EXPERIMENT_RULE_NAMES = frozenset(
    rule.name for rule in TECHNICAL_EXPERIMENT_RULES
)


__all__ = [
    "MomentumBreakdownDcaSellRule",
    "RsiBearishDivergenceDcaSellRule",
    "RsiBullishDivergenceDcaBuyRule",
    "RsiOverboughtDcaSellRule",
    "RsiOversoldRecoveryDcaBuyRule",
    "TECHNICAL_EXPERIMENT_RULE_NAMES",
    "TECHNICAL_EXPERIMENT_RULES",
    "VolatilitySpikeDcaSellRule",
]

"""Non-default technical-indicator portfolio-rule experiments.

These rules intentionally live in the existing portfolio-rule universe so they
can be enabled through `enabled_rules` for attribution without changing the
canonical default rule set. Their priorities stay below the existing default
rules in precedence (numerically above them), so default + experiment runs keep
canonical decisions first and use technical rules as an additive fallback layer.

Every experiment differs from its siblings only in the predicate that selects
matching assets, so the rules are declared as one table over two shared
buy/sell shapes rather than as one class per indicator.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass, field, replace
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    DcaSellRuleBase,
    PortfolioRule,
    PortfolioSnapshot,
    above_dma_symbols,
    add_split_proceeds,
)
from src.services.backtesting.signals.technical import TechnicalSignalSnapshot
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy

TechnicalPredicate = Callable[[str, TechnicalSignalSnapshot], bool]

_RSI_OVERBOUGHT = 70.0
_RSI_OVERSOLD = 35.0
_BOLLINGER_ZSCORE = 2.0
_VOLATILITY_THRESHOLDS: dict[str, float] = {"SPY": 0.30, "BTC": 0.80, "ETH": 1.00}


def _bearish_rsi_divergence(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return technical.bearish_rsi_divergence


def _bullish_rsi_divergence(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return technical.bullish_rsi_divergence


def _macd_bearish_cross(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return technical.macd_bearish_cross


def _macd_bullish_cross(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return technical.macd_bullish_cross


def _breakout_20d(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return technical.breakout_20d


def _breakdown_20d(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return technical.breakdown_20d


def _rsi_overbought_turning_down(
    symbol: str,
    technical: TechnicalSignalSnapshot,
) -> bool:
    del symbol
    return (
        technical.rsi_14 is not None
        and technical.rsi_slope_5d is not None
        and technical.rsi_14 >= _RSI_OVERBOUGHT
        and technical.rsi_slope_5d < 0.0
    )


def _rsi_oversold_recovering(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return (
        technical.rsi_14 is not None
        and technical.rsi_slope_5d is not None
        and technical.rsi_14 <= _RSI_OVERSOLD
        and technical.rsi_slope_5d > 0.0
    )


def _momentum_breakdown(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    return (
        technical.momentum_30d is not None
        and technical.momentum_90d is not None
        and technical.momentum_30d < 0.0
        and technical.momentum_90d > 0.0
    )


def _volatility_spike(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    volatility = technical.realized_volatility_20d
    threshold = _VOLATILITY_THRESHOLDS.get(symbol)
    return volatility is not None and threshold is not None and volatility >= threshold


def _bollinger_upper_band(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    zscore = technical.bollinger_zscore_20
    return zscore is not None and zscore >= _BOLLINGER_ZSCORE


def _bollinger_lower_band(symbol: str, technical: TechnicalSignalSnapshot) -> bool:
    del symbol
    zscore = technical.bollinger_zscore_20
    return zscore is not None and zscore <= -_BOLLINGER_ZSCORE


@dataclass(frozen=True)
class _TechnicalRuleFields:
    """Identity, asset matching, and diagnostics shared by every experiment."""

    name: str
    priority: int
    description: str
    predicate: TechnicalPredicate
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    allocation_name: str = field(init=False)
    reason: str = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "allocation_name", f"portfolio_{self.name}")
        object.__setattr__(self, "reason", f"portfolio_{self.name}")

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in above_dma_symbols(snapshot)
            if self.predicate(symbol, snapshot.assets[symbol].technical)
        ]

    def _decorate_intent(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> AllocationIntent:
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["technical_signals"] = {
            symbol: asdict(snapshot.assets[symbol].technical)
            for symbol in self._matching_symbols(snapshot)
        }
        return replace(intent, diagnostics=diagnostics)


@dataclass(frozen=True)
class TechnicalDcaSellRule(_TechnicalRuleFields, DcaSellRuleBase):
    """Trim matching assets and split the proceeds between SPY and stable."""

    sell_step: float = 0.05
    spy_share: float = 0.5

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_split_proceeds(target, sold, spy_share=self.spy_share)


@dataclass(frozen=True)
class TechnicalDcaBuyRule(_TechnicalRuleFields, DcaBuyRuleBase):
    """Buy matching assets out of the stable sleeve."""

    buy_step: float = 0.05


TECHNICAL_EXPERIMENT_RULES: tuple[PortfolioRule, ...] = (
    TechnicalDcaSellRule(
        name="rsi_bearish_divergence_dca_sell",
        priority=60,
        description=(
            "Research-only trim when price makes a newer high while trailing RSI "
            "fails to confirm it."
        ),
        predicate=_bearish_rsi_divergence,
    ),
    TechnicalDcaSellRule(
        name="rsi_overbought_dca_sell",
        priority=61,
        description=(
            "Research-only trim when RSI is overbought and its five-day slope "
            "turns down."
        ),
        predicate=_rsi_overbought_turning_down,
    ),
    TechnicalDcaSellRule(
        name="momentum_breakdown_dca_sell",
        priority=62,
        description=(
            "Research-only trim when 30-day momentum turns negative while 90-day "
            "momentum remains positive."
        ),
        predicate=_momentum_breakdown,
    ),
    TechnicalDcaSellRule(
        name="volatility_spike_dca_sell",
        priority=63,
        description=(
            "Research-only trim when annualized 20-day realized volatility exceeds "
            "an asset-specific threshold."
        ),
        predicate=_volatility_spike,
    ),
    TechnicalDcaBuyRule(
        name="rsi_bullish_divergence_dca_buy",
        priority=64,
        description=(
            "Research-only buy-the-dip rule for bullish RSI divergence while the "
            "asset remains above its long-term trend."
        ),
        predicate=_bullish_rsi_divergence,
    ),
    TechnicalDcaBuyRule(
        name="rsi_oversold_recovery_dca_buy",
        priority=65,
        description=(
            "Research-only buy-the-dip rule when RSI is oversold and starts "
            "recovering without breaking the long-term trend."
        ),
        predicate=_rsi_oversold_recovering,
    ),
    TechnicalDcaSellRule(
        name="macd_bearish_cross_dca_sell",
        priority=66,
        description="Research-only trim on a bearish MACD histogram zero cross.",
        predicate=_macd_bearish_cross,
    ),
    TechnicalDcaBuyRule(
        name="macd_bullish_cross_dca_buy",
        priority=67,
        description="Research-only buy on a bullish MACD histogram zero cross.",
        predicate=_macd_bullish_cross,
    ),
    TechnicalDcaSellRule(
        name="bollinger_upper_band_dca_sell",
        priority=68,
        description="Research-only trim when the 20-day Bollinger z-score reaches +2.",
        predicate=_bollinger_upper_band,
    ),
    TechnicalDcaBuyRule(
        name="bollinger_lower_band_dca_buy",
        priority=69,
        description="Research-only buy when the 20-day Bollinger z-score reaches -2.",
        predicate=_bollinger_lower_band,
    ),
    TechnicalDcaBuyRule(
        name="breakout_20d_dca_buy",
        priority=70,
        description="Research-only buy when price closes above the prior 20-day high.",
        predicate=_breakout_20d,
    ),
    TechnicalDcaSellRule(
        name="breakdown_20d_dca_sell",
        priority=71,
        description="Research-only trim when price closes below the prior 20-day low.",
        predicate=_breakdown_20d,
    ),
)

TECHNICAL_EXPERIMENT_RULE_NAMES = frozenset(
    rule.name for rule in TECHNICAL_EXPERIMENT_RULES
)


__all__ = [
    "TECHNICAL_EXPERIMENT_RULES",
    "TECHNICAL_EXPERIMENT_RULE_NAMES",
    "TechnicalDcaBuyRule",
    "TechnicalDcaSellRule",
]

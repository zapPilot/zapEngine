"""Non-default technical-indicator portfolio-rule experiments.

These rules intentionally live in the existing portfolio-rule universe so they
can be enabled through `enabled_rules` for attribution without changing the
canonical default rule set. Their priorities stay below the existing default
rules in precedence (numerically above them), so default + experiment runs keep
canonical decisions first and use technical rules as an additive fallback layer.

Every experiment differs from its siblings only in the trigger that selects
matching assets (``portfolio_rules/technical_triggers.py``), so the rules are
declared as one table over two shared buy/sell shapes rather than as one class
per indicator. A strategy spec writes the same pair as ``technical_trim`` and
``technical_add``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaBuyRuleBase,
    DcaSellRuleBase,
    PortfolioRule,
    PortfolioSnapshot,
    ProceedsRouting,
    ProceedsRoutingMixin,
    above_dma_symbols,
)
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
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True)
class _TechnicalRuleFields:
    """Identity, asset matching, and diagnostics shared by every experiment."""

    name: str
    priority: int
    description: str
    predicate: TechnicalTrigger
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
class TechnicalDcaSellRule(_TechnicalRuleFields, ProceedsRoutingMixin, DcaSellRuleBase):
    """Trim matching assets and route the proceeds (half to SPY, the rest stable)."""

    sell_step: float = 0.05
    proceeds: ProceedsRouting = ProceedsRouting(to=(("SPY", 0.5),))


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
        predicate=RsiBearishDivergence(),
    ),
    TechnicalDcaSellRule(
        name="rsi_overbought_dca_sell",
        priority=61,
        description=(
            "Research-only trim when RSI is overbought and its five-day slope "
            "turns down."
        ),
        predicate=RsiOverboughtTurningDown(),
    ),
    TechnicalDcaSellRule(
        name="momentum_breakdown_dca_sell",
        priority=62,
        description=(
            "Research-only trim when 30-day momentum turns negative while 90-day "
            "momentum remains positive."
        ),
        predicate=MomentumBreakdown(),
    ),
    TechnicalDcaSellRule(
        name="volatility_spike_dca_sell",
        priority=63,
        description=(
            "Research-only trim when annualized 20-day realized volatility exceeds "
            "an asset-specific threshold."
        ),
        predicate=VolatilitySpike(),
    ),
    TechnicalDcaBuyRule(
        name="rsi_bullish_divergence_dca_buy",
        priority=64,
        description=(
            "Research-only buy-the-dip rule for bullish RSI divergence while the "
            "asset remains above its long-term trend."
        ),
        predicate=RsiBullishDivergence(),
    ),
    TechnicalDcaBuyRule(
        name="rsi_oversold_recovery_dca_buy",
        priority=65,
        description=(
            "Research-only buy-the-dip rule when RSI is oversold and starts "
            "recovering without breaking the long-term trend."
        ),
        predicate=RsiOversoldRecovering(),
    ),
    TechnicalDcaSellRule(
        name="macd_bearish_cross_dca_sell",
        priority=66,
        description="Research-only trim on a bearish MACD histogram zero cross.",
        predicate=MacdBearishCross(),
    ),
    TechnicalDcaBuyRule(
        name="macd_bullish_cross_dca_buy",
        priority=67,
        description="Research-only buy on a bullish MACD histogram zero cross.",
        predicate=MacdBullishCross(),
    ),
    TechnicalDcaSellRule(
        name="bollinger_upper_band_dca_sell",
        priority=68,
        description="Research-only trim when the 20-day Bollinger z-score reaches +2.",
        predicate=BollingerUpperBand(),
    ),
    TechnicalDcaBuyRule(
        name="bollinger_lower_band_dca_buy",
        priority=69,
        description="Research-only buy when the 20-day Bollinger z-score reaches -2.",
        predicate=BollingerLowerBand(),
    ),
    TechnicalDcaBuyRule(
        name="breakout_20d_dca_buy",
        priority=70,
        description="Research-only buy when price closes above the prior 20-day high.",
        predicate=Breakout20d(),
    ),
    TechnicalDcaSellRule(
        name="breakdown_20d_dca_sell",
        priority=71,
        description="Research-only trim when price closes below the prior 20-day low.",
        predicate=Breakdown20d(),
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

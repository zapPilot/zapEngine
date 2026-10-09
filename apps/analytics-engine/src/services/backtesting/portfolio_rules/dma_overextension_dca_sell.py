"""Portfolio rule 30: DCA sell assets overextended above DMA."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, Any

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    DcaSellRuleBase,
    FgiRegime,
    PortfolioSnapshot,
    ProceedsRouting,
    ProceedsRoutingMixin,
    above_dma_symbols,
    current_fgi_regime_for_symbol,
    normalize_symbol,
)
from src.services.backtesting.sizing.flat import FlatSizing

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True)
class DmaOverextensionDcaSellRule(ProceedsRoutingMixin, DcaSellRuleBase):
    name: str = "dma_overextension_dca_sell"
    priority: int = 30
    cooldown_days: int = 7
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA sell assets that are above DMA and beyond asset-specific extension thresholds."
    allocation_name: str = "portfolio_dma_overextension_dca_sell"
    reason: str = "portfolio_dma_overextension_dca_sell"
    sell_step: float = 0.05
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    # Half of the proceeds buy SPY, the rest stays in stable.
    proceeds: ProceedsRouting = ProceedsRouting(to=(("SPY", 0.5),))
    # How far above its DMA each asset may run before it is sold into.
    dma_overextension_thresholds: dict[str, float] = field(
        default_factory=lambda: {"BTC": 0.20, "ETH": 0.50, "SPY": 0.10}
    )
    # The threshold shrinks in greed, so the sale starts earlier at the top.
    fgi_threshold_multipliers: dict[FgiRegime, float] = field(
        default_factory=lambda: {
            FgiRegime.EXTREME_FEAR: 1.0,
            FgiRegime.FEAR: 1.0,
            FgiRegime.NEUTRAL: 1.0,
            FgiRegime.GREED: 0.50,
            FgiRegime.EXTREME_GREED: 0.33,
        }
    )

    @classmethod
    def public_params_section(cls) -> str | None:
        return "top_escape"

    @classmethod
    def with_public_params(cls, section: Any) -> DmaOverextensionDcaSellRule:
        default = cls()
        return replace(
            default,
            fgi_threshold_multipliers={
                **default.fgi_threshold_multipliers,
                FgiRegime.GREED: section.overextension_threshold_multiplier_greed,
                FgiRegime.EXTREME_GREED: (
                    section.overextension_threshold_multiplier_extreme_greed
                ),
            },
        )

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in above_dma_symbols(snapshot)
            if snapshot.assets[symbol].dma_distance
            > _threshold(symbol, rule=self, snapshot=snapshot)
        ]


def _threshold(
    symbol: str,
    *,
    rule: DmaOverextensionDcaSellRule,
    snapshot: PortfolioSnapshot,
) -> float:
    base = float(rule.dma_overextension_thresholds[normalize_symbol(symbol)])
    regime = current_fgi_regime_for_symbol(snapshot, symbol)
    if regime is None:
        return base
    return base * rule.fgi_threshold_multipliers[regime]


__all__ = ["DmaOverextensionDcaSellRule"]

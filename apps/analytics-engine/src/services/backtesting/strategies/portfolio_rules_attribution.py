"""Portfolio-rule attribution variants."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL,
)

CROSS_DOWN_EXIT_RULE = "cross_down_exit"
CROSS_UP_EQUAL_WEIGHT_RULE = "cross_up_equal_weight"
EXTREME_FEAR_DCA_BUY_RULE = "extreme_fear_dca_buy"
DMA_OVEREXTENSION_DCA_SELL_RULE = "dma_overextension_dca_sell"
FGI_DOWNSHIFT_DCA_SELL_RULE = "fgi_downshift_dca_sell"


@dataclass(frozen=True)
class PortfolioRulesAttributionVariant:
    strategy_id: str
    display_name: str
    description: str
    disabled_rules: frozenset[str]


def _variant(
    strategy_id: str,
    *,
    description: str,
    disabled_rules: frozenset[str],
) -> PortfolioRulesAttributionVariant:
    return PortfolioRulesAttributionVariant(
        strategy_id=strategy_id,
        display_name=STRATEGY_DISPLAY_NAMES[strategy_id],
        description=description,
        disabled_rules=disabled_rules,
    )


PORTFOLIO_RULES_ATTRIBUTION_VARIANTS: dict[str, PortfolioRulesAttributionVariant] = {
    STRATEGY_DMA_FGI_PORTFOLIO_RULES: _variant(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        description="Canonical flat portfolio-rule strategy with all five DMA/FGI rules enabled.",
        disabled_rules=frozenset(),
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT: _variant(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT,
        description="Leave-one-out: portfolio rules without cross-down asset exits.",
        disabled_rules=frozenset({CROSS_DOWN_EXIT_RULE}),
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT: _variant(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT,
        description="Leave-one-out: portfolio rules without cross-up equal-weight rebalances.",
        disabled_rules=frozenset({CROSS_UP_EQUAL_WEIGHT_RULE}),
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY: _variant(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY,
        description="Leave-one-out: portfolio rules without extreme-fear DCA buys.",
        disabled_rules=frozenset({EXTREME_FEAR_DCA_BUY_RULE}),
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL: _variant(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL,
        description="Leave-one-out: portfolio rules without DMA-overextension DCA sells.",
        disabled_rules=frozenset({DMA_OVEREXTENSION_DCA_SELL_RULE}),
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL: _variant(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL,
        description="Leave-one-out: portfolio rules without FGI-downshift DCA sells.",
        disabled_rules=frozenset({FGI_DOWNSHIFT_DCA_SELL_RULE}),
    ),
}


__all__ = [
    "CROSS_DOWN_EXIT_RULE",
    "CROSS_UP_EQUAL_WEIGHT_RULE",
    "DMA_OVEREXTENSION_DCA_SELL_RULE",
    "EXTREME_FEAR_DCA_BUY_RULE",
    "FGI_DOWNSHIFT_DCA_SELL_RULE",
    "PORTFOLIO_RULES_ATTRIBUTION_VARIANTS",
    "PortfolioRulesAttributionVariant",
]

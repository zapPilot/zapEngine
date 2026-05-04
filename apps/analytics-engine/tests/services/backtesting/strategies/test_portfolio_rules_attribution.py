from __future__ import annotations

from datetime import date

from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL,
)
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaFgiPortfolioRulesStrategy,
)
from src.services.backtesting.strategies.portfolio_rules_attribution import (
    PORTFOLIO_RULES_ATTRIBUTION_VARIANTS,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)


def test_portfolio_rules_variant_registry_complete() -> None:
    assert set(PORTFOLIO_RULES_ATTRIBUTION_VARIANTS) == {
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL,
    }
    assert (
        PORTFOLIO_RULES_ATTRIBUTION_VARIANTS[
            STRATEGY_DMA_FGI_PORTFOLIO_RULES
        ].disabled_rules
        == frozenset()
    )


def test_portfolio_rules_recipes_build_strategies_with_variant_disabled_rules() -> None:
    for strategy_id, variant in PORTFOLIO_RULES_ATTRIBUTION_VARIANTS.items():
        recipe = get_strategy_recipe(strategy_id)
        strategy = recipe.build_strategy(
            StrategyBuildRequest(
                mode="compare",
                total_capital=10_000.0,
                params={"cross_cooldown_days": 0},
                initial_allocation={"spot": 1.0, "stable": 0.0},
                user_start_date=date(2025, 1, 1),
                user_prices=[],
            )
        )

        assert isinstance(strategy, DmaFgiPortfolioRulesStrategy)
        assert strategy.strategy_id == strategy_id
        assert strategy.disabled_rules == variant.disabled_rules
        assert recipe.runtime_portfolio_mode == "asset"

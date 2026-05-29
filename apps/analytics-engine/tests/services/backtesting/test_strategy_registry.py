from __future__ import annotations

from datetime import date

from pydantic import ValidationError

from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)
from src.services.backtesting.strategy_catalog import get_strategy_catalog_v3
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
    list_strategy_recipes,
)


def test_strategy_registry_exposes_portfolio_rules_recipe_with_macro_requirements() -> (
    None
):
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    assert recipe.supports_daily_suggestion is True
    assert recipe.signal_id == "dma_fgi_portfolio_rules_signal"
    assert recipe.primary_asset == "BTC"
    assert recipe.market_data_requirements.requires_sentiment is True
    assert recipe.market_data_requirements.requires_macro_fear_greed is True
    assert recipe.market_data_requirements.required_aux_series == frozenset(
        {ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}
    )


def test_catalog_is_derived_from_strategy_registry() -> None:
    catalog = get_strategy_catalog_v3()
    recipe_ids = {recipe.strategy_id for recipe in list_strategy_recipes()}

    assert {entry.strategy_id for entry in catalog.strategies} == recipe_ids
    assert recipe_ids == {
        STRATEGY_DCA_CLASSIC,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
    }


def test_rule_experiment_params_isolated_to_rule_based_strategy() -> None:
    """Isolation guard: rule-experiment params (``enabled_rules`` /
    ``disabled_rules``) are accepted ONLY by the rule-based strategy. Benchmarks
    such as ``dca_classic`` reject all params, so rule experiments stay isolated to
    ``RuleBasedPortfolioStrategy`` and ``dca_classic`` remains a frozen benchmark.
    A future non-rule strategy that silently accepts rule params trips this."""
    accepting: list[str] = []
    for recipe in list_strategy_recipes():
        try:
            recipe.normalize_public_params({"enabled_rules": ["cross_down_exit"]})
        except (ValueError, ValidationError):
            continue
        accepting.append(recipe.strategy_id)
    assert accepting == [STRATEGY_DMA_FGI_PORTFOLIO_RULES]


def test_portfolio_rules_recipe_builds_compare_strategy() -> None:
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            config_id="portfolio-rules-test",
            total_capital=10_000.0,
            params={"cross_cooldown_days": 30},
            user_prices=[
                {
                    "date": date(2025, 1, 1),
                    "price": 100.0,
                    "prices": {"btc": 100.0, "eth": 120.0, "spy": 500.0},
                    "extra_data": {
                        DMA_200_FEATURE: 90.0,
                        ETH_DMA_200_FEATURE: 100.0,
                        SPY_DMA_200_FEATURE: 450.0,
                    },
                }
            ],
            initial_allocation={"spot": 1.0, "stable": 0.0},
            user_start_date=date(2025, 1, 1),
        )
    )

    assert isinstance(strategy, RuleBasedPortfolioStrategy)
    assert strategy.strategy_id == "portfolio-rules-test"
    assert strategy.initial_asset_allocation == {
        "btc": 1 / 3,
        "eth": 1 / 3,
        "spy": 1 / 3,
        "stable": 0.0,
        "alt": 0.0,
    }

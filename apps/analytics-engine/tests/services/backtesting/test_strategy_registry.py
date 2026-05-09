from __future__ import annotations

from datetime import date

from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
    STRATEGY_ETH_BTC_ROTATION,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaFgiPortfolioRulesStrategy,
)
from src.services.backtesting.strategies.eth_btc_rotation import EthBtcRotationStrategy
from src.services.backtesting.strategy_catalog import get_strategy_catalog_v3
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
    list_strategy_recipes,
)


def test_strategy_registry_exposes_eth_btc_rotation_recipe_with_aux_series() -> None:
    recipe = get_strategy_recipe(STRATEGY_ETH_BTC_ROTATION)

    assert recipe.supports_daily_suggestion is True
    assert recipe.signal_id == "eth_btc_rs_signal"
    assert recipe.primary_asset == "BTC"
    assert recipe.warmup_lookback_days == 14
    assert recipe.market_data_requirements.requires_sentiment is True
    assert recipe.market_data_requirements.require_dma_200 is True
    assert recipe.market_data_requirements.required_aux_series == frozenset(
        {"eth_btc_relative_strength"}
    )


def test_strategy_registry_exposes_portfolio_rules_recipe_with_macro_requirements() -> (
    None
):
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    assert recipe.supports_daily_suggestion is False
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
    assert len(recipe_ids) == 11


def test_eth_btc_rotation_recipe_builds_compare_strategy() -> None:
    recipe = get_strategy_recipe(STRATEGY_ETH_BTC_ROTATION)

    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            config_id="eth-btc-test",
            total_capital=10_000.0,
            params={"cross_cooldown_days": 30},
            user_prices=[{"date": date(2025, 1, 1), "price": 100.0}],
            initial_allocation={"spot": 0.5, "stable": 0.5},
            user_start_date=date(2025, 1, 1),
        )
    )

    assert isinstance(strategy, EthBtcRotationStrategy)
    assert strategy.strategy_id == "eth-btc-test"


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

    assert isinstance(strategy, DmaFgiPortfolioRulesStrategy)
    assert strategy.strategy_id == "portfolio-rules-test"
    assert strategy.initial_asset_allocation == {
        "btc": 1 / 3,
        "eth": 1 / 3,
        "spy": 1 / 3,
        "stable": 0.0,
        "alt": 0.0,
    }

from __future__ import annotations

from datetime import date

from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiStrategy
from src.services.backtesting.strategy_catalog import get_strategy_catalog_v3
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
    list_strategy_recipes,
)


def test_strategy_registry_exposes_dma_recipe_with_daily_support() -> None:
    recipe = get_strategy_recipe("dma_gated_fgi")

    assert recipe.supports_daily_suggestion is True
    assert recipe.signal_id == "dma_gated_fgi"
    assert recipe.primary_asset == "BTC"
    assert recipe.warmup_lookback_days == 14
    assert recipe.market_data_requirements.requires_sentiment is True
    assert recipe.market_data_requirements.require_dma_200 is True


def test_strategy_registry_exposes_baseline_recipe_without_sentiment_requirement() -> (
    None
):
    recipe = get_strategy_recipe("dca_classic")

    assert recipe.supports_daily_suggestion is False
    assert recipe.signal_id is None
    assert recipe.market_data_requirements.requires_sentiment is False


def test_strategy_registry_exposes_eth_btc_rotation_recipe_with_aux_series() -> None:
    recipe = get_strategy_recipe("eth_btc_rotation")

    assert recipe.supports_daily_suggestion is True
    assert recipe.signal_id == "eth_btc_rs_signal"
    assert recipe.primary_asset == "BTC"
    assert recipe.warmup_lookback_days == 14
    assert recipe.market_data_requirements.requires_sentiment is True
    assert recipe.market_data_requirements.require_dma_200 is True
    assert recipe.market_data_requirements.required_aux_series == frozenset(
        {"eth_btc_relative_strength"}
    )


def test_catalog_is_derived_from_strategy_registry() -> None:
    catalog = get_strategy_catalog_v3()
    recipe_ids = {recipe.strategy_id for recipe in list_strategy_recipes()}

    assert {entry.strategy_id for entry in catalog.strategies} == recipe_ids


def test_dma_recipe_builds_compare_strategy() -> None:
    recipe = get_strategy_recipe("dma_gated_fgi")

    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            config_id="dma-test",
            total_capital=10_000.0,
            params={"cross_cooldown_days": 30},
            user_prices=[{"date": date(2025, 1, 1), "price": 100.0}],
            initial_allocation={"spot": 0.5, "stable": 0.5},
            user_start_date=date(2025, 1, 1),
        )
    )

    assert isinstance(strategy, DmaGatedFgiStrategy)
    assert strategy.strategy_id == "dma-test"

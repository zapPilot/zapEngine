from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    IndicatorSnapshot,
    MarketDataRequirements,
    MarketFeatureSet,
)
from src.services.backtesting.public_params import (
    get_default_public_params,
    public_params_to_runtime_params,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    StrategyRecipe,
    list_strategy_recipes,
)


def _recipe_ids(recipe: StrategyRecipe) -> str:
    return recipe.strategy_id


def _portfolio_fixture() -> object:
    return SimpleNamespace(
        portfolio_allocation=SimpleNamespace(
            btc=SimpleNamespace(total_value=2_000.0),
            eth=SimpleNamespace(total_value=1_000.0),
            stablecoins=SimpleNamespace(total_value=7_000.0),
            others=None,
        )
    )


@pytest.mark.parametrize("recipe", list_strategy_recipes(), ids=_recipe_ids)
def test_recipe_default_params_round_trip(recipe: StrategyRecipe) -> None:
    default_params = public_params_to_runtime_params(
        recipe.strategy_id,
        get_default_public_params(recipe.strategy_id),
    )
    normalized = recipe.normalize_public_params(dict(default_params))

    assert normalized == dict(default_params)


@pytest.mark.parametrize("recipe", list_strategy_recipes(), ids=_recipe_ids)
def test_recipe_compare_build_contract(recipe: StrategyRecipe) -> None:
    default_params = public_params_to_runtime_params(
        recipe.strategy_id,
        get_default_public_params(recipe.strategy_id),
    )
    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            config_id=f"{recipe.strategy_id}-test",
            total_capital=10_000.0,
            params=dict(default_params),
            user_prices=[{"date": date(2025, 1, 1), "price": 100.0}],
            initial_allocation={"spot": 0.5, "stable": 0.5},
            user_start_date=date(2025, 1, 1),
        )
    )

    assert strategy.strategy_id == f"{recipe.strategy_id}-test"


@pytest.mark.parametrize("recipe", list_strategy_recipes(), ids=_recipe_ids)
def test_recipe_capability_contract(recipe: StrategyRecipe) -> None:
    buckets = recipe.portfolio_bucket_mapper(_portfolio_fixture())

    assert recipe.primary_asset
    assert recipe.warmup_lookback_days >= 0
    assert recipe.market_data_requirements.price_history_days >= 0
    assert recipe.market_data_requirements.sentiment_history_days >= 0
    assert isinstance(recipe.market_data_requirements.requires_sentiment, bool)
    assert buckets.total_value == pytest.approx(10_000.0)
    assert buckets.allocation()["spot"] == pytest.approx(0.3)


@pytest.mark.parametrize(
    "recipe",
    [recipe for recipe in list_strategy_recipes() if recipe.supports_daily_suggestion],
    ids=_recipe_ids,
)
def test_daily_suggestion_recipe_build_contract(recipe: StrategyRecipe) -> None:
    default_params = public_params_to_runtime_params(
        recipe.strategy_id,
        get_default_public_params(recipe.strategy_id),
    )
    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            mode="daily_suggestion",
            total_capital=10_000.0,
            params=dict(default_params),
        )
    )

    assert hasattr(strategy, "get_daily_recommendation")


def test_market_data_requirements_merge_or_sentiment_and_union_price_features() -> None:
    left = MarketDataRequirements(
        price_history_days=14,
        sentiment_history_days=7,
        requires_sentiment=False,
        required_price_features=frozenset({DMA_200_FEATURE}),
    )
    right = MarketDataRequirements(
        price_history_days=30,
        sentiment_history_days=3,
        requires_sentiment=True,
        required_price_features=frozenset({"other_feature"}),
    )

    merged = left.merge(right)

    assert merged.price_history_days == 30
    assert merged.sentiment_history_days == 7
    assert merged.requires_sentiment is True
    assert merged.required_price_features == frozenset(
        {DMA_200_FEATURE, "other_feature"}
    )


# --- targeted coverage tests for features.py ---


def test_indicator_snapshot_from_extra_data_with_non_mapping_returns_default() -> None:
    snapshot = IndicatorSnapshot.from_extra_data(None)
    assert snapshot.dma_200 is None
    assert snapshot.extra == {}

    snapshot2 = IndicatorSnapshot.from_extra_data("not-a-mapping")  # type: ignore[arg-type]
    assert snapshot2.dma_200 is None


def test_indicator_snapshot_from_extra_data_clamps_negative_dma_200() -> None:
    snapshot = IndicatorSnapshot.from_extra_data({"dma_200": -1.0})
    assert snapshot.dma_200 is None


def test_indicator_snapshot_to_extra_data_includes_dma_200_when_set() -> None:
    snapshot = IndicatorSnapshot(dma_200=50_000.0, extra={"other": "value"})
    data = snapshot.to_extra_data()
    assert data["dma_200"] == 50_000.0
    assert data["other"] == "value"


def test_indicator_snapshot_to_extra_data_omits_dma_200_when_none() -> None:
    snapshot = IndicatorSnapshot(dma_200=None, extra={"key": "val"})
    data = snapshot.to_extra_data()
    assert "dma_200" not in data
    assert data["key"] == "val"


def test_market_feature_set_to_extra_data_delegates_to_indicators() -> None:
    feature_set = MarketFeatureSet.from_extra_data({"dma_200": 42_000.0, "x": 1})
    data = feature_set.to_extra_data()
    assert data["dma_200"] == 42_000.0
    assert data["x"] == 1

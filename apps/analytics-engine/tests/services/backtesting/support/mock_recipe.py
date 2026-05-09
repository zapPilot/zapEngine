from __future__ import annotations

from typing import Any

from src.services.backtesting import strategy_registry as strategy_registry_module
from src.services.backtesting.capabilities import map_portfolio_to_two_buckets
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.public_params import DmaGatedFgiPublicParams
from src.services.backtesting.strategies.base import BaseStrategy, StrategyAction
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    StrategyRecipe,
)
from tests.services.backtesting.support.snapshots import make_strategy_snapshot


class MockRecipeStrategy(BaseStrategy):
    def __init__(self, *, strategy_id: str, display_name: str) -> None:
        self.strategy_id = strategy_id
        self.display_name = display_name
        self.canonical_strategy_id = strategy_id

    def on_day(self, _context: Any) -> StrategyAction:
        return StrategyAction(snapshot=make_strategy_snapshot(reason="mock_hold"))


def make_mock_recipe(
    *,
    strategy_id: str,
    primary_asset: str = "BTC",
    requires_sentiment: bool = False,
    required_price_features: frozenset[str] = frozenset(),
) -> StrategyRecipe:
    def _normalize_params(params: dict[str, Any]) -> dict[str, Any]:
        if params:
            raise ValueError(f"{strategy_id} does not accept params")
        return {}

    def _build_strategy(request: StrategyBuildRequest) -> BaseStrategy:
        if request.mode != "compare":
            raise ValueError(f"{strategy_id} only supports compare mode")
        if request.initial_allocation is None or request.user_start_date is None:
            raise ValueError(
                f"{strategy_id} compare strategy build requires initial allocation and start date"
            )
        return MockRecipeStrategy(
            strategy_id=request.resolved_config_id or strategy_id,
            display_name=request.resolved_config_id or strategy_id,
        )

    return StrategyRecipe(
        strategy_id=strategy_id,
        display_name=strategy_id.replace("_", " ").title(),
        description=f"Test-only mock recipe for {strategy_id}.",
        signal_id=None,
        primary_asset=primary_asset,
        warmup_lookback_days=0,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=requires_sentiment,
            required_price_features=required_price_features,
        ),
        portfolio_bucket_mapper=map_portfolio_to_two_buckets,
        public_params_model=DmaGatedFgiPublicParams,
        param_family="dma",
        normalize_public_params=_normalize_params,
        build_strategy=_build_strategy,
        supports_daily_suggestion=False,
    )


def register_mock_recipe(
    monkeypatch: Any,
    *,
    strategy_id: str,
    primary_asset: str = "BTC",
    requires_sentiment: bool = False,
    required_price_features: frozenset[str] = frozenset(),
) -> StrategyRecipe:
    recipe = make_mock_recipe(
        strategy_id=strategy_id,
        primary_asset=primary_asset,
        requires_sentiment=requires_sentiment,
        required_price_features=required_price_features,
    )
    monkeypatch.setitem(strategy_registry_module._RECIPES, strategy_id, recipe)
    return recipe


__all__ = ["make_mock_recipe", "register_mock_recipe"]

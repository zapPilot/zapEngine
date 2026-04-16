"""Backtesting strategy catalog for the recipe-first v3 API."""

from __future__ import annotations

from src.models.backtesting import (
    BacktestStrategyCatalogEntryV3,
    BacktestStrategyCatalogResponseV3,
)
from src.services.backtesting.public_params import (
    get_default_public_params,
    get_nested_public_params_schema,
)
from src.services.backtesting.strategy_registry import list_strategy_recipes

CATALOG_VERSION = "3.0.0"


def build_strategy_catalog_entries() -> list[BacktestStrategyCatalogEntryV3]:
    return [
        BacktestStrategyCatalogEntryV3(
            strategy_id=recipe.strategy_id,
            display_name=recipe.display_name,
            description=recipe.description,
            param_schema=get_nested_public_params_schema(recipe.strategy_id),
            default_params=get_default_public_params(recipe.strategy_id),
            supports_daily_suggestion=recipe.supports_daily_suggestion,
        )
        for recipe in list_strategy_recipes()
    ]


def get_strategy_catalog_v3() -> BacktestStrategyCatalogResponseV3:
    return BacktestStrategyCatalogResponseV3(
        catalog_version=CATALOG_VERSION,
        strategies=build_strategy_catalog_entries(),
    )

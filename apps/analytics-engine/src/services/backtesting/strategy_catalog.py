"""Backtesting strategy catalog for the recipe-first v3 API."""

from __future__ import annotations

from pydantic import JsonValue

from src.models.backtesting import (
    BacktestStrategyCatalogEntryV3,
    BacktestStrategyCatalogResponseV3,
)
from src.services.backtesting.strategy_registry import list_strategy_recipes

CATALOG_VERSION = "4.0.0"
# No strategy takes params: what a strategy does is stated by its spec.
NO_PARAMS_SCHEMA: dict[str, JsonValue] = {
    "type": "object",
    "properties": {},
    "additionalProperties": False,
}


def build_strategy_catalog_entries() -> list[BacktestStrategyCatalogEntryV3]:
    return [
        BacktestStrategyCatalogEntryV3(
            strategy_id=recipe.strategy_id,
            display_name=recipe.display_name,
            description=recipe.description,
            param_schema=dict(NO_PARAMS_SCHEMA),
            default_params={},
            supports_daily_suggestion=recipe.supports_daily_suggestion,
        )
        for recipe in list_strategy_recipes()
    ]


def get_strategy_catalog_v3() -> BacktestStrategyCatalogResponseV3:
    return BacktestStrategyCatalogResponseV3(
        catalog_version=CATALOG_VERSION,
        strategies=build_strategy_catalog_entries(),
    )

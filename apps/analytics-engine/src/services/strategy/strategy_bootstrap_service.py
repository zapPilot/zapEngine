"""Shared public bootstrap builder for strategy preset and catalog endpoints."""

from __future__ import annotations

from src.config.strategy_presets import get_backtest_defaults
from src.models.backtesting import BacktestStrategyCatalogResponseV3
from src.models.strategy_config import StrategyConfigsResponse, StrategyPreset
from src.services.backtesting.strategy_catalog import get_strategy_catalog_v3
from src.services.strategy.strategy_config_store import StrategyConfigStore


def _build_public_presets(
    strategy_config_store: StrategyConfigStore,
) -> list[StrategyPreset]:
    public_configs = [
        config
        for config in strategy_config_store.list_configs()
        if not config.is_benchmark
    ]
    default_configs = [config for config in public_configs if config.is_default]

    if len(default_configs) > 1:
        joined = ", ".join(sorted(config.config_id for config in default_configs))
        raise ValueError(f"Public strategy presets contain multiple defaults: {joined}")

    if not public_configs:
        return []

    if len(default_configs) == 0:
        effective_default = strategy_config_store.resolve_config(None)
        if effective_default.is_benchmark:
            raise ValueError(
                f"Resolved default strategy config '{effective_default.config_id}' is a benchmark"
            )
        if not any(
            config.config_id == effective_default.config_id for config in public_configs
        ):
            raise ValueError(
                "Resolved default strategy config "
                f"'{effective_default.config_id}' is not exposed in public presets"
            )
        public_configs = [
            config.model_copy(
                update={"is_default": config.config_id == effective_default.config_id},
                deep=True,
            )
            for config in public_configs
        ]

    return [config.to_public_preset() for config in public_configs]


def build_strategy_catalog_response() -> BacktestStrategyCatalogResponseV3:
    return get_strategy_catalog_v3()


def build_strategy_configs_response(
    strategy_config_store: StrategyConfigStore,
) -> StrategyConfigsResponse:
    catalog = build_strategy_catalog_response()
    return StrategyConfigsResponse(
        strategies=catalog.strategies,
        presets=_build_public_presets(strategy_config_store),
        backtest_defaults=get_backtest_defaults(),
    )


__all__ = [
    "build_strategy_catalog_response",
    "build_strategy_configs_response",
]

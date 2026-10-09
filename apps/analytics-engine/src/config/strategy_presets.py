"""Seed strategy configs: the code-owned source of every saved config."""

from __future__ import annotations

from typing import Final

from src.models.strategy_config import (
    BacktestDefaults,
    SavedStrategyConfig,
    StrategyComponentRef,
    StrategyComposition,
    StrategyPreset,
)
from src.services.backtesting.constants import (
    MODEL_TOTAL_CAPITAL,
    MODEL_WINDOW_DAYS,
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.public_params import get_default_public_params

DMA_FGI_PORTFOLIO_RULES_CONFIG_ID: Final[str] = "dma_fgi_portfolio_rules_default"


def _build_default_seed_config() -> SavedStrategyConfig:
    return SavedStrategyConfig(
        config_id=DMA_FGI_PORTFOLIO_RULES_CONFIG_ID,
        display_name="DMA/FGI Portfolio Rules",
        description=(
            "Default rule-based strategy: SPY/BTC/ETH portfolio rules driven by "
            "DMA crosses, ETH/BTC ratio rotation, and FGI regime shifts. Risk "
            "guards enforce trade pacing."
        ),
        strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        primary_asset="BTC",
        params=get_default_public_params(STRATEGY_DMA_FGI_PORTFOLIO_RULES),
        composition=StrategyComposition(
            kind="composed",
            bucket_mapper_id="spy_eth_btc_stable",
            signal=StrategyComponentRef(
                component_id="dma_fgi_portfolio_rules_signal",
                params={},
            ),
            decision_policy=StrategyComponentRef(
                component_id="dma_fgi_portfolio_rules_policy",
                params={},
            ),
        ),
        supports_daily_suggestion=True,
        is_default=True,
        is_benchmark=False,
    )


SEED_STRATEGY_CONFIGS: Final[list[SavedStrategyConfig]] = [
    _build_default_seed_config(),
    SavedStrategyConfig(
        config_id=STRATEGY_DCA_CLASSIC,
        display_name="Classic DCA",
        description="Simple dollar-cost averaging baseline.",
        strategy_id=STRATEGY_DCA_CLASSIC,
        primary_asset="BTC",
        params={},
        composition=StrategyComposition(kind="benchmark"),
        supports_daily_suggestion=False,
        is_default=False,
        is_benchmark=True,
    ),
]


BACKTEST_DEFAULTS: Final[BacktestDefaults] = BacktestDefaults(
    days=MODEL_WINDOW_DAYS, total_capital=MODEL_TOTAL_CAPITAL
)


def get_backtest_defaults() -> BacktestDefaults:
    return BACKTEST_DEFAULTS


def _validate_seed_strategy_config_invariants() -> None:
    defaults = [
        config.config_id for config in SEED_STRATEGY_CONFIGS if config.is_default
    ]
    benchmarks = [
        config.config_id for config in SEED_STRATEGY_CONFIGS if config.is_benchmark
    ]
    if len(defaults) > 1:
        joined = ", ".join(sorted(defaults))
        raise ValueError(f"Seed strategy configs contain multiple defaults: {joined}")
    if len(benchmarks) > 1:
        joined = ", ".join(sorted(benchmarks))
        raise ValueError(f"Seed strategy configs contain multiple benchmarks: {joined}")


def list_seed_strategy_configs() -> list[SavedStrategyConfig]:
    _validate_seed_strategy_config_invariants()
    return [config.model_copy(deep=True) for config in SEED_STRATEGY_CONFIGS]


def get_default_seed_strategy_config() -> SavedStrategyConfig:
    _validate_seed_strategy_config_invariants()
    for config in SEED_STRATEGY_CONFIGS:
        if config.is_default:
            return config.model_copy(deep=True)
    raise ValueError("No default strategy config configured")


def get_benchmark_seed_strategy_config() -> SavedStrategyConfig:
    _validate_seed_strategy_config_invariants()
    for config in SEED_STRATEGY_CONFIGS:
        if config.is_benchmark:
            return config.model_copy(deep=True)
    raise ValueError("No benchmark strategy config configured")


def resolve_seed_strategy_config(config_id: str | None) -> SavedStrategyConfig:
    _validate_seed_strategy_config_invariants()
    if config_id is None or not str(config_id).strip():
        return get_default_seed_strategy_config()
    for config in SEED_STRATEGY_CONFIGS:
        if config.config_id == config_id:
            return config.model_copy(deep=True)
    valid = ", ".join(sorted(config.config_id for config in SEED_STRATEGY_CONFIGS))
    raise ValueError(f"Unknown config_id '{config_id}'. Valid values: {valid}")


def list_strategy_presets() -> list[StrategyPreset]:
    _validate_seed_strategy_config_invariants()
    return [
        config.to_public_preset()
        for config in SEED_STRATEGY_CONFIGS
        if not config.is_benchmark
    ]


def get_default_strategy_preset() -> StrategyPreset:
    return get_default_seed_strategy_config().to_public_preset()


def get_benchmark_strategy_preset() -> StrategyPreset:
    return get_benchmark_seed_strategy_config().to_public_preset()


def resolve_strategy_preset(config_id: str | None) -> StrategyPreset:
    return resolve_seed_strategy_config(config_id).to_public_preset()


STRATEGY_PRESETS: Final[list[StrategyPreset]] = list_strategy_presets() + [
    get_benchmark_strategy_preset()
]

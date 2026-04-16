"""Compare request orchestration for backtesting."""

from __future__ import annotations

from datetime import date
from typing import Any

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestWindowInfo,
)
from src.services.backtesting.composition import ResolvedSavedStrategyConfig
from src.services.backtesting.constants import ALLOCATION_STATES
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.execution.engine import EngineConfig, StrategyEngine
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)


def find_unused_config_id(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    for idx in range(2, 1000):
        candidate = f"{base}-{idx}"
        if candidate not in taken:
            return candidate
    raise ValueError("Could not generate unique config_id for baseline config")


def materialize_compare_request(
    request: BacktestCompareRequestV3,
) -> BacktestCompareRequestV3:
    if any(
        config.strategy_id == "dca_classic" or config.saved_config_id == "dca_classic"
        for config in request.configs
    ):
        return request
    baseline = BacktestCompareConfigV3(
        config_id=find_unused_config_id(
            "dca_classic", {cfg.config_id for cfg in request.configs}
        ),
        strategy_id="dca_classic",
        params={},
    )
    return request.model_copy(update={"configs": [baseline, *request.configs]})


def build_compare_strategies_from_resolved_configs(
    configs: list[ResolvedSavedStrategyConfig],
    *,
    user_prices: list[dict[str, object]],
    total_capital: float,
    initial_allocation: dict[str, float],
    user_start_date: date,
) -> list[BaseStrategy]:
    strategies: list[BaseStrategy] = []
    for config in configs:
        strategy = config.build_strategy(
            StrategyBuildRequest(
                mode="compare",
                total_capital=total_capital,
                params=dict(config.public_params),
                config_id=config.request_config_id,
                user_prices=user_prices,
                initial_allocation=initial_allocation,
                user_start_date=user_start_date,
            )
        )
        strategy.summary_signal_id = config.summary_signal_id
        strategies.append(strategy)
    return strategies


def run_compare_v3_on_data(
    prices: list[dict[str, Any]],
    sentiments: dict[date, dict[str, Any]],
    request: BacktestCompareRequestV3,
    user_start_date: date,
    resolved_configs: list[ResolvedSavedStrategyConfig] | None = None,
    window: BacktestWindowInfo | None = None,
    config: RegimeConfig | None = None,
) -> BacktestResponse:
    runtime_config = config or RegimeConfig.default()
    initial_allocation = dict(ALLOCATION_STATES["neutral_start"])
    user_prices = [price for price in prices if price["date"] >= user_start_date]
    if resolved_configs is not None:
        strategies = build_compare_strategies_from_resolved_configs(
            resolved_configs,
            user_prices=user_prices,
            total_capital=request.total_capital,
            initial_allocation=initial_allocation,
            user_start_date=user_start_date,
        )
    else:
        # Legacy path: build directly from request.configs
        strategies = []
        for config_item in request.configs:
            assert config_item.strategy_id is not None
            recipe = get_strategy_recipe(config_item.strategy_id)
            strategy = recipe.build_strategy(
                StrategyBuildRequest(
                    mode="compare",
                    total_capital=request.total_capital,
                    params=dict(config_item.params),
                    config_id=config_item.config_id,
                    user_prices=user_prices,
                    initial_allocation=initial_allocation,
                    user_start_date=user_start_date,
                )
            )
            strategy.summary_signal_id = recipe.signal_id
            strategies.append(strategy)
    engine = StrategyEngine(EngineConfig.from_regime_config(runtime_config))
    result = engine.run(
        prices=prices,
        sentiments=sentiments,
        strategies=strategies,
        initial_allocation=initial_allocation,
        total_capital=request.total_capital,
        token_symbol=request.token_symbol,
        user_start_date=user_start_date,
    )
    result.window = window
    return result

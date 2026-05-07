"""Compare request orchestration for backtesting."""

from __future__ import annotations

import tempfile
from datetime import date
from pathlib import Path
from typing import Any

from src.models.backtesting import (
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestWindowInfo,
)
from src.services.backtesting.audit import write_decision_log
from src.services.backtesting.composition import ResolvedSavedStrategyConfig
from src.services.backtesting.constants import ALLOCATION_STATES
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.execution.engine import EngineConfig, StrategyEngine
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)


def materialize_compare_request(
    request: BacktestCompareRequestV3,
) -> BacktestCompareRequestV3:
    return request


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
    if request.emit_decision_log:
        output_dir = (
            Path(request.decision_log_dir)
            if request.decision_log_dir is not None
            else Path(tempfile.mkdtemp(prefix="zapengine-backtest-"))
        )
        timeline = [point.model_dump(mode="json") for point in result.timeline]
        decision_log_path = write_decision_log(
            output_dir=output_dir,
            timeline=timeline,
            strategy_ids=[config.config_id for config in request.configs],
        )
        result = result.model_copy(update={"decision_log_path": str(decision_log_path)})
    return result

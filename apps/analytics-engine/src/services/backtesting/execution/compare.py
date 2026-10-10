"""Compare request orchestration for backtesting."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from src.models.backtesting import (
    BacktestAssumptions,
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestWindowInfo,
)
from src.services.backtesting.audit import write_decision_log
from src.services.backtesting.constants import ALLOCATION_STATES
from src.services.backtesting.execution.engine import StrategyEngine
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategy_registry import (
    ResolvedSavedStrategyConfig,
    StrategyBuildRequest,
    resolve_inline_strategy_config,
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
                total_capital=total_capital,
                config_id=config.request_config_id,
                user_prices=user_prices,
                initial_allocation=initial_allocation,
                user_start_date=user_start_date,
            )
        )
        strategy.summary_signal_id = config.summary_signal_id
        strategies.append(strategy)
    return strategies


def neutral_initial_allocation() -> dict[str, float]:
    """The two-bucket allocation every compare run starts from."""
    return dict(ALLOCATION_STATES["neutral_start"])


def simulate(
    strategies: list[BaseStrategy],
    *,
    prices: list[dict[str, Any]],
    sentiments: dict[date, dict[str, Any]],
    user_start_date: date,
    total_capital: float,
    token_symbol: str,
    assumptions: BacktestAssumptions | None = None,
    initial_allocation: dict[str, float] | None = None,
) -> BacktestResponse:
    """Run built strategies over prepared market data under the given assumptions.

    The one place a simulation is started: the compare API and the strategy lab
    both go through it, so a number the lab reports is a number the API reports.
    """
    return StrategyEngine(assumptions or BacktestAssumptions()).run(
        prices=prices,
        sentiments=sentiments,
        strategies=strategies,
        initial_allocation=initial_allocation or neutral_initial_allocation(),
        total_capital=total_capital,
        token_symbol=token_symbol,
        user_start_date=user_start_date,
    )


def _resolve_inline_configs(
    request: BacktestCompareRequestV3,
) -> list[ResolvedSavedStrategyConfig]:
    """The strategies a request names directly, when nothing resolved them first."""
    configs = []
    for item in request.configs:
        assert item.strategy_id is not None
        configs.append(
            resolve_inline_strategy_config(
                config_id=item.config_id,
                strategy_id=item.strategy_id,
                params=item.params,
            )
        )
    return configs


def run_compare_v3_on_data(
    prices: list[dict[str, Any]],
    sentiments: dict[date, dict[str, Any]],
    request: BacktestCompareRequestV3,
    user_start_date: date,
    resolved_configs: list[ResolvedSavedStrategyConfig] | None = None,
    window: BacktestWindowInfo | None = None,
    decision_log_dir: Path | None = None,
) -> BacktestResponse:
    initial_allocation = neutral_initial_allocation()
    user_prices = [price for price in prices if price["date"] >= user_start_date]
    strategies = build_compare_strategies_from_resolved_configs(
        resolved_configs
        if resolved_configs is not None
        else _resolve_inline_configs(request),
        user_prices=user_prices,
        total_capital=request.total_capital,
        initial_allocation=initial_allocation,
        user_start_date=user_start_date,
    )
    result = simulate(
        strategies,
        prices=prices,
        sentiments=sentiments,
        user_start_date=user_start_date,
        total_capital=request.total_capital,
        token_symbol=request.token_symbol,
        assumptions=request.assumptions,
        initial_allocation=initial_allocation,
    )
    result.window = window
    # In-process only: the HTTP request model carries no output directory.
    if decision_log_dir is not None:
        timeline = [point.model_dump(mode="json") for point in result.timeline]
        write_decision_log(
            output_dir=decision_log_dir,
            timeline=timeline,
            strategy_ids=[config.config_id for config in request.configs],
        )
    return result

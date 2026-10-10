"""Run saved strategy configs over synthetic markets and fingerprint the result."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import date
from typing import Any

from src.config.strategy_presets import resolve_seed_strategy_config
from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
)
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.lab.golden import trace_summary as golden_summary
from src.services.backtesting.lab.synthetic import SyntheticMarket
from src.services.backtesting.strategy_registry import (
    ResolvedSavedStrategyConfig,
    resolve_saved_strategy_config,
)

DEFAULT_CONFIG_ID = "dma_fgi_portfolio_rules_default"
TOTAL_CAPITAL = 10_000.0


def run_synthetic_compare(
    market: SyntheticMarket,
    *,
    config_ids: Sequence[str] = (DEFAULT_CONFIG_ID,),
    params: Mapping[str, Any] | None = None,
) -> BacktestResponse:
    """Run seed saved configs through the same compare path the API uses.

    ``params`` replaces the nested public params of every config, as a saved
    config edited in code would.
    """
    saved_configs = [
        resolve_seed_strategy_config(config_id) for config_id in config_ids
    ]
    if params is not None:
        saved_configs = [
            saved.model_copy(update={"params": dict(params)}, deep=True)
            for saved in saved_configs
        ]
    return run_resolved_compare(
        prices=market.prices,
        sentiments=market.sentiments,
        start=market.user_start_date,
        end=market.prices[-1]["date"],
        resolved=[
            replace(
                resolve_saved_strategy_config(saved), request_config_id=saved.config_id
            )
            for saved in saved_configs
        ],
    )


def run_resolved_compare(
    *,
    prices: list[dict[str, Any]],
    sentiments: dict[date, dict[str, Any]],
    start: date,
    end: date,
    resolved: Sequence[ResolvedSavedStrategyConfig],
) -> BacktestResponse:
    """Run already-resolved configs through the compare path the API uses.

    Each config answers under its ``request_config_id``.
    """
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=end,
        total_capital=TOTAL_CAPITAL,
        configs=[
            BacktestCompareConfigV3(
                config_id=config.request_config_id,
                saved_config_id=config.saved_config_id,
            )
            for config in resolved
        ],
    )
    return run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=start,
        resolved_configs=list(resolved),
    )


__all__ = [
    "DEFAULT_CONFIG_ID",
    "TOTAL_CAPITAL",
    "golden_summary",
    "run_resolved_compare",
    "run_synthetic_compare",
]

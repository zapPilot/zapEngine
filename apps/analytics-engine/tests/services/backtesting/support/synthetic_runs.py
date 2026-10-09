"""Run saved strategy configs over synthetic markets and fingerprint the result."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
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


def matched_rule_name(details: dict[str, Any]) -> str | None:
    name = details.get("matched_rule_name")
    return name if isinstance(name, str) else None


def decision_trace(response: BacktestResponse, config_id: str) -> list[list[Any]]:
    """Per-day decision, target, transfers and equity, rounded for stability.

    Only values the engine computes with plain float arithmetic are included;
    numpy-derived metrics (Sharpe and friends) can differ in the last bit
    between platforms and are deliberately left out.
    """
    trace: list[list[Any]] = []
    for point in response.timeline:
        state = point.strategies[config_id]
        target = state.decision.target_allocation.model_dump()
        trace.append(
            [
                point.market.date.isoformat(),
                state.decision.action,
                state.decision.reason,
                matched_rule_name(state.decision.details),
                [round(target[key], 6) for key in sorted(target)],
                [
                    [t.from_bucket, t.to_bucket, round(t.amount_usd, 4)]
                    for t in state.execution.transfers
                ],
                round(state.portfolio.total_value, 4),
            ]
        )
    return trace


def golden_summary(response: BacktestResponse, config_id: str) -> dict[str, Any]:
    trace = decision_trace(response, config_id)
    encoded = json.dumps(trace, sort_keys=True, separators=(",", ":"))
    summary = response.strategies[config_id]
    return {
        "trade_count": summary.trade_count,
        "final_value": round(summary.final_value, 4),
        "rule_counts": dict(sorted(Counter(str(row[3]) for row in trace).items())),
        "digest": hashlib.sha256(encoded.encode()).hexdigest(),
    }

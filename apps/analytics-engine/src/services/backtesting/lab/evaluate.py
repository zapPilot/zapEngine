"""Evaluate a strategy spec on a market data bundle.

One call runs the spec, its leave-one-out variants and the benchmarks through
the engine together, over the same bars and under the same assumptions, then
reads the result: metrics, how each rule behaved, which invariants the strategy
breaks and where. The numbers are the engine's own (``simulate`` and the
engine's summaries), so they are the numbers the API would give.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from src.models.backtesting import BacktestResponse
from src.services.backtesting.audit import format_decision_log_lines
from src.services.backtesting.lab.attribution import rule_attribution
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.coverage import coverage_of
from src.services.backtesting.lab.days import DayView, day_views
from src.services.backtesting.lab.invariants import check_invariants
from src.services.backtesting.lab.report import (
    REPORT_FORMAT,
    Report,
    build_report,
    git_state,
    hash_of,
    normalize,
)
from src.services.backtesting.lab.runner import EvalConfig, prepare, run_specs
from src.services.backtesting.spec import StrategySpec, behavior_hash

STRATEGY_KEY = "strategy"
TRACE_MAX_LINES = 300
SYNTHETIC_WARNING = (
    "Synthetic data exercises code and pins behavior; it is not evidence about "
    "how a strategy performs on real markets."
)


def spec_ref(spec: StrategySpec) -> str:
    """``id@version#hash12``: how a report and a ledger name a spec."""
    return f"{spec.id}@{spec.version}#{behavior_hash(spec).split(':')[1][:12]}"


def components(spec: StrategySpec) -> dict[str, StrategySpec]:
    """Each piece of ``spec`` that can be left out, with the spec that lacks it."""
    variants: dict[str, StrategySpec] = {}
    if len(spec.rules) > 1:
        for index, rule in enumerate(spec.rules):
            variants[f"rule:{rule.id}"] = spec.model_copy(
                update={"rules": spec.rules[:index] + spec.rules[index + 1 :]}
            )
    for index, overlay in enumerate(spec.overlays):
        variants[f"overlay:{overlay.id}"] = spec.model_copy(
            update={"overlays": spec.overlays[:index] + spec.overlays[index + 1 :]}
        )
    for index, guard in enumerate(spec.guards):
        variants[f"guard:{guard.kind}"] = spec.model_copy(
            update={"guards": spec.guards[:index] + spec.guards[index + 1 :]}
        )
    return variants


def evaluate(
    spec: StrategySpec,
    bundle: Bundle,
    config: EvalConfig | None = None,
    *,
    git: Mapping[str, Any] | None = None,
) -> Report:
    config = config or EvalConfig()
    prepared = prepare(bundle, config)
    variants = components(spec) if config.leave_one_out else {}
    response = run_specs(
        {
            STRATEGY_KEY: spec,
            **{_variant_key(label): variant for label, variant in variants.items()},
        },
        prepared,
        config,
        benchmarks=config.benchmarks,
    )
    start, end = prepared.start, prepared.end
    days = day_views(response, STRATEGY_KEY, prepared.prices)
    metrics = {
        key: strategy_metrics(response, key)
        for key in [STRATEGY_KEY, *config.benchmarks]
    }
    body = {
        "report_format": REPORT_FORMAT,
        "fingerprint": _fingerprint(spec, bundle, config, git),
        "assumptions": config.assumptions.model_dump(),
        "total_capital": config.total_capital,
        "window": _window(response, bundle, start, end),
        "strategies": metrics,
        "comparisons": _comparisons(metrics, config.benchmarks),
        "attribution": _attribution(
            spec, days, metrics[STRATEGY_KEY], response, variants
        ),
        "invariants": [
            item.as_dict()
            for item in check_invariants(
                days,
                fill_lag_days=config.assumptions.fill_lag_days,
                cross_down_rule_ids=[
                    rule.id for rule in spec.rules if rule.kind == "dma_cross_down_exit"
                ],
            )
        ],
        "trace": _trace(response),
        "warnings": _warnings(bundle, start, end, days),
    }
    return build_report(body)


def _variant_key(label: str) -> str:
    return f"without:{label}"


def strategy_metrics(response: BacktestResponse, key: str) -> dict[str, Any]:
    summary = response.strategies[key]
    points = [point.strategies[key] for point in response.timeline]
    values = [state.portfolio.total_value for state in points]
    traded = sum(
        transfer.amount_usd
        for state in points
        for transfer in state.execution.transfers
    )
    exposure = [
        sum(
            getattr(state.portfolio.asset_allocation, asset)
            for asset in ("btc", "eth", "spy")
        )
        for state in points
    ]
    invested = summary.total_invested
    attribution = summary.pnl_attribution
    return {
        "final_value": summary.final_value,
        "total_invested": invested,
        "roi_percent": summary.roi_percent,
        "max_drawdown_percent": summary.max_drawdown_percent,
        "sharpe_ratio": summary.sharpe_ratio,
        "sortino_ratio": summary.sortino_ratio,
        "calmar_ratio": summary.calmar_ratio,
        "volatility": summary.volatility,
        "trade_count": summary.trade_count,
        "pnl_attribution": attribution.model_dump(),
        "pnl_share_of_capital": {
            "price": attribution.price_usd / invested * 100.0 if invested else 0.0,
            "yield": attribution.yield_usd / invested * 100.0 if invested else 0.0,
            "cost": attribution.cost_usd / invested * 100.0 if invested else 0.0,
        },
        "avg_risk_exposure": sum(exposure) / len(exposure) if exposure else 0.0,
        "traded_usd": traded,
        "turnover": traded / (sum(values) / len(values)) if values else 0.0,
        "final_allocation": summary.final_asset_allocation.model_dump(),
    }


def _comparisons(
    metrics: Mapping[str, Mapping[str, Any]],
    benchmarks: Sequence[str],
) -> dict[str, dict[str, float]]:
    """How far ahead of each benchmark the strategy ended (positive = ahead)."""
    own = metrics[STRATEGY_KEY]
    return {
        name: {
            "roi_pp": own["roi_percent"] - metrics[name]["roi_percent"],
            "max_drawdown_pp": own["max_drawdown_percent"]
            - metrics[name]["max_drawdown_percent"],
            "sharpe": own["sharpe_ratio"] - metrics[name]["sharpe_ratio"],
        }
        for name in benchmarks
    }


def _attribution(
    spec: StrategySpec,
    days: Sequence[DayView],
    own: Mapping[str, Any],
    response: BacktestResponse,
    variants: Mapping[str, StrategySpec],
) -> dict[str, Any]:
    stats = rule_attribution(days, [rule.id for rule in spec.rules])
    leave_one_out = {}
    for label in variants:
        ablated = response.strategies[_variant_key(label)]
        leave_one_out[label] = {
            "roi_pp": own["roi_percent"] - ablated.roi_percent,
            "max_drawdown_pp": own["max_drawdown_percent"]
            - ablated.max_drawdown_percent,
            "sharpe": own["sharpe_ratio"] - ablated.sharpe_ratio,
            "trades": own["trade_count"] - ablated.trade_count,
        }
    return {**stats.as_dict(), "leave_one_out": leave_one_out}


def _fingerprint(
    spec: StrategySpec,
    bundle: Bundle,
    config: EvalConfig,
    git: Mapping[str, Any] | None,
) -> dict[str, Any]:
    manifest = bundle.manifest
    return {
        "spec": {
            "ref": spec_ref(spec),
            "id": spec.id,
            "version": spec.version,
            "behavior_hash": behavior_hash(spec),
        },
        "bundle": {
            "ref": f"{manifest.name}:{manifest.bundle_id}",
            "name": manifest.name,
            "source": manifest.source,
            "content_sha256": manifest.content_sha256,
        },
        "eval_config_hash": hash_of(normalize(config.as_dict())),
        "git": dict(git) if git is not None else git_state(),
    }


def _window(
    response: BacktestResponse,
    bundle: Bundle,
    start: date,
    end: date,
) -> dict[str, Any]:
    timeline = response.timeline
    return {
        "start": timeline[0].market.date if timeline else start,
        "end": timeline[-1].market.date if timeline else end,
        "days": len(timeline),
        "requested_start": start,
        "requested_end": end,
        "bundle_start": bundle.manifest.start,
        "bundle_end": bundle.manifest.end,
    }


def _trace(response: BacktestResponse) -> dict[str, Any]:
    """The days the strategy moved money, as compact decision-log lines."""
    lines = [
        line
        for line in format_decision_log_lines(
            timeline=[point.model_dump(mode="json") for point in response.timeline],
            strategy_ids=[STRATEGY_KEY],
        )
        if '"executed":true' in line
    ]
    return {
        "executed_days": len(lines),
        "shown": min(len(lines), TRACE_MAX_LINES),
        "lines": lines[:TRACE_MAX_LINES],
    }


def _warnings(
    bundle: Bundle,
    start: date,
    end: date,
    days: Sequence[DayView],
) -> list[str]:
    warnings: list[str] = []
    if bundle.manifest.source == "synthetic":
        warnings.append(SYNTHETIC_WARNING)
    if start < bundle.manifest.start:
        warnings.append(
            f"The window starts {start}, before the bundle's {bundle.manifest.start}: "
            "the strategy's warmup may be incomplete."
        )
    recommendation = coverage_of(bundle.prices, bundle.sentiments).recommendation
    if recommendation.folds == 0:
        warnings.append(recommendation.reason)
    if not days:
        warnings.append("The window has no days to evaluate.")
    return warnings


__all__ = [
    "EvalConfig",
    "STRATEGY_KEY",
    "SYNTHETIC_WARNING",
    "components",
    "evaluate",
    "spec_ref",
    "strategy_metrics",
]

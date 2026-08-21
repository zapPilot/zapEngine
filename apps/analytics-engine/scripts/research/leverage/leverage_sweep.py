"""Run the unregistered DMA/FGI leverage sensitivity experiment."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from scripts.research.leverage.config import LeverageConfig, LeverageMode
from scripts.research.leverage.strategy import LeveredRuleBasedPortfolioStrategy
from src.core.database import close_database, init_database, session_scope
from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.composition import ResolvedSavedStrategyConfig
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.signals.flat_minimum import (
    build_initial_flat_minimum_asset_allocation,
)
from src.services.backtesting.strategies.rule_based_portfolio import (
    DmaGatedFgiParams,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)
from src.services.dependencies import build_backtesting_service

APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_TOTAL_CAPITAL = 10_000.0
DEFAULT_REPORT_DIR = APP_ROOT / "reports"
SNAPSHOT_PATH = APP_ROOT / "tests/fixtures/strategy_performance_snapshot_500d.json"
MODES: tuple[LeverageMode, ...] = ("risk_on", "fear_dip", "both")
TARGET_LTVS = (0.20, 0.35, 0.50)
BORROW_APRS = (0.05, 0.08, 0.12)
BASELINE_IDS = ("dma_fgi_portfolio_rules", "dca_classic")


def default_reference_date() -> date:
    payload = json.loads(SNAPSHOT_PATH.read_text())
    return date.fromisoformat(str(payload["reference_date"]))


@dataclass(frozen=True)
class SweepWindow:
    name: str
    start_date: date
    end_date: date


def experiment_configs() -> tuple[LeverageConfig, ...]:
    return tuple(
        LeverageConfig(
            mode=mode,
            target_ltv=target_ltv,
            max_ltv=max(0.65, target_ltv + 0.10),
            deleverage_trigger_ltv=max(0.70, target_ltv + 0.15),
            borrow_apr=borrow_apr,
        )
        for mode in MODES
        for target_ltv in TARGET_LTVS
        for borrow_apr in BORROW_APRS
    )


def experiment_windows(reference_date: date) -> tuple[SweepWindow, ...]:
    full_start = reference_date - timedelta(days=499)
    return (
        SweepWindow("full_500d", full_start, reference_date),
        SweepWindow("first_250d", full_start, full_start + timedelta(days=249)),
        SweepWindow(
            "second_250d",
            full_start + timedelta(days=250),
            reference_date,
        ),
    )


def leverage_config_id(config: LeverageConfig) -> str:
    return (
        f"leverage_{config.mode}_ltv{int(config.target_ltv * 100):02d}_"
        f"apr{int(config.borrow_apr * 100):02d}"
    )


def _resolved_baseline(strategy_id: str) -> ResolvedSavedStrategyConfig:
    recipe = get_strategy_recipe(strategy_id)
    return ResolvedSavedStrategyConfig(
        saved_config_id=strategy_id,
        request_config_id=strategy_id,
        strategy_id=strategy_id,
        display_name=recipe.display_name,
        description=recipe.description,
        primary_asset=recipe.primary_asset,
        summary_signal_id=recipe.signal_id,
        warmup_lookback_days=recipe.warmup_lookback_days,
        market_data_requirements=recipe.market_data_requirements,
        portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
        runtime_portfolio_mode=recipe.runtime_portfolio_mode,
        supports_daily_suggestion=recipe.supports_daily_suggestion,
        public_params={},
        build_strategy=recipe.build_strategy,
    )


def resolved_leverage_config(
    config: LeverageConfig,
) -> ResolvedSavedStrategyConfig:
    recipe = get_strategy_recipe("dma_fgi_portfolio_rules")
    config_id = leverage_config_id(config)

    def build_strategy(
        request: StrategyBuildRequest,
    ) -> LeveredRuleBasedPortfolioStrategy:
        if request.initial_allocation is None:
            raise ValueError("Leverage compare requires an initial allocation")
        initial_asset_allocation = build_initial_flat_minimum_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            extra_data=request.user_prices[0].get("extra_data")
            if request.user_prices
            else None,
            price_map=request.user_prices[0].get("prices")
            if request.user_prices
            else None,
            primary_price=float(request.user_prices[0]["price"])
            if request.user_prices
            else None,
        )
        return LeveredRuleBasedPortfolioStrategy(
            total_capital=request.total_capital,
            params=DmaGatedFgiParams.from_public_params(request.params),
            strategy_id=request.resolved_config_id,
            display_name=request.resolved_config_id,
            canonical_strategy_id="dma_fgi_portfolio_rules",
            initial_asset_allocation=initial_asset_allocation,
            leverage=config,
        )

    return ResolvedSavedStrategyConfig(
        saved_config_id=config_id,
        request_config_id=config_id,
        strategy_id="dma_fgi_portfolio_rules",
        display_name=config_id,
        description="Research-only leverage overlay; not registered or exposed by API.",
        primary_asset=recipe.primary_asset,
        summary_signal_id=recipe.signal_id,
        warmup_lookback_days=recipe.warmup_lookback_days,
        market_data_requirements=recipe.market_data_requirements,
        portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
        runtime_portfolio_mode=recipe.runtime_portfolio_mode,
        supports_daily_suggestion=False,
        public_params={},
        build_strategy=build_strategy,
    )


def _request(
    *,
    window: SweepWindow,
    total_capital: float,
    configs: list[ResolvedSavedStrategyConfig],
) -> BacktestCompareRequestV3:
    return BacktestCompareRequestV3(
        token_symbol="BTC",
        total_capital=total_capital,
        start_date=window.start_date,
        end_date=window.end_date,
        configs=[
            BacktestCompareConfigV3(
                config_id=config.request_config_id,
                strategy_id=config.strategy_id,
                params={},
            )
            for config in configs
        ],
    )


def _regime_config(borrow_apr: float | None) -> RegimeConfig:
    base = RegimeConfig.default()
    apr_by_regime = {
        regime: dict(rates) for regime, rates in base.apr_by_regime.items()
    }
    if borrow_apr is not None:
        for rates in apr_by_regime.values():
            rates["borrow"] = borrow_apr
    return RegimeConfig(
        trading_slippage_percent=base.trading_slippage_percent,
        apr_by_regime=apr_by_regime,
    )


def _summary_row(summary: Any, *, config: LeverageConfig | None) -> dict[str, Any]:
    payload = summary.model_dump(mode="json")
    parameters = payload.get("parameters") or {}
    return {
        "config": None if config is None else asdict(config),
        "roi_percent": payload.get("roi_percent"),
        "sharpe_ratio": payload.get("sharpe_ratio"),
        "sortino_ratio": payload.get("sortino_ratio"),
        "calmar_ratio": payload.get("calmar_ratio"),
        "max_drawdown_percent": payload.get("max_drawdown_percent"),
        "trade_count": payload.get("trade_count"),
        "liquidation_count": parameters.get("liquidation_count", 0),
        "max_ltv": parameters.get("max_ltv", 0.0),
        "leverage_days": parameters.get("leverage_days", 0),
        "cumulative_borrow_cost": parameters.get("cumulative_borrow_cost", 0.0),
    }


async def run_sweep(
    *,
    service: Any,
    reference_date: date,
    total_capital: float,
) -> dict[str, Any]:
    baseline_configs = [_resolved_baseline(strategy_id) for strategy_id in BASELINE_IDS]
    requirements_config = resolved_leverage_config(experiment_configs()[0])
    report_windows: dict[str, Any] = {}

    for window in experiment_windows(reference_date):
        prepare_request = _request(
            window=window,
            total_capital=total_capital,
            configs=[requirements_config],
        )
        prepared = await service._prepare_market_data(
            resolved_configs=[requirements_config],
            token_symbol="BTC",
            start_date=window.start_date,
            end_date=window.end_date,
            days=None,
        )
        baseline_result = run_compare_v3_on_data(
            prices=prepared.prices,
            sentiments=prepared.sentiments,
            request=_request(
                window=window,
                total_capital=total_capital,
                configs=baseline_configs,
            ),
            user_start_date=prepared.user_start_date,
            resolved_configs=baseline_configs,
            window=prepared.window,
        )
        rows = {
            strategy_id: _summary_row(
                baseline_result.strategies[strategy_id],
                config=None,
            )
            for strategy_id in BASELINE_IDS
        }
        for config in experiment_configs():
            resolved = resolved_leverage_config(config)
            result = run_compare_v3_on_data(
                prices=prepared.prices,
                sentiments=prepared.sentiments,
                request=prepare_request.model_copy(
                    update={
                        "configs": _request(
                            window=window,
                            total_capital=total_capital,
                            configs=[resolved],
                        ).configs
                    }
                ),
                user_start_date=prepared.user_start_date,
                resolved_configs=[resolved],
                window=prepared.window,
                config=_regime_config(config.borrow_apr),
            )
            rows[leverage_config_id(config)] = _summary_row(
                result.strategies[leverage_config_id(config)],
                config=config,
            )
        report_windows[window.name] = {
            "requested_start": window.start_date.isoformat(),
            "requested_end": window.end_date.isoformat(),
            "results": rows,
        }

    return {
        "reference_date": reference_date.isoformat(),
        "total_capital": total_capital,
        "matrix_cells": len(experiment_configs()),
        "baselines": list(BASELINE_IDS),
        "limitations": [
            "Daily-close liquidation checks cannot model intraday wicks.",
            "Borrow APR is fixed per cell because historical pool rates are unavailable.",
            "This is an offline research model with no live borrowing execution path.",
        ],
        "windows": report_windows,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Leverage sweep — {report['reference_date']}",
        "",
        "Research-only results. Selection is based on risk-adjusted metrics, not ROI alone.",
        "",
    ]
    for window_name, window in report["windows"].items():
        lines.extend(
            [
                f"## {window_name}",
                "",
                "| Config | ROI % | Sharpe | Sortino | Calmar | Max DD % | Trades | Liq | Max LTV | Levered days | Borrow cost |",
                "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for config_id, row in window["results"].items():
            lines.append(
                "| "
                + " | ".join(
                    [
                        config_id,
                        _fmt(row["roi_percent"]),
                        _fmt(row["sharpe_ratio"]),
                        _fmt(row["sortino_ratio"]),
                        _fmt(row["calmar_ratio"]),
                        _fmt(row["max_drawdown_percent"]),
                        str(row["trade_count"]),
                        str(row["liquidation_count"]),
                        _fmt(row["max_ltv"]),
                        str(row["leverage_days"]),
                        _fmt(row["cumulative_borrow_cost"]),
                    ]
                )
                + " |"
            )
        lines.append("")
    lines.extend(["## Limitations", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    return "\n".join(lines) + "\n"


def _fmt(value: Any) -> str:
    return "n/a" if value is None else f"{float(value):.4f}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reference-date", type=date.fromisoformat, default=default_reference_date()
    )
    parser.add_argument("--total-capital", type=float, default=DEFAULT_TOTAL_CAPITAL)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    args = parser.parse_args(argv)

    db_url = os.environ.get("DATABASE_READ_ONLY_URL", "")
    if not db_url or db_url == "placeholder_db_url":
        print(
            "SKIP: DATABASE_READ_ONLY_URL not configured; leverage sweep requires "
            "the production read-only history.",
            file=sys.stderr,
        )
        return 0

    init_database()
    try:
        with session_scope() as db:
            service = build_backtesting_service(db)
            report = asyncio.run(
                run_sweep(
                    service=service,
                    reference_date=args.reference_date,
                    total_capital=args.total_capital,
                )
            )
    finally:
        close_database()

    args.report_dir.mkdir(parents=True, exist_ok=True)
    stem = f"leverage_sweep_{args.reference_date.isoformat()}"
    json_path = args.report_dir / f"{stem}.json"
    markdown_path = args.report_dir / f"{stem}.md"
    json_path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    markdown_path.write_text(render_markdown(report))
    print(json_path)
    print(markdown_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Optuna hyperparameter search over walk-forward out-of-sample metrics.

For each Optuna trial, builds a public-params payload for
``dma_fgi_portfolio_rules``, runs the walk-forward harness with that
payload over the requested date range, and returns the aggregated
out-of-sample metric (``oos_sharpe_mean`` or ``oos_calmar_mean``) as
the trial's objective value.

This is the structural follow-on to the walk-forward harness:
``WalkForwardRunner`` makes "score me on data I haven't seen" cheap to
call; this script feeds that score back into a TPE optimiser so the
tuning loop itself can't overfit the training window.

Run locally (requires ``DATABASE_READ_ONLY_URL`` for real fold runs):

    pnpm --filter @zapengine/analytics-engine exec uv run python \\
        scripts/attribution/optuna_search.py \\
        --strategy-id dma_fgi_portfolio_rules \\
        --start-date 2024-01-01 --end-date 2026-04-15 \\
        --in-sample-days 180 --out-of-sample-days 60 --step-days 30 \\
        --trials 30 --objective sharpe \\
        --storage sqlite:///optuna_dma_fgi.db \\
        --output reports/optuna_dma_fgi.json

The categorical-set knobs (``enabled_rules`` / ``disabled_rules``) and
the list knob (``buy_leg_caps``) are intentionally left fixed in v1 —
their search spaces blow up TPE without obvious payoff, and the
existing ``rule_only_sweep.py`` already covers rule-set diagnostics.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Literal

import optuna

from src.services.backtesting.validation.walk_forward import (
    WalkForwardConfig,
    WalkForwardReport,
    WalkForwardRunner,
)
from src.services.strategy.backtesting_service import BacktestingService

Objective = Literal["sharpe", "calmar"]


@dataclass(frozen=True)
class SearchSpaceBounds:
    """Bounds for every leaf scalar that Optuna can tune.

    Bounds are narrower than the public-params validators allow on
    purpose — TPE explores poorly at the very edges of a validator
    range, and these intervals reflect what's empirically reasonable
    on the dma_fgi_portfolio_rules baseline.
    """

    cross_cooldown_days: tuple[int, int] = (7, 180)
    pacing_k: tuple[float, float] = (1.0, 20.0)
    pacing_r_max: tuple[float, float] = (0.1, 2.0)
    buy_sideways_window_days: tuple[int, int] = (3, 14)
    buy_sideways_max_range: tuple[float, float] = (0.01, 0.10)
    dma_overextension_threshold: tuple[float, float] = (0.10, 0.60)
    overextension_threshold_multiplier_greed: tuple[float, float] = (0.20, 1.0)
    overextension_threshold_multiplier_extreme_greed: tuple[float, float] = (0.20, 1.0)
    fgi_slope_reversal_threshold: tuple[float, float] = (-0.30, -0.01)
    fgi_slope_recovery_threshold: tuple[float, float] = (0.01, 0.30)


def suggest_public_params(
    trial: optuna.Trial,
    bounds: SearchSpaceBounds = SearchSpaceBounds(),
) -> dict[str, Any]:
    """Sample one public-params dict for a single Optuna trial.

    Returned shape matches what ``DmaGatedFgiPublicParams`` expects on
    the wire (nested sections), which ``BacktestCompareConfigV3``
    normalises into flat runtime params on the way through.
    """
    return {
        "signal": {
            "cross_cooldown_days": trial.suggest_int(
                "cross_cooldown_days", *bounds.cross_cooldown_days
            ),
            "cross_on_touch": trial.suggest_categorical(
                "cross_on_touch", [True, False]
            ),
        },
        "pacing": {
            "k": trial.suggest_float("pacing_k", *bounds.pacing_k),
            "r_max": trial.suggest_float("pacing_r_max", *bounds.pacing_r_max),
        },
        "buy_gate": {
            "window_days": trial.suggest_int(
                "buy_sideways_window_days", *bounds.buy_sideways_window_days
            ),
            "sideways_max_range": trial.suggest_float(
                "buy_sideways_max_range", *bounds.buy_sideways_max_range
            ),
        },
        "top_escape": {
            "dma_overextension_threshold": trial.suggest_float(
                "dma_overextension_threshold",
                *bounds.dma_overextension_threshold,
            ),
            "overextension_threshold_multiplier_greed": trial.suggest_float(
                "overextension_threshold_multiplier_greed",
                *bounds.overextension_threshold_multiplier_greed,
            ),
            "overextension_threshold_multiplier_extreme_greed": trial.suggest_float(
                "overextension_threshold_multiplier_extreme_greed",
                *bounds.overextension_threshold_multiplier_extreme_greed,
            ),
            "fgi_slope_reversal_threshold": trial.suggest_float(
                "fgi_slope_reversal_threshold",
                *bounds.fgi_slope_reversal_threshold,
            ),
            "fgi_slope_recovery_threshold": trial.suggest_float(
                "fgi_slope_recovery_threshold",
                *bounds.fgi_slope_recovery_threshold,
            ),
        },
    }


def score_report(report: WalkForwardReport, objective: Objective) -> float:
    """Pick the out-of-sample metric Optuna is asked to maximise.

    Returns ``-inf`` when the walk-forward produced no folds so Optuna
    skips this trial without polluting the study with a misleading 0.
    """
    if not report.folds:
        return float("-inf")
    if objective == "sharpe":
        return report.oos_sharpe_mean
    return report.oos_calmar_mean


@dataclass
class OptunaSearchConfig:
    """One self-contained search description, decoupled from CLI/argparse."""

    strategy_id: str
    full_start_date: date
    full_end_date: date
    wf_config: WalkForwardConfig
    objective: Objective
    token_symbol: str = "BTC"
    total_capital: float = 10_000.0


def build_objective(
    *,
    service_factory: Callable[[], BacktestingService],
    search_config: OptunaSearchConfig,
    bounds: SearchSpaceBounds = SearchSpaceBounds(),
) -> Callable[[optuna.Trial], float]:
    """Wrap a single trial into a synchronous callable Optuna can drive.

    Each invocation builds its own service (callers can pass a factory
    that caches/shares one if they want); Optuna runs trials
    sequentially on a single study unless ``n_jobs > 1`` is passed.
    """

    def objective(trial: optuna.Trial) -> float:
        params = suggest_public_params(trial, bounds=bounds)
        service = service_factory()
        runner = WalkForwardRunner(service=service, config=search_config.wf_config)
        report = asyncio.run(
            runner.run(
                strategy_id=search_config.strategy_id,
                saved_config_id=None,
                params=params,
                token_symbol=search_config.token_symbol,
                total_capital=search_config.total_capital,
                full_start_date=search_config.full_start_date,
                full_end_date=search_config.full_end_date,
                config_id=f"optuna_trial_{trial.number}",
            )
        )
        # Record the overfit guard per trial so study_to_report can surface the
        # in-sample/OOS Sharpe gap without re-running the WalkForwardRunner
        # (ITERATION_LOG 2026-05-28 followup #2). A large negative gap means the
        # config looked good in-sample but collapsed out-of-sample.
        trial.set_user_attr("in_sample_sharpe_mean", report.in_sample_sharpe_mean)
        trial.set_user_attr("oos_sharpe_mean", report.oos_sharpe_mean)
        trial.set_user_attr(
            "oos_in_sample_gap",
            report.oos_sharpe_mean - report.in_sample_sharpe_mean,
        )
        return score_report(report, search_config.objective)

    return objective


def run_search(
    *,
    objective_fn: Callable[[optuna.Trial], float],
    n_trials: int,
    storage: str | None = None,
    study_name: str = "dma_fgi_walk_forward",
) -> optuna.Study:
    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=42),
        storage=storage,
        study_name=study_name,
        load_if_exists=storage is not None,
    )
    study.optimize(objective_fn, n_trials=n_trials, show_progress_bar=False)
    return study


def study_to_report(
    study: optuna.Study,
    *,
    config: OptunaSearchConfig,
) -> dict[str, Any]:
    """Serialise the study to a JSON-ready dict for the ``--output`` file."""
    return {
        "study_name": study.study_name,
        "objective": config.objective,
        "strategy_id": config.strategy_id,
        "token_symbol": config.token_symbol,
        "total_capital": config.total_capital,
        "full_start_date": config.full_start_date.isoformat(),
        "full_end_date": config.full_end_date.isoformat(),
        "wf_in_sample_days": config.wf_config.in_sample_days,
        "wf_out_of_sample_days": config.wf_config.out_of_sample_days,
        "wf_step_days": config.wf_config.step_days,
        "wf_anchored": config.wf_config.anchored,
        "n_trials": len(study.trials),
        "best_value": study.best_value if study.best_trial is not None else None,
        "best_params": dict(study.best_params),
        "best_oos_in_sample_gap": (
            study.best_trial.user_attrs.get("oos_in_sample_gap")
            if study.best_trial is not None
            else None
        ),
        "trials": [
            {
                "number": t.number,
                "value": t.value,
                "params": dict(t.params),
                "state": str(t.state),
                "user_attrs": dict(t.user_attrs),
            }
            for t in study.trials
        ],
    }


# ---------- CLI -----------------------------------------------------------


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strategy-id", default="dma_fgi_portfolio_rules")
    parser.add_argument(
        "--start-date",
        required=True,
        type=date.fromisoformat,
        help="Start of the full window the walk-forward will fold.",
    )
    parser.add_argument(
        "--end-date",
        required=True,
        type=date.fromisoformat,
        help="End of the full window the walk-forward will fold.",
    )
    parser.add_argument("--in-sample-days", type=int, default=180)
    parser.add_argument("--out-of-sample-days", type=int, default=60)
    parser.add_argument("--step-days", type=int, default=30)
    parser.add_argument(
        "--anchored",
        action="store_true",
        help="Use anchored (growing) in-sample windows.",
    )
    parser.add_argument("--trials", type=int, default=30)
    parser.add_argument(
        "--cooldown-max",
        type=int,
        default=180,
        help="Upper bound for the cross_cooldown_days search space "
        "(default 180; widened from the original 90 per ITERATION_LOG "
        "2026-05-28 followup #1, which found the 90 ceiling saturated).",
    )
    parser.add_argument("--objective", choices=("sharpe", "calmar"), default="sharpe")
    parser.add_argument("--token-symbol", default="BTC")
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument(
        "--storage",
        default=None,
        help="Optuna storage URL (e.g. sqlite:///optuna.db). "
        "Without it the study is in-memory and not resumable.",
    )
    parser.add_argument("--study-name", default="dma_fgi_walk_forward")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Path to write JSON summary of the study. stdout if omitted.",
    )
    return parser


def _build_service_factory() -> Callable[[], BacktestingService]:
    """Lazy factory so unit tests can import this module without DB init.

    Delegates the service wiring to
    ``src.services.dependencies.build_backtesting_service`` (the single
    construction point shared with the FastAPI provider). Each call opens its
    own ``session_scope()`` so the BacktestingService carries a fresh Session —
    Optuna trials run sequentially in this script so we never reuse a closed
    session across trials.
    """
    from src.core.database import (  # pragma: no cover - import inside factory
        db_manager,
        init_database,
        session_scope,
    )
    from src.services.dependencies import build_backtesting_service

    if db_manager.SessionLocal is None:  # pragma: no cover - first-call init
        init_database()

    def factory() -> BacktestingService:
        with session_scope() as db:
            return build_backtesting_service(db)

    return factory


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    search_config = OptunaSearchConfig(
        strategy_id=args.strategy_id,
        full_start_date=args.start_date,
        full_end_date=args.end_date,
        wf_config=WalkForwardConfig(
            in_sample_days=args.in_sample_days,
            out_of_sample_days=args.out_of_sample_days,
            step_days=args.step_days,
            anchored=bool(args.anchored),
        ),
        objective=args.objective,
        token_symbol=args.token_symbol,
        total_capital=args.total_capital,
    )

    objective_fn = build_objective(
        service_factory=_build_service_factory(),
        search_config=search_config,
        bounds=SearchSpaceBounds(cross_cooldown_days=(7, args.cooldown_max)),
    )
    study = run_search(
        objective_fn=objective_fn,
        n_trials=args.trials,
        storage=args.storage,
        study_name=args.study_name,
    )
    report = study_to_report(study, config=search_config)

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, sort_keys=True))
        print(f"Wrote study report to {args.output}", file=sys.stderr)
    else:
        print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


# Re-export marker so ruff treats _build_service_factory as live module API.
_BUILD_SERVICE_FACTORY = _build_service_factory

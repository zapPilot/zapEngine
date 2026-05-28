"""Unit tests for scripts/attribution/optuna_search.py.

All tests are DB-independent: we drive Optuna with ``FixedTrial`` for
parameter sampling, swap ``WalkForwardRunner`` for a stub via the
service factory, and never start the real Optuna optimisation loop.
"""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import optuna
import pytest

from scripts.attribution.optuna_search import (
    OptunaSearchConfig,
    SearchSpaceBounds,
    _build_arg_parser,
    build_objective,
    score_report,
    study_to_report,
    suggest_public_params,
)
from src.services.backtesting.validation.walk_forward import (
    WalkForwardConfig,
    WalkForwardFoldResult,
    WalkForwardReport,
    WalkForwardWindow,
)

# --------- suggest_public_params shape + sampling ------------------------


class TestSuggestPublicParams:
    def test_shape_matches_dma_gated_fgi_public_params(self) -> None:
        trial = optuna.trial.FixedTrial(
            {
                "cross_cooldown_days": 30,
                "cross_on_touch": True,
                "pacing_k": 5.0,
                "pacing_r_max": 1.0,
                "buy_sideways_window_days": 5,
                "buy_sideways_max_range": 0.04,
                "dma_overextension_threshold": 0.30,
                "overextension_threshold_multiplier_greed": 0.5,
                "overextension_threshold_multiplier_extreme_greed": 0.33,
                "fgi_slope_reversal_threshold": -0.05,
                "fgi_slope_recovery_threshold": 0.05,
            }
        )
        params = suggest_public_params(trial)
        # Outer sections match the DmaGatedFgiPublicParams nesting.
        assert set(params.keys()) == {"signal", "pacing", "buy_gate", "top_escape"}
        # Sampled values flow through to the right inner field.
        assert params["signal"]["cross_cooldown_days"] == 30
        assert params["signal"]["cross_on_touch"] is True
        assert params["pacing"]["k"] == 5.0
        assert params["pacing"]["r_max"] == 1.0
        assert params["buy_gate"]["window_days"] == 5
        assert params["buy_gate"]["sideways_max_range"] == 0.04
        assert params["top_escape"]["dma_overextension_threshold"] == 0.30
        assert params["top_escape"]["fgi_slope_reversal_threshold"] == pytest.approx(
            -0.05
        )

    def test_uses_provided_bounds(self) -> None:
        # Suggest values at the boundary to confirm bounds are forwarded.
        bounds = SearchSpaceBounds(
            cross_cooldown_days=(10, 11),
            pacing_k=(2.0, 2.0),
            pacing_r_max=(0.5, 0.5),
            buy_sideways_window_days=(7, 7),
            buy_sideways_max_range=(0.05, 0.05),
            dma_overextension_threshold=(0.3, 0.3),
            overextension_threshold_multiplier_greed=(0.4, 0.4),
            overextension_threshold_multiplier_extreme_greed=(0.5, 0.5),
            fgi_slope_reversal_threshold=(-0.1, -0.1),
            fgi_slope_recovery_threshold=(0.1, 0.1),
        )
        trial = optuna.trial.FixedTrial(
            {
                "cross_cooldown_days": 10,
                "cross_on_touch": False,
                "pacing_k": 2.0,
                "pacing_r_max": 0.5,
                "buy_sideways_window_days": 7,
                "buy_sideways_max_range": 0.05,
                "dma_overextension_threshold": 0.3,
                "overextension_threshold_multiplier_greed": 0.4,
                "overextension_threshold_multiplier_extreme_greed": 0.5,
                "fgi_slope_reversal_threshold": -0.1,
                "fgi_slope_recovery_threshold": 0.1,
            }
        )
        params = suggest_public_params(trial, bounds=bounds)
        assert params["signal"]["cross_cooldown_days"] == 10
        assert params["pacing"]["k"] == 2.0
        assert params["top_escape"]["overextension_threshold_multiplier_greed"] == 0.4


# --------- score_report: empty folds vs sharpe vs calmar -----------------


def _summary_stub() -> Any:  # type: ignore[name-defined]
    raise NotImplementedError  # unused placeholder so type-checkers stay quiet


class TestScoreReport:
    def test_empty_folds_returns_neg_infinity(self) -> None:
        report = WalkForwardReport(config_id="x", folds=())
        assert score_report(report, "sharpe") == float("-inf")
        assert score_report(report, "calmar") == float("-inf")

    def test_picks_sharpe_or_calmar(self) -> None:
        # A fake fold tuple with a single fold; the aggregate fields are
        # what score_report reads, so we set them directly.
        report = WalkForwardReport(
            config_id="x",
            folds=(_dummy_fold(),),
            oos_sharpe_mean=1.42,
            oos_calmar_mean=2.71,
        )
        assert score_report(report, "sharpe") == 1.42
        assert score_report(report, "calmar") == 2.71


# --------- build_objective: full trial → score wiring --------------------


class TestBuildObjective:
    def test_objective_runs_walk_forward_and_returns_oos_sharpe(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Stub WalkForwardRunner so build_objective never touches the DB.
        captured: dict[str, object] = {}

        class StubRunner:
            def __init__(self, service: object, config: object) -> None:
                captured["service"] = service
                captured["config"] = config

            async def run(self, **kwargs: object) -> WalkForwardReport:
                captured["run_kwargs"] = kwargs
                return WalkForwardReport(
                    config_id=str(kwargs.get("config_id")),
                    folds=(_dummy_fold(),),
                    oos_sharpe_mean=0.77,
                    oos_calmar_mean=1.23,
                )

        monkeypatch.setattr(
            "scripts.attribution.optuna_search.WalkForwardRunner",
            StubRunner,
        )

        config = OptunaSearchConfig(
            strategy_id="dma_fgi_portfolio_rules",
            full_start_date=date(2024, 1, 1),
            full_end_date=date(2026, 1, 1),
            wf_config=WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=30
            ),
            objective="sharpe",
        )
        service_sentinel = MagicMock(name="BacktestingService")
        objective_fn = build_objective(
            service_factory=lambda: service_sentinel,
            search_config=config,
        )

        trial = optuna.trial.FixedTrial(
            {
                "cross_cooldown_days": 14,
                "cross_on_touch": True,
                "pacing_k": 5.0,
                "pacing_r_max": 1.0,
                "buy_sideways_window_days": 5,
                "buy_sideways_max_range": 0.04,
                "dma_overextension_threshold": 0.30,
                "overextension_threshold_multiplier_greed": 0.5,
                "overextension_threshold_multiplier_extreme_greed": 0.33,
                "fgi_slope_reversal_threshold": -0.05,
                "fgi_slope_recovery_threshold": 0.05,
            }
        )
        value = objective_fn(trial)

        assert value == 0.77
        assert captured["service"] is service_sentinel
        assert captured["config"] is config.wf_config
        run_kwargs = captured["run_kwargs"]
        assert run_kwargs["strategy_id"] == "dma_fgi_portfolio_rules"
        assert run_kwargs["saved_config_id"] is None
        assert run_kwargs["full_start_date"] == date(2024, 1, 1)
        assert run_kwargs["full_end_date"] == date(2026, 1, 1)
        # The sampled params flow through to the runner unchanged.
        assert run_kwargs["params"]["signal"]["cross_cooldown_days"] == 14

    def test_objective_returns_calmar_when_configured(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class StubRunner:
            def __init__(self, *_: object, **__: object) -> None: ...

            async def run(self, **kwargs: object) -> WalkForwardReport:
                return WalkForwardReport(
                    config_id="x",
                    folds=(_dummy_fold(),),
                    oos_sharpe_mean=0.5,
                    oos_calmar_mean=2.5,
                )

        monkeypatch.setattr(
            "scripts.attribution.optuna_search.WalkForwardRunner",
            StubRunner,
        )

        config = OptunaSearchConfig(
            strategy_id="dma_fgi_portfolio_rules",
            full_start_date=date(2024, 1, 1),
            full_end_date=date(2026, 1, 1),
            wf_config=WalkForwardConfig(),
            objective="calmar",
        )
        objective_fn = build_objective(
            service_factory=MagicMock(return_value=MagicMock()),
            search_config=config,
        )
        trial = optuna.trial.FixedTrial(
            {
                "cross_cooldown_days": 14,
                "cross_on_touch": True,
                "pacing_k": 5.0,
                "pacing_r_max": 1.0,
                "buy_sideways_window_days": 5,
                "buy_sideways_max_range": 0.04,
                "dma_overextension_threshold": 0.30,
                "overextension_threshold_multiplier_greed": 0.5,
                "overextension_threshold_multiplier_extreme_greed": 0.33,
                "fgi_slope_reversal_threshold": -0.05,
                "fgi_slope_recovery_threshold": 0.05,
            }
        )
        assert objective_fn(trial) == 2.5


# --------- study_to_report ----------------------------------------------


class TestStudyToReport:
    def test_serialises_study_for_json_output(self) -> None:
        study = optuna.create_study(direction="maximize")
        # Add one completed trial manually.
        study.add_trial(
            optuna.trial.create_trial(
                params={"cross_cooldown_days": 30, "pacing_k": 5.0},
                distributions={
                    "cross_cooldown_days": optuna.distributions.IntDistribution(7, 90),
                    "pacing_k": optuna.distributions.FloatDistribution(1.0, 20.0),
                },
                value=1.5,
            )
        )
        config = OptunaSearchConfig(
            strategy_id="dma_fgi_portfolio_rules",
            full_start_date=date(2024, 1, 1),
            full_end_date=date(2026, 1, 1),
            wf_config=WalkForwardConfig(180, 60, 30),
            objective="sharpe",
        )
        report = study_to_report(study, config=config)
        assert report["objective"] == "sharpe"
        assert report["strategy_id"] == "dma_fgi_portfolio_rules"
        assert report["full_start_date"] == "2024-01-01"
        assert report["n_trials"] == 1
        assert report["best_value"] == 1.5
        assert report["best_params"] == {"cross_cooldown_days": 30, "pacing_k": 5.0}
        assert len(report["trials"]) == 1
        assert report["trials"][0]["value"] == 1.5


# --------- argparse ------------------------------------------------------


class TestArgParser:
    def test_required_dates_and_defaults(self) -> None:
        parser = _build_arg_parser()
        args = parser.parse_args(
            ["--start-date", "2024-01-01", "--end-date", "2025-01-01"]
        )
        assert args.start_date == date(2024, 1, 1)
        assert args.end_date == date(2025, 1, 1)
        assert args.strategy_id == "dma_fgi_portfolio_rules"
        assert args.in_sample_days == 180
        assert args.out_of_sample_days == 60
        assert args.step_days == 30
        assert args.anchored is False
        assert args.trials == 30
        assert args.objective == "sharpe"
        assert args.token_symbol == "BTC"

    def test_anchored_flag(self) -> None:
        parser = _build_arg_parser()
        args = parser.parse_args(
            ["--start-date", "2024-01-01", "--end-date", "2025-01-01", "--anchored"]
        )
        assert args.anchored is True

    def test_objective_choices_enforced(self) -> None:
        parser = _build_arg_parser()
        with pytest.raises(SystemExit):
            parser.parse_args(
                [
                    "--start-date",
                    "2024-01-01",
                    "--end-date",
                    "2025-01-01",
                    "--objective",
                    "omega",
                ]
            )


# --------- helpers -------------------------------------------------------


def _dummy_fold() -> WalkForwardFoldResult:
    from src.models.backtesting import StrategySummary

    window = WalkForwardWindow(
        date(2024, 1, 1),
        date(2024, 6, 28),
        date(2024, 6, 29),
        date(2024, 8, 27),
    )
    summary = StrategySummary(
        strategy_id="dma_fgi_portfolio_rules",
        display_name="DMA/FGI",
        total_invested=10_000.0,
        final_value=11_000.0,
        roi_percent=10.0,
        trade_count=5,
        sharpe_ratio=1.0,
        calmar_ratio=2.0,
        final_allocation={"spot": 0.5, "stable": 0.5},
        final_asset_allocation={
            "btc": 0.5,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.5,
            "alt": 0.0,
        },
    )
    return WalkForwardFoldResult(
        window=window,
        in_sample_summary=summary,
        out_of_sample_summary=summary,
    )


# Avoid unused-import warning while keeping a clear type for the helper above.
from typing import Any  # noqa: E402

"""Walk-forward validation harness.

Splits a full backtest window into rolling in-sample / out-of-sample folds,
runs the same saved-config + params over each fold via the existing
``BacktestingService.run_compare_v3``, and aggregates per-fold metrics.

The harness is the foundation for unbiased parameter tuning (Phase E /
``scripts/attribution/optuna_search.py``): any objective that maximises a
metric on a single fixed window is structurally in-sample-overfit, and a
walk-forward objective avoids that by always scoring on a window the tuner
has not seen.

The window splitter (:func:`split_windows`) is a pure date-arithmetic
function and is fully unit-testable without a database. The runner
(:class:`WalkForwardRunner`) calls back into the production service —
end-to-end fold runs need the same ``DATABASE_READ_ONLY_URL`` that powers
the snapshot fixture.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    StrategyId,
    StrategySummary,
)
from src.services.strategy.backtesting_service import BacktestingService


@dataclass(frozen=True)
class WalkForwardWindow:
    """A single in-sample → out-of-sample slice of the full timeline."""

    in_sample_start: date
    in_sample_end: date
    out_of_sample_start: date
    out_of_sample_end: date


@dataclass(frozen=True)
class WalkForwardConfig:
    """Knobs that govern how :func:`split_windows` carves up a date range."""

    in_sample_days: int = 180
    out_of_sample_days: int = 60
    step_days: int = 30
    # If True the in-sample window starts at ``full_start`` for every fold and
    # only the end-date grows; otherwise the entire in-sample window slides
    # forward by ``step_days`` per fold.
    anchored: bool = False


@dataclass(frozen=True)
class WalkForwardFoldResult:
    """Per-fold result: window + in-sample + out-of-sample summaries."""

    window: WalkForwardWindow
    in_sample_summary: StrategySummary
    out_of_sample_summary: StrategySummary


@dataclass(frozen=True)
class WalkForwardReport:
    """Aggregated walk-forward report for one config across all folds."""

    config_id: str
    folds: tuple[WalkForwardFoldResult, ...]
    oos_sharpe_mean: float = 0.0
    oos_sharpe_std: float = 0.0
    oos_calmar_mean: float = 0.0
    oos_calmar_std: float = 0.0
    oos_roi_mean: float = 0.0
    in_sample_sharpe_mean: float = 0.0


def split_windows(
    full_start: date,
    full_end: date,
    config: WalkForwardConfig = WalkForwardConfig(),
) -> list[WalkForwardWindow]:
    """Carve ``[full_start, full_end]`` into rolling walk-forward windows.

    A window is emitted whenever a full in-sample + out-of-sample pair fits
    inside the global range. The out-of-sample window starts on the day
    after the in-sample window ends, so the two are disjoint and adjacent.

    Returns an empty list when the global range is too short to fit even
    one fold.
    """
    if (
        config.in_sample_days <= 0
        or config.out_of_sample_days <= 0
        or config.step_days <= 0
    ):
        raise ValueError(
            "in_sample_days, out_of_sample_days, step_days must all be positive"
        )
    if full_end < full_start:
        raise ValueError("full_end must be on or after full_start")

    windows: list[WalkForwardWindow] = []
    fold_index = 0
    while True:
        in_sample_start = (
            full_start
            if config.anchored
            else full_start + timedelta(days=config.step_days * fold_index)
        )
        in_sample_end = full_start + timedelta(
            days=config.step_days * fold_index + config.in_sample_days - 1
        )
        oos_start = in_sample_end + timedelta(days=1)
        oos_end = oos_start + timedelta(days=config.out_of_sample_days - 1)
        if oos_end > full_end:
            break
        windows.append(
            WalkForwardWindow(
                in_sample_start=in_sample_start,
                in_sample_end=in_sample_end,
                out_of_sample_start=oos_start,
                out_of_sample_end=oos_end,
            )
        )
        fold_index += 1
    return windows


@dataclass
class _FoldSpec:
    """Shared per-fold parameters passed from :meth:`WalkForwardRunner.run` to ``_run_fold``."""

    strategy_id: StrategyId | None
    saved_config_id: str | None
    params: dict[str, Any]
    token_symbol: str
    total_capital: float


@dataclass
class WalkForwardRunner:
    """Run a saved-config + params over every walk-forward fold.

    Calls the production :class:`BacktestingService` in-process; no HTTP
    layer is involved. Folds run sequentially to keep the DB connection
    pool calm — fold counts are typically < 20 over a multi-year window.
    """

    service: BacktestingService
    config: WalkForwardConfig = field(default_factory=WalkForwardConfig)

    async def run(
        self,
        *,
        strategy_id: StrategyId | None,
        saved_config_id: str | None,
        params: dict[str, Any],
        token_symbol: str,
        total_capital: float,
        full_start_date: date,
        full_end_date: date,
        config_id: str = "walk_forward",
    ) -> WalkForwardReport:
        if strategy_id is None and saved_config_id is None:
            raise ValueError("Must provide either strategy_id or saved_config_id")

        spec = _FoldSpec(
            strategy_id=strategy_id,
            saved_config_id=saved_config_id,
            params=params,
            token_symbol=token_symbol,
            total_capital=total_capital,
        )
        windows = split_windows(full_start_date, full_end_date, self.config)
        folds: list[WalkForwardFoldResult] = []
        for window in windows:
            in_summary = await self._run_fold(
                spec=spec,
                start_date=window.in_sample_start,
                end_date=window.in_sample_end,
                config_id=f"{config_id}_in_{len(folds)}",
            )
            oos_summary = await self._run_fold(
                spec=spec,
                start_date=window.out_of_sample_start,
                end_date=window.out_of_sample_end,
                config_id=f"{config_id}_oos_{len(folds)}",
            )
            folds.append(
                WalkForwardFoldResult(
                    window=window,
                    in_sample_summary=in_summary,
                    out_of_sample_summary=oos_summary,
                )
            )

        return _aggregate_report(config_id=config_id, folds=tuple(folds))

    async def _run_fold(
        self,
        *,
        spec: _FoldSpec,
        start_date: date,
        end_date: date,
        config_id: str,
    ) -> StrategySummary:
        request = BacktestCompareRequestV3(
            token_symbol=spec.token_symbol,
            start_date=start_date,
            end_date=end_date,
            total_capital=spec.total_capital,
            configs=[
                BacktestCompareConfigV3(
                    config_id=config_id,
                    saved_config_id=spec.saved_config_id,
                    strategy_id=spec.strategy_id,
                    params=spec.params,
                )
            ],
        )
        response = await self.service.run_compare_v3(request)
        summary = response.strategies.get(config_id)
        if summary is None:
            raise RuntimeError(
                f"Backtest service returned no summary for config_id={config_id!r}"
            )
        return summary


def _aggregate_report(
    *,
    config_id: str,
    folds: tuple[WalkForwardFoldResult, ...],
) -> WalkForwardReport:
    if not folds:
        return WalkForwardReport(config_id=config_id, folds=folds)

    oos_sharpes = [fold.out_of_sample_summary.sharpe_ratio for fold in folds]
    oos_calmars = [fold.out_of_sample_summary.calmar_ratio for fold in folds]
    oos_rois = [fold.out_of_sample_summary.roi_percent for fold in folds]
    in_sharpes = [fold.in_sample_summary.sharpe_ratio for fold in folds]

    return WalkForwardReport(
        config_id=config_id,
        folds=folds,
        oos_sharpe_mean=statistics.fmean(oos_sharpes),
        oos_sharpe_std=statistics.pstdev(oos_sharpes) if len(oos_sharpes) > 1 else 0.0,
        oos_calmar_mean=statistics.fmean(oos_calmars),
        oos_calmar_std=statistics.pstdev(oos_calmars) if len(oos_calmars) > 1 else 0.0,
        oos_roi_mean=statistics.fmean(oos_rois),
        in_sample_sharpe_mean=statistics.fmean(in_sharpes),
    )

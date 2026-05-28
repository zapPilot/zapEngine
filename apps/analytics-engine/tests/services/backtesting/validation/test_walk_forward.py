"""Tests for the walk-forward validation harness.

The window splitter is tested as a pure function with no mocks. The
runner is tested with a mocked ``BacktestingService.run_compare_v3``
so it never touches the database or the strategy engine.
"""

from __future__ import annotations

from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.models.backtesting import (
    BacktestResponse,
    StrategySummary,
)
from src.services.backtesting.validation.walk_forward import (
    WalkForwardConfig,
    WalkForwardFoldResult,
    WalkForwardRunner,
    WalkForwardWindow,
    _aggregate_report,
    split_windows,
)

# --------- split_windows: pure date arithmetic, no DB --------------------


class TestSplitWindowsBasic:
    def test_emits_first_fold_when_range_fits(self) -> None:
        windows = split_windows(
            date(2024, 1, 1),
            date(2024, 12, 31),
            WalkForwardConfig(in_sample_days=180, out_of_sample_days=60, step_days=30),
        )
        assert len(windows) >= 1
        first = windows[0]
        assert first.in_sample_start == date(2024, 1, 1)
        # 180 days inclusive of start ⇒ end is start + 179 days.
        assert (first.in_sample_end - first.in_sample_start).days == 179
        # OOS starts the day after in-sample ends, runs 60 days inclusive.
        assert (first.out_of_sample_start - first.in_sample_end).days == 1
        assert (first.out_of_sample_end - first.out_of_sample_start).days == 59

    def test_adjacent_folds_are_disjoint(self) -> None:
        windows = split_windows(
            date(2024, 1, 1),
            date(2026, 1, 1),
            WalkForwardConfig(in_sample_days=180, out_of_sample_days=60, step_days=30),
        )
        assert len(windows) >= 2
        for w in windows:
            assert w.out_of_sample_start > w.in_sample_end
            assert w.out_of_sample_start - w.in_sample_end == (
                w.out_of_sample_start - w.in_sample_end
            )
            # Within a single fold, in-sample comes strictly before OOS.

    def test_step_advances_in_sample_when_sliding(self) -> None:
        windows = split_windows(
            date(2024, 1, 1),
            date(2026, 1, 1),
            WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=30, anchored=False
            ),
        )
        # Sliding mode: each fold's in_sample_start is +step_days from the prior.
        for prev, curr in zip(windows, windows[1:], strict=False):
            assert (curr.in_sample_start - prev.in_sample_start).days == 30

    def test_anchored_mode_keeps_in_sample_start_fixed(self) -> None:
        windows = split_windows(
            date(2024, 1, 1),
            date(2026, 1, 1),
            WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=30, anchored=True
            ),
        )
        for w in windows:
            assert w.in_sample_start == date(2024, 1, 1)
        # In-sample window grows; subsequent in_sample_end > earlier in_sample_end.
        for prev, curr in zip(windows, windows[1:], strict=False):
            assert curr.in_sample_end > prev.in_sample_end

    def test_never_overflows_full_end(self) -> None:
        windows = split_windows(
            date(2024, 1, 1),
            date(2025, 6, 30),
            WalkForwardConfig(in_sample_days=180, out_of_sample_days=60, step_days=30),
        )
        for w in windows:
            assert w.out_of_sample_end <= date(2025, 6, 30)

    def test_returns_empty_when_range_too_short(self) -> None:
        windows = split_windows(
            date(2024, 1, 1),
            date(2024, 3, 1),  # only ~60 days, need 240
            WalkForwardConfig(in_sample_days=180, out_of_sample_days=60, step_days=30),
        )
        assert windows == []

    def test_full_end_before_full_start_raises(self) -> None:
        with pytest.raises(ValueError, match="full_end must be on or after"):
            split_windows(
                date(2024, 6, 1),
                date(2024, 1, 1),
                WalkForwardConfig(),
            )

    def test_non_positive_config_values_raise(self) -> None:
        with pytest.raises(ValueError, match="must all be positive"):
            split_windows(
                date(2024, 1, 1),
                date(2025, 1, 1),
                WalkForwardConfig(in_sample_days=0),
            )
        with pytest.raises(ValueError, match="must all be positive"):
            split_windows(
                date(2024, 1, 1),
                date(2025, 1, 1),
                WalkForwardConfig(out_of_sample_days=-1),
            )
        with pytest.raises(ValueError, match="must all be positive"):
            split_windows(
                date(2024, 1, 1),
                date(2025, 1, 1),
                WalkForwardConfig(step_days=0),
            )


# --------- _aggregate_report: pure aggregation, no DB --------------------


def _summary(*, sharpe: float, calmar: float, roi: float) -> StrategySummary:
    return StrategySummary(
        strategy_id="dma_fgi_portfolio_rules",
        display_name="DMA/FGI",
        total_invested=10_000.0,
        final_value=10_000.0 * (1.0 + roi / 100.0),
        roi_percent=roi,
        trade_count=5,
        sharpe_ratio=sharpe,
        calmar_ratio=calmar,
        final_allocation={"spot": 0.5, "stable": 0.5},
        final_asset_allocation={
            "btc": 0.5,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.5,
            "alt": 0.0,
        },
    )


class TestAggregateReport:
    def test_empty_folds_returns_zero_aggregates(self) -> None:
        report = _aggregate_report(config_id="foo", folds=())
        assert report.folds == ()
        assert report.oos_sharpe_mean == 0.0
        assert report.oos_sharpe_std == 0.0

    def test_means_match_python_statistics(self) -> None:
        window = WalkForwardWindow(
            date(2024, 1, 1), date(2024, 6, 28),
            date(2024, 6, 29), date(2024, 8, 27),
        )
        folds = tuple(
            WalkForwardFoldResult(
                window=window,
                in_sample_summary=_summary(sharpe=2.0, calmar=3.0, roi=20.0),
                out_of_sample_summary=_summary(sharpe=oos_sharpe, calmar=oos_calmar, roi=oos_roi),
            )
            for oos_sharpe, oos_calmar, oos_roi in (
                (1.5, 2.5, 10.0),
                (1.0, 2.0, 5.0),
                (0.5, 1.5, 1.0),
            )
        )
        report = _aggregate_report(config_id="foo", folds=folds)
        assert report.oos_sharpe_mean == pytest.approx((1.5 + 1.0 + 0.5) / 3)
        assert report.oos_calmar_mean == pytest.approx((2.5 + 2.0 + 1.5) / 3)
        assert report.oos_roi_mean == pytest.approx((10.0 + 5.0 + 1.0) / 3)
        assert report.in_sample_sharpe_mean == pytest.approx(2.0)
        # Population std for >1 sample is non-zero.
        assert report.oos_sharpe_std > 0.0


# --------- WalkForwardRunner: mocked service, no DB ----------------------


class TestWalkForwardRunner:
    @pytest.mark.asyncio
    async def test_run_propagates_params_to_each_fold(self) -> None:
        service = MagicMock()
        captured_requests: list[Any] = []

        async def fake_run_compare_v3(request):  # type: ignore[no-untyped-def]
            captured_requests.append(request)
            config_id = request.configs[0].config_id
            return BacktestResponse(
                strategies={
                    config_id: _summary(sharpe=1.0, calmar=2.0, roi=10.0),
                },
                timeline=[],
            )

        service.run_compare_v3 = AsyncMock(side_effect=fake_run_compare_v3)

        runner = WalkForwardRunner(
            service=service,
            config=WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=30
            ),
        )
        params = {"signal": {"cross_cooldown_days": 14}}
        report = await runner.run(
            strategy_id="dma_fgi_portfolio_rules",
            saved_config_id=None,
            params=params,
            token_symbol="BTC",
            total_capital=10_000.0,
            full_start_date=date(2024, 1, 1),
            full_end_date=date(2025, 6, 30),
        )

        assert len(report.folds) >= 1
        # Each fold issues two requests (in-sample + OOS), so total = 2 * folds.
        assert len(captured_requests) == 2 * len(report.folds)
        for req in captured_requests:
            # BacktestCompareConfigV3.validate_config normalises nested public
            # params into flat runtime params, so we verify the tuned key
            # propagates through that normalisation rather than asserting
            # dict equality.
            assert req.configs[0].params["cross_cooldown_days"] == 14
            assert req.configs[0].strategy_id == "dma_fgi_portfolio_rules"
            assert req.token_symbol == "BTC"
            assert req.total_capital == 10_000.0

    @pytest.mark.asyncio
    async def test_run_aggregates_oos_metrics_across_folds(self) -> None:
        service = MagicMock()
        oos_sharpes = iter([0.5, 1.0, 1.5])

        async def fake_run_compare_v3(request):  # type: ignore[no-untyped-def]
            config_id = request.configs[0].config_id
            if config_id.endswith("_oos_0") or config_id.endswith("_oos_1") or config_id.endswith("_oos_2"):
                sharpe = next(oos_sharpes)
            else:
                sharpe = 2.0  # in-sample
            return BacktestResponse(
                strategies={
                    config_id: _summary(sharpe=sharpe, calmar=1.0, roi=5.0),
                },
                timeline=[],
            )

        service.run_compare_v3 = AsyncMock(side_effect=fake_run_compare_v3)

        runner = WalkForwardRunner(
            service=service,
            config=WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=120
            ),
        )
        report = await runner.run(
            strategy_id="dma_fgi_portfolio_rules",
            saved_config_id=None,
            params={},
            token_symbol="BTC",
            total_capital=10_000.0,
            full_start_date=date(2024, 1, 1),
            full_end_date=date(2025, 6, 30),
        )

        # 3 folds expected with step=120, oos=60, in=180, end-2024-06-28-ish.
        assert len(report.folds) == 3
        assert report.oos_sharpe_mean == pytest.approx((0.5 + 1.0 + 1.5) / 3)
        assert report.in_sample_sharpe_mean == pytest.approx(2.0)

    @pytest.mark.asyncio
    async def test_run_raises_when_no_strategy_or_saved_config(self) -> None:
        service = MagicMock()
        runner = WalkForwardRunner(service=service)
        with pytest.raises(ValueError, match="strategy_id or saved_config_id"):
            await runner.run(
                strategy_id=None,
                saved_config_id=None,
                params={},
                token_symbol="BTC",
                total_capital=10_000.0,
                full_start_date=date(2024, 1, 1),
                full_end_date=date(2025, 1, 1),
            )

    @pytest.mark.asyncio
    async def test_run_raises_when_service_omits_summary(self) -> None:
        service = MagicMock()
        # Service returns an empty strategies dict — runner should refuse to silently continue.
        service.run_compare_v3 = AsyncMock(
            return_value=BacktestResponse(strategies={}, timeline=[])
        )
        runner = WalkForwardRunner(
            service=service,
            config=WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=30
            ),
        )
        with pytest.raises(RuntimeError, match="returned no summary"):
            await runner.run(
                strategy_id="dma_fgi_portfolio_rules",
                saved_config_id=None,
                params={},
                token_symbol="BTC",
                total_capital=10_000.0,
                full_start_date=date(2024, 1, 1),
                full_end_date=date(2025, 6, 30),
            )

    @pytest.mark.asyncio
    async def test_empty_window_range_returns_empty_report(self) -> None:
        service = MagicMock()
        service.run_compare_v3 = AsyncMock()
        runner = WalkForwardRunner(
            service=service,
            config=WalkForwardConfig(
                in_sample_days=180, out_of_sample_days=60, step_days=30
            ),
        )
        report = await runner.run(
            strategy_id="dma_fgi_portfolio_rules",
            saved_config_id=None,
            params={},
            token_symbol="BTC",
            total_capital=10_000.0,
            full_start_date=date(2024, 1, 1),
            full_end_date=date(2024, 3, 1),  # too short
        )
        assert report.folds == ()
        # No fold runs ⇒ service never called.
        service.run_compare_v3.assert_not_awaited()



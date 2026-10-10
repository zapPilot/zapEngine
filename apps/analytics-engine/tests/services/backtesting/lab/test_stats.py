from __future__ import annotations

import random
from datetime import date, timedelta
from statistics import fmean, pstdev

import numpy as np
import pytest

from src.services.backtesting.execution.performance_metrics import (
    PerformanceMetricsCalculator,
)
from src.services.backtesting.lab import stats as stats_module
from src.services.backtesting.lab.stats import (
    EquityCurve,
    block_bootstrap,
    compounded,
    daily_sharpe,
    deflated_sharpe,
    max_drawdown_percent,
    moments,
    plateau_retention,
    sharpe,
)

START = date(2025, 1, 1)


def _noise(
    count: int, *, mean: float, seed: int = 1, scale: float = 0.01
) -> list[float]:
    rng = random.Random(seed)
    return [mean + rng.gauss(0.0, scale) for _ in range(count)]


def test_an_equity_curve_gives_daily_returns_inside_a_window() -> None:
    dates = [START + timedelta(days=offset) for offset in range(5)]
    curve = EquityCurve(dates, [100.0, 110.0, 99.0, 99.0, 108.9])

    assert curve.returns(START, START + timedelta(days=4)) == pytest.approx(
        [0.1, -0.1, 0.0, 0.1]
    )
    assert curve.returns(START + timedelta(days=2), START + timedelta(days=3)) == (
        pytest.approx([-0.1, 0.0])
    )
    assert curve.returns(START + timedelta(days=9), START + timedelta(days=10)) == []


def test_a_return_after_a_zero_value_is_skipped() -> None:
    dates = [START + timedelta(days=offset) for offset in range(3)]

    assert EquityCurve(dates, [0.0, 5.0, 10.0]).returns(START, dates[-1]) == [1.0]


def test_sharpe_is_the_engines_sharpe_over_the_stable_yield() -> None:
    returns = _noise(200, mean=0.001)

    expected = PerformanceMetricsCalculator.calculate_sharpe_ratio(
        np.array(returns), 0.03 / 365.0
    )

    assert sharpe(returns, 0.03) == pytest.approx(expected)


def test_a_slice_too_short_for_a_sharpe_has_none() -> None:
    assert sharpe([0.01], 0.03) == 0.0
    assert sharpe([], 0.03) == 0.0


def test_a_daily_sharpe_is_the_excess_mean_over_the_deviation() -> None:
    returns = [0.01, -0.01, 0.02, 0.0]

    assert daily_sharpe(returns, 0.001) == pytest.approx(
        (fmean(returns) - 0.001) / pstdev(returns)
    )


def test_a_daily_sharpe_of_nothing_or_of_a_constant_is_zero() -> None:
    assert daily_sharpe([], 0.0) == 0.0
    assert daily_sharpe([0.01], 0.0) == 0.0
    assert daily_sharpe([0.01, 0.01, 0.01], 0.0) == 0.0


def test_returns_compound() -> None:
    assert compounded([0.1, -0.1]) == pytest.approx(-0.01)
    assert compounded([]) == 0.0


def test_the_bootstrap_interval_contains_the_mean() -> None:
    values = _noise(300, mean=0.0005)

    result = block_bootstrap(values, block=10, resamples=1000, seed=3)

    assert result.low < result.mean < result.high
    assert result.resamples == 1000 and result.block == 10
    assert result.as_dict()["mean"] == result.mean


def test_a_bootstrap_can_be_restated_in_other_units() -> None:
    result = block_bootstrap(_noise(200, mean=0.0005), block=10, resamples=300, seed=3)

    yearly = result.scaled(36500.0)

    assert yearly.mean == pytest.approx(result.mean * 36500.0)
    assert (yearly.low, yearly.high) == (result.low * 36500.0, result.high * 36500.0)
    assert (yearly.p_not_positive, yearly.resamples, yearly.block) == (
        result.p_not_positive,
        result.resamples,
        result.block,
    )


def test_a_clear_edge_is_unlikely_to_be_luck() -> None:
    values = _noise(300, mean=0.01, scale=0.005)

    result = block_bootstrap(values, block=10, resamples=1000, seed=3)

    assert result.low > 0
    assert result.p_not_positive == 0.0


def test_no_edge_is_a_coin_flip() -> None:
    values = _noise(300, mean=0.0, scale=0.01, seed=5)

    result = block_bootstrap(values, block=10, resamples=2000, seed=3)

    assert result.low < 0 < result.high
    assert 0.05 < result.p_not_positive < 0.95


def test_the_same_seed_gives_the_same_resamples() -> None:
    values = _noise(100, mean=0.001)

    first = block_bootstrap(values, block=7, resamples=300, seed=11)

    assert first == block_bootstrap(values, block=7, resamples=300, seed=11)
    assert first != block_bootstrap(values, block=7, resamples=300, seed=12)


def test_a_block_longer_than_the_data_is_shortened() -> None:
    result = block_bootstrap([0.01, 0.02, 0.03], block=50, resamples=50, seed=1)

    assert result.block == 3
    assert result.mean == pytest.approx(0.02)


def test_no_data_has_no_edge() -> None:
    result = block_bootstrap([], block=10, resamples=10, seed=1)

    assert (result.mean, result.low, result.high, result.p_not_positive) == (0, 0, 0, 1)


def test_moments_of_a_symmetric_and_a_skewed_series() -> None:
    symmetric = [-2.0, -1.0, 0.0, 1.0, 2.0]
    skewed = [0.0] * 20 + [10.0]

    assert moments(symmetric)[0] == pytest.approx(0.0)
    assert moments(skewed)[0] > 2
    assert moments([1.0, 1.0, 1.0]) == (0.0, 3.0)


def test_more_trials_deflate_the_sharpe() -> None:
    returns = _noise(400, mean=0.0015)
    trial_sharpes = [0.01 * index for index in range(20)]

    few = deflated_sharpe(
        returns, risk_free_daily=0.0, trial_sharpes=trial_sharpes, trials=2
    )
    many = deflated_sharpe(
        returns, risk_free_daily=0.0, trial_sharpes=trial_sharpes, trials=500
    )

    assert few is not None and many is not None
    assert many < few
    assert 0.0 <= many <= few <= 1.0


def test_a_lone_trial_is_not_deflated() -> None:
    returns = _noise(400, mean=0.002)

    alone = deflated_sharpe(returns, risk_free_daily=0.0, trial_sharpes=[0.1], trials=1)
    none = deflated_sharpe(returns, risk_free_daily=0.0, trial_sharpes=[], trials=50)

    assert alone == none
    assert alone is not None and alone > 0.9


def test_a_strong_consistent_edge_survives_deflation() -> None:
    returns = _noise(500, mean=0.01, scale=0.004)

    value = deflated_sharpe(
        returns, risk_free_daily=0.0, trial_sharpes=[0.0, 0.05, 0.1], trials=10
    )

    assert value is not None and value > 0.99


@pytest.mark.parametrize("returns", [[], [0.01, 0.02], [0.01] * 10])
def test_a_sharpe_that_cannot_be_deflated_says_so(returns: list[float]) -> None:
    assert (
        deflated_sharpe(
            returns, risk_free_daily=0.0, trial_sharpes=[0.1, 0.2], trials=5
        )
        is None
    )


def test_an_impossible_variance_estimate_is_not_computed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # For real returns the term cannot reach zero; the guard is for a degenerate
    # estimate, so force one.
    monkeypatch.setattr(stats_module, "moments", lambda returns: (0.0, -3.0))
    returns = _noise(100, mean=0.05, scale=0.01)

    assert (
        deflated_sharpe(
            returns, risk_free_daily=0.0, trial_sharpes=[0.1, 0.2], trials=5
        )
        is None
    )


def test_a_plateau_keeps_its_score_and_a_spike_does_not() -> None:
    points = [[0.0], [0.1], [0.2], [0.3], [1.0]]

    plateau = plateau_retention(points, [1.0, 0.95, 0.9, 0.9, 0.1], 0, neighbors=2)
    spike = plateau_retention(points, [1.0, 0.1, 0.1, 0.1, 0.1], 0, neighbors=2)

    assert plateau == pytest.approx(0.925)
    assert spike == pytest.approx(0.1)


def test_retention_needs_neighbors_and_a_positive_best() -> None:
    assert plateau_retention([[0.0]], [1.0], 0, neighbors=3) is None
    assert plateau_retention([[0.0], [1.0]], [-0.5, -0.6], 0, neighbors=1) is None


def test_neighbors_are_chosen_by_distance_then_position() -> None:
    points = [[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]]

    value = plateau_retention(points, [1.0, 0.5, 0.5, 0.0], 0, neighbors=2)

    assert value == pytest.approx(0.5)


def test_a_drawdown_is_the_deepest_fall_from_a_peak() -> None:
    # 1.10, 0.88, 0.924, 0.8316, 1.2474: the peak is 1.10 and the low 0.8316.
    returns = [0.10, -0.20, 0.05, -0.10, 0.50]

    assert max_drawdown_percent(returns) == pytest.approx((0.8316 / 1.10 - 1) * 100)


def test_a_run_that_only_rises_has_no_drawdown() -> None:
    assert max_drawdown_percent([0.01, 0.02, 0.0]) == 0.0
    assert max_drawdown_percent([]) == 0.0

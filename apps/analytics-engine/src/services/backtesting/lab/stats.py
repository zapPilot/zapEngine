"""The statistics a sweep needs, kept small and deterministic.

Everything here is a pure function of its inputs. The bootstrap draws from a
seeded ``random.Random`` rather than numpy's generator, so a seed means the same
resamples on every platform and every library version.
"""

from __future__ import annotations

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from statistics import NormalDist, fmean, median, pvariance

import numpy as np

from src.services.backtesting.execution.performance_metrics import (
    PerformanceMetricsCalculator,
)

EULER_GAMMA = 0.5772156649015329
DAYS_PER_YEAR = 365.0
_NORMAL = NormalDist()


@dataclass(frozen=True)
class EquityCurve:
    """A strategy's total value by day."""

    dates: Sequence[date]
    values: Sequence[float]

    def returns(self, start: date, end: date) -> list[float]:
        """Daily returns of the days in ``start..end`` (the first day has none)."""
        return [
            self.values[index] / self.values[index - 1] - 1.0
            for index in range(1, len(self.values))
            if start <= self.dates[index] <= end and self.values[index - 1] > 0
        ]


def sharpe(returns: Sequence[float], risk_free_apr: float) -> float:
    """The engine's annualized Sharpe over the stable yield, on a slice."""
    if len(returns) < 2:
        return 0.0
    return PerformanceMetricsCalculator.calculate_sharpe_ratio(
        np.array(returns), risk_free_apr / DAYS_PER_YEAR
    )


def daily_sharpe(returns: Sequence[float], risk_free_daily: float) -> float:
    """Mean excess daily return over its standard deviation, not annualized."""
    if len(returns) < 2:
        return 0.0
    deviation = math.sqrt(pvariance(returns))
    if deviation <= 0.0:
        return 0.0
    return (fmean(returns) - risk_free_daily) / deviation


def compounded(returns: Sequence[float]) -> float:
    """The return a run of daily returns compounds to, as a fraction."""
    total = 1.0
    for value in returns:
        total *= 1.0 + value
    return total - 1.0


@dataclass(frozen=True)
class Bootstrap:
    mean: float
    low: float
    high: float
    # The share of resampled means at or below zero: a one-sided p-value for
    # "the true mean is not positive".
    p_not_positive: float
    resamples: int
    block: int

    def scaled(self, factor: float) -> Bootstrap:
        """The same interval in other units (a daily mean as a yearly percentage)."""
        return Bootstrap(
            mean=self.mean * factor,
            low=self.low * factor,
            high=self.high * factor,
            p_not_positive=self.p_not_positive,
            resamples=self.resamples,
            block=self.block,
        )

    def as_dict(self) -> dict[str, float | int]:
        return {
            "mean": self.mean,
            "low": self.low,
            "high": self.high,
            "p_not_positive": self.p_not_positive,
            "resamples": self.resamples,
            "block": self.block,
        }


def block_bootstrap(
    values: Sequence[float],
    *,
    block: int,
    resamples: int,
    seed: int,
    confidence: float = 0.9,
) -> Bootstrap:
    """Moving-block bootstrap of the mean, which keeps short-range dependence."""
    count = len(values)
    if count == 0:
        return Bootstrap(0.0, 0.0, 0.0, 1.0, resamples, block)
    size = min(block, count)
    rng = random.Random(seed)
    means: list[float] = []
    for _ in range(resamples):
        sample: list[float] = []
        while len(sample) < count:
            start = rng.randrange(count - size + 1)
            sample.extend(values[start : start + size])
        means.append(fmean(sample[:count]))
    means.sort()
    tail = (1.0 - confidence) / 2.0
    return Bootstrap(
        mean=fmean(values),
        low=means[int(tail * (resamples - 1))],
        high=means[int((1.0 - tail) * (resamples - 1))],
        p_not_positive=sum(1 for item in means if item <= 0.0) / resamples,
        resamples=resamples,
        block=size,
    )


def moments(returns: Sequence[float]) -> tuple[float, float]:
    """Skewness and (non-excess) kurtosis of returns; a normal has 0 and 3."""
    values = np.array(returns)
    centered = values - values.mean()
    variance = float(np.mean(centered**2))
    if variance <= 0.0:
        return 0.0, 3.0
    return (
        float(np.mean(centered**3) / variance**1.5),
        float(np.mean(centered**4) / variance**2),
    )


def deflated_sharpe(
    returns: Sequence[float],
    *,
    risk_free_daily: float,
    trial_sharpes: Sequence[float],
    trials: int,
) -> float | None:
    """The probability the selected strategy's Sharpe is real, given how many tried.

    Bailey and Lopez de Prado (2014). ``returns`` are the selected strategy's daily
    returns, ``trial_sharpes`` the per-day Sharpe of every trial of the sweep (their
    spread sets the bar a lucky best must clear) and ``trials`` the number of
    independent candidates ever tried. ``None`` when it cannot be computed.
    """
    count = len(returns)
    if count < 3 or pvariance(returns) <= 0.0:
        return None
    observed = daily_sharpe(returns, risk_free_daily)
    skew, kurtosis = moments(returns)
    benchmark = _expected_maximum(trial_sharpes, trials)
    spread = 1.0 - skew * observed + (kurtosis - 1.0) / 4.0 * observed**2
    if spread <= 0.0:
        return None
    return _NORMAL.cdf(
        (observed - benchmark) * math.sqrt(count - 1) / math.sqrt(spread)
    )


def _expected_maximum(trial_sharpes: Sequence[float], trials: int) -> float:
    """The best Sharpe luck alone would produce among ``trials`` candidates."""
    if trials <= 1 or len(trial_sharpes) < 2:
        return 0.0
    spread = math.sqrt(pvariance(trial_sharpes))
    return spread * (
        (1.0 - EULER_GAMMA) * _NORMAL.inv_cdf(1.0 - 1.0 / trials)
        + EULER_GAMMA * _NORMAL.inv_cdf(1.0 - 1.0 / (trials * math.e))
    )


def plateau_retention(
    points: Sequence[Sequence[float]],
    scores: Sequence[float],
    best: int,
    *,
    neighbors: int,
) -> float | None:
    """How much of the best score its nearest neighbors keep (1.0 = a plateau).

    Points are parameter vectors scaled to a common range. A best that is a spike
    among much worse neighbors will not survive a small change of any parameter.
    """
    if len(points) < 2 or scores[best] <= 0.0:
        return None
    ranked = sorted(
        (index for index in range(len(points)) if index != best),
        key=lambda index: (_distance(points[best], points[index]), index),
    )[:neighbors]
    return median(scores[index] for index in ranked) / scores[best]


def _distance(left: Sequence[float], right: Sequence[float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right, strict=True)))


__all__ = [
    "Bootstrap",
    "EquityCurve",
    "block_bootstrap",
    "compounded",
    "daily_sharpe",
    "deflated_sharpe",
    "moments",
    "plateau_retention",
    "sharpe",
]

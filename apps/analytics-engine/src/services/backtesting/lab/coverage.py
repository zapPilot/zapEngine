"""What a market data bundle actually covers, and what it can support.

History is not assumed: a bundle may start late, have holes, or lack a series.
Coverage reports it per series, finds the longest stretch where every series the
strategy needs is present, and says what that stretch can support (a holdout,
walk-forward folds, or only a descriptive run).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import pairwise
from typing import Any

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
)

# A gap of up to this many calendar days between two complete rows (a long
# weekend, one missing production day) does not end a window.
MAX_ROW_GAP_DAYS = 3
# A walk-forward needs this much history before the first out-of-sample block.
MIN_IN_SAMPLE_DAYS = 270
OOS_BLOCK_DAYS = 90
HOLDOUT_DAYS = 180

_PRICE_SERIES = ("btc", "eth", "spy")
_FEATURE_SERIES = (
    DMA_200_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
)
_MACRO_SERIES = MACRO_FEAR_GREED_FEATURE
_SENTIMENT_SERIES = "sentiment"
# Sentiment has gaps in production and the engine rides over them, so it is
# reported but never decides where a window ends.
_REQUIRED_SERIES = (*_PRICE_SERIES, *_FEATURE_SERIES, _MACRO_SERIES)


@dataclass(frozen=True)
class SeriesCoverage:
    first: date | None
    last: date | None
    count: int
    missing_days: int
    longest_gap_days: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "first": _iso(self.first),
            "last": _iso(self.last),
            "count": self.count,
            "missing_days": self.missing_days,
            "longest_gap_days": self.longest_gap_days,
        }


@dataclass(frozen=True)
class CompleteWindow:
    """The longest stretch with every required series present."""

    start: date
    end: date
    rows: int

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "days": self.days,
            "rows": self.rows,
        }


@dataclass(frozen=True)
class SplitRecommendation:
    """How the complete window could be split, and why not when it cannot."""

    development: tuple[date, date] | None
    holdout: tuple[date, date] | None
    folds: int
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "development": _span(self.development),
            "holdout": _span(self.holdout),
            "folds": self.folds,
            "min_in_sample_days": MIN_IN_SAMPLE_DAYS,
            "oos_block_days": OOS_BLOCK_DAYS,
            "holdout_days": HOLDOUT_DAYS,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class Coverage:
    rows: int
    first_row: date | None
    last_row: date | None
    series: Mapping[str, SeriesCoverage]
    complete_window: CompleteWindow | None
    recommendation: SplitRecommendation

    def as_dict(self) -> dict[str, Any]:
        return {
            "rows": self.rows,
            "first_row": _iso(self.first_row),
            "last_row": _iso(self.last_row),
            "series": {name: item.as_dict() for name, item in self.series.items()},
            "complete_window": (
                None if self.complete_window is None else self.complete_window.as_dict()
            ),
            "recommendation": self.recommendation.as_dict(),
        }


def coverage_of(
    prices: Sequence[Mapping[str, Any]],
    sentiments: Mapping[date, Any],
) -> Coverage:
    """Coverage of engine-input rows (``BacktestDataProvider`` shape)."""
    present: dict[str, list[date]] = {
        name: [] for name in (*_REQUIRED_SERIES, _SENTIMENT_SERIES)
    }
    complete: list[date] = []
    for row in sorted(prices, key=lambda item: item["date"]):
        row_date = row["date"]
        found = [name for name in _REQUIRED_SERIES if _has(row, name)]
        for name in found:
            present[name].append(row_date)
        if len(found) == len(_REQUIRED_SERIES):
            complete.append(row_date)
    present[_SENTIMENT_SERIES] = sorted(
        day for day, value in sentiments.items() if value is not None
    )
    row_dates = sorted(row["date"] for row in prices)
    window = _complete_window(complete)
    return Coverage(
        rows=len(row_dates),
        first_row=row_dates[0] if row_dates else None,
        last_row=row_dates[-1] if row_dates else None,
        series={name: _series_coverage(days) for name, days in present.items()},
        complete_window=window,
        recommendation=recommend_split(window),
    )


def recommend_split(window: CompleteWindow | None) -> SplitRecommendation:
    """What walk-forward folds and a holdout the window can honestly support."""
    if window is None:
        return SplitRecommendation(None, None, 0, "No stretch has every series.")
    needed = MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS
    if window.days < needed:
        return SplitRecommendation(
            development=(window.start, window.end),
            holdout=None,
            folds=0,
            reason=(
                f"{window.days} days is shorter than {needed} (a {MIN_IN_SAMPLE_DAYS}"
                f"-day in-sample plus one {OOS_BLOCK_DAYS}-day out-of-sample block): "
                "no walk-forward and no holdout, so results are descriptive."
            ),
        )
    if window.days < needed + HOLDOUT_DAYS:
        return SplitRecommendation(
            development=(window.start, window.end),
            holdout=None,
            folds=(window.days - MIN_IN_SAMPLE_DAYS) // OOS_BLOCK_DAYS,
            reason=(
                f"{window.days} days cannot also spare a {HOLDOUT_DAYS}-day holdout "
                f"(needs {needed + HOLDOUT_DAYS}): walk-forward only."
            ),
        )
    holdout_start = window.end - timedelta(days=HOLDOUT_DAYS - 1)
    development_end = holdout_start - timedelta(days=1)
    development_days = (development_end - window.start).days + 1
    return SplitRecommendation(
        development=(window.start, development_end),
        holdout=(holdout_start, window.end),
        folds=(development_days - MIN_IN_SAMPLE_DAYS) // OOS_BLOCK_DAYS,
        reason=(
            f"The last {HOLDOUT_DAYS} days are held out; the rest supports "
            "anchored walk-forward folds."
        ),
    )


def _has(row: Mapping[str, Any], name: str) -> bool:
    return _CHECKS[name](row)


def _positive(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and value > 0


def _price_check(asset: str) -> Callable[[Mapping[str, Any]], bool]:
    return lambda row: _positive((row.get("prices") or {}).get(asset))


def _feature_check(feature: str) -> Callable[[Mapping[str, Any]], bool]:
    return lambda row: _positive((row.get("extra_data") or {}).get(feature))


_CHECKS: dict[str, Callable[[Mapping[str, Any]], bool]] = {
    **{asset: _price_check(asset) for asset in _PRICE_SERIES},
    **{feature: _feature_check(feature) for feature in _FEATURE_SERIES},
    _MACRO_SERIES: lambda row: bool(
        isinstance((row.get("extra_data") or {}).get(_MACRO_SERIES), Mapping)
        and (row.get("extra_data") or {}).get(_MACRO_SERIES)
    ),
}


def _series_coverage(days: Sequence[date]) -> SeriesCoverage:
    if not days:
        return SeriesCoverage(None, None, 0, 0, 0)
    unique = sorted(set(days))
    gaps = [(later - earlier).days - 1 for earlier, later in pairwise(unique)]
    return SeriesCoverage(
        first=unique[0],
        last=unique[-1],
        count=len(unique),
        missing_days=(unique[-1] - unique[0]).days + 1 - len(unique),
        longest_gap_days=max(gaps, default=0),
    )


def _complete_window(complete: Sequence[date]) -> CompleteWindow | None:
    best: CompleteWindow | None = None
    run: list[date] = []
    for day in complete:
        if run and (day - run[-1]).days > MAX_ROW_GAP_DAYS:
            best = _longer(best, run)
            run = []
        run.append(day)
    return _longer(best, run) if run else best


def _longer(best: CompleteWindow | None, run: Sequence[date]) -> CompleteWindow:
    candidate = CompleteWindow(start=run[0], end=run[-1], rows=len(run))
    if best is None or candidate.days > best.days:
        return candidate
    return best


def _iso(value: date | None) -> str | None:
    return None if value is None else value.isoformat()


def _span(value: tuple[date, date] | None) -> dict[str, str] | None:
    if value is None:
        return None
    return {"start": value[0].isoformat(), "end": value[1].isoformat()}


__all__ = [
    "HOLDOUT_DAYS",
    "MAX_ROW_GAP_DAYS",
    "MIN_IN_SAMPLE_DAYS",
    "OOS_BLOCK_DAYS",
    "CompleteWindow",
    "Coverage",
    "SeriesCoverage",
    "SplitRecommendation",
    "coverage_of",
    "recommend_split",
]

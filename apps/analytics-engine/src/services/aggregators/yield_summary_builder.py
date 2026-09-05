"""Build multi-window yield summaries from canonical snapshot deltas."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from statistics import mean, median, pstdev
from typing import Any

from src.models.yield_returns import (
    MultiWindowYieldSummaryResponse,
    PeriodInfo,
    ProtocolYieldBreakdown,
    ProtocolYieldToday,
    ProtocolYieldWindow,
    StatisticalSummary,
    YieldSummaryResponse,
)
from src.services.strategy.outlier_filter_strategy import (
    IQRFilter,
    NoOpFilter,
    OutlierFilterStrategy,
    PercentileFilter,
    ZScoreFilter,
)

WINDOW_DAYS = {"7d": 7, "30d": 30, "90d": 90}

_FILTERS: dict[str, type[OutlierFilterStrategy]] = {
    "none": NoOpFilter,
    "iqr": IQRFilter,
    "zscore": ZScoreFilter,
    "percentile": PercentileFilter,
}


def _delta_date(delta: dict[str, Any]) -> date:
    raw_date = delta["snapshot_at"]
    return (
        raw_date.date()
        if isinstance(raw_date, datetime)
        else date.fromisoformat(str(raw_date)[:10])
    )


def build_yield_summary(
    user_id: str,
    deltas: list[dict[str, Any]],
    windows: tuple[str, ...],
    outlier_strategy: str,
) -> MultiWindowYieldSummaryResponse:
    """Build requested summaries, anchored to the newest available delta date.

    Averages use observed, retained delta days rather than calendar days. This
    intentionally estimates the active position's run rate when a position was
    opened or closed partway through a window.
    """
    series = _group_deltas(deltas)
    anchor = max(
        (day for protocol_series in series.values() for day in protocol_series),
        default=datetime.now(UTC).date(),
    )
    return MultiWindowYieldSummaryResponse(
        user_id=user_id,
        windows={
            window: _build_window(
                user_id,
                series,
                anchor,
                WINDOW_DAYS[window],
                outlier_strategy,
            )
            for window in windows
        },
    )


@dataclass
class _DayBucket:
    """One protocol/chain pair's observations for a single day."""

    value: float = 0.0
    token_symbols: set[str] = field(default_factory=set)
    position_types: set[str] = field(default_factory=set)


def _group_deltas(
    deltas: list[dict[str, Any]],
) -> dict[tuple[str, str], dict[date, _DayBucket]]:
    grouped: dict[tuple[str, str], dict[date, _DayBucket]] = defaultdict(
        lambda: defaultdict(_DayBucket)
    )
    for delta in deltas:
        key = (str(delta["protocol_name"]), str(delta.get("chain") or ""))
        bucket = grouped[key][_delta_date(delta)]
        bucket.value += float(delta["token_yield_usd"])

        current_amounts = delta.get("current_amounts")
        if isinstance(current_amounts, dict):
            bucket.token_symbols.update(
                str(symbol) for symbol in current_amounts if symbol
            )

        position_type = delta.get("name_item")
        if position_type:
            bucket.position_types.add(str(position_type))
    return {key: dict(values) for key, values in grouped.items()}


def _window_metadata(
    window_series: dict[date, _DayBucket],
) -> tuple[list[str], list[str]]:
    token_symbols: set[str] = set()
    position_types: set[str] = set()
    for bucket in window_series.values():
        token_symbols |= bucket.token_symbols
        position_types |= bucket.position_types
    return sorted(token_symbols), sorted(position_types)


def _build_window(
    user_id: str,
    series: dict[tuple[str, str], dict[date, _DayBucket]],
    anchor: date,
    days: int,
    outlier_strategy: str,
) -> YieldSummaryResponse:
    start = anchor - timedelta(days=days - 1)
    filter_strategy = _FILTERS[outlier_strategy]()
    headline_by_date: dict[date, float] = defaultdict(float)
    raw_dates: set[date] = set()
    breakdown: list[ProtocolYieldBreakdown] = []
    all_outliers = []

    for (protocol, chain), full_series in sorted(series.items()):
        window_series = {
            day: bucket
            for day, bucket in sorted(full_series.items())
            if start <= day <= anchor
        }
        if not window_series:
            continue

        raw_dates.update(window_series)
        serializable = {
            day.isoformat(): bucket.value for day, bucket in window_series.items()
        }
        _filtered_values, outliers = filter_strategy.filter(serializable)
        outlier_dates = {date.fromisoformat(item.date) for item in outliers}
        kept = {
            day: bucket.value
            for day, bucket in window_series.items()
            if day not in outlier_dates
        }
        for day, value in kept.items():
            headline_by_date[day] += value
        all_outliers.extend(outliers)

        values = list(kept.values())
        latest_day = max(window_series)
        token_symbols, position_types = _window_metadata(window_series)
        breakdown.append(
            ProtocolYieldBreakdown(
                protocol=protocol,
                chain=chain or None,
                token_symbols=token_symbols,
                position_types=position_types,
                window=ProtocolYieldWindow(
                    total_yield_usd=sum(values),
                    average_daily_yield_usd=mean(values) if values else 0.0,
                    data_points=len(values),
                    positive_days=sum(value > 0 for value in values),
                    negative_days=sum(value < 0 for value in values),
                ),
                today=ProtocolYieldToday(
                    date=latest_day.isoformat(),
                    yield_usd=window_series[latest_day].value,
                ),
            )
        )

    headline_values = list(headline_by_date.values())
    average = mean(headline_values) if headline_values else 0.0
    median_value = median(headline_values) if headline_values else 0.0
    total = sum(headline_values)
    statistics = StatisticalSummary(
        mean=average,
        median=median_value,
        std_dev=pstdev(headline_values) if len(headline_values) > 1 else 0.0,
        min_value=min(headline_values, default=0.0),
        max_value=max(headline_values, default=0.0),
        total_days=len(raw_dates),
        filtered_days=len(headline_values),
        outliers_removed=len(all_outliers),
    )
    all_outliers.sort(key=lambda item: (item.date, item.value))
    return YieldSummaryResponse(
        user_id=user_id,
        period=PeriodInfo(
            start_date=start.isoformat(),
            end_date=anchor.isoformat(),
            days=days,
        ),
        average_daily_yield_usd=average,
        median_daily_yield_usd=median_value,
        total_yield_usd=total,
        statistics=statistics,
        outlier_strategy=outlier_strategy,
        outliers_detected=all_outliers,
        protocol_breakdown=breakdown,
    )

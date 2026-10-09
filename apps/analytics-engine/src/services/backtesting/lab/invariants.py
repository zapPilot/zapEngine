"""What a strategy must not do, checked against the days it traded.

Each invariant counts the days that break it and shows a few examples. Most are
findings about a strategy rather than bugs: the reference holds assets below
their average on purpose in places, and the report says where. Only
``weights_valid`` is *hard*: a broken allocation means the engine, not the
strategy, is wrong.
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass, field
from itertools import groupby
from typing import Any

from src.services.backtesting.lab.days import RISK_ASSETS, DayView

# A weight at or above this counts as holding the asset.
HELD_WEIGHT = 0.01
# A portfolio at or above this share in stable counts as fully in cash.
STUCK_STABLE_WEIGHT = 0.99
STUCK_MIN_DAYS = 30
MAX_EXAMPLES = 5
_WEIGHT_SLACK = 1e-9
_SUM_SLACK = 1e-6


@dataclass(frozen=True)
class InvariantResult:
    name: str
    hard: bool
    count: int
    examples: tuple[dict[str, Any], ...] = ()
    detail: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "hard": self.hard,
            "count": self.count,
            "examples": list(self.examples),
            **self.detail,
        }


def check_invariants(
    days: Sequence[DayView],
    *,
    fill_lag_days: int,
    cross_down_rule_ids: Collection[str],
) -> list[InvariantResult]:
    """Run every invariant over one strategy's days."""
    return [
        _held_below_dma(days, fill_lag_days),
        _buys_below_dma(days),
        _proceeds_into_downtrend(days),
        _cooldown_blocked_exits(days, set(cross_down_rule_ids)),
        _stuck_in_stable(days),
        _weights_valid(days),
    ]


def _held_below_dma(days: Sequence[DayView], fill_lag_days: int) -> InvariantResult:
    """Holding an asset that has been below its average longer than a fill takes."""
    streak = dict.fromkeys(RISK_ASSETS, 0)
    by_asset = dict.fromkeys(RISK_ASSETS, 0)
    examples: list[dict[str, Any]] = []
    count = 0
    for day in days:
        for asset in RISK_ASSETS:
            streak[asset] = streak[asset] + 1 if day.zones.get(asset) == "below" else 0
        held = [
            asset
            for asset in RISK_ASSETS
            if streak[asset] > fill_lag_days
            and day.weights.get(asset, 0.0) >= HELD_WEIGHT
        ]
        if not held:
            continue
        count += 1
        for asset in held:
            by_asset[asset] += 1
        _example(examples, {"date": day.date.isoformat(), "assets": held})
    return InvariantResult(
        "held_below_dma_days",
        hard=False,
        count=count,
        examples=tuple(examples),
        detail={"by_asset": by_asset, "fill_lag_days": fill_lag_days},
    )


def _buys_into_downtrend(day: DayView) -> list[tuple[str, str]]:
    return [
        (source, target)
        for source, target, _ in day.transfers
        if target in RISK_ASSETS and day.zones.get(target) == "below"
    ]


def _buys_below_dma(days: Sequence[DayView]) -> InvariantResult:
    examples: list[dict[str, Any]] = []
    count = 0
    for day in days:
        buys = _buys_into_downtrend(day)
        if not buys:
            continue
        count += 1
        _example(
            examples,
            {
                "date": day.date.isoformat(),
                "into": sorted({target for _, target in buys}),
            },
        )
    return InvariantResult(
        "buys_below_dma", hard=False, count=count, examples=tuple(examples)
    )


def _proceeds_into_downtrend(days: Sequence[DayView]) -> InvariantResult:
    """A sale of one risk asset funding a buy of another that is below its average."""
    examples: list[dict[str, Any]] = []
    count = 0
    for day in days:
        funded = [
            (source, target)
            for source, target in _buys_into_downtrend(day)
            if source in RISK_ASSETS
        ]
        if not funded:
            continue
        count += 1
        _example(
            examples,
            {
                "date": day.date.isoformat(),
                "moves": [f"{source}->{target}" for source, target in funded],
            },
        )
    return InvariantResult(
        "proceeds_into_downtrend", hard=False, count=count, examples=tuple(examples)
    )


def _cooldown_blocked_exits(
    days: Sequence[DayView],
    cross_down_rule_ids: set[str],
) -> InvariantResult:
    """A cross-down exit that matched but was held back by its cooldown."""
    examples: list[dict[str, Any]] = []
    count = 0
    for day in days:
        skipped = day.details.get("cooldown_skipped_rules") or []
        blocked = sorted(
            {
                entry["rule"]
                for entry in skipped
                if isinstance(entry, dict) and entry.get("rule") in cross_down_rule_ids
            }
        )
        if not blocked:
            continue
        count += 1
        _example(examples, {"date": day.date.isoformat(), "rules": blocked})
    return InvariantResult(
        "cooldown_blocked_exits", hard=False, count=count, examples=tuple(examples)
    )


def _stuck_in_stable(days: Sequence[DayView]) -> InvariantResult:
    """Long stretches fully in cash while some asset is above its average."""

    def idle(day: DayView) -> bool:
        return day.weights.get("stable", 0.0) >= STUCK_STABLE_WEIGHT and any(
            day.zones.get(asset) == "above" for asset in RISK_ASSETS
        )

    runs: list[list[DayView]] = [
        list(group) for is_idle, group in groupby(days, key=idle) if is_idle
    ]
    long_runs = [run for run in runs if len(run) >= STUCK_MIN_DAYS]
    examples = [
        {
            "start": run[0].date.isoformat(),
            "end": run[-1].date.isoformat(),
            "days": len(run),
        }
        for run in long_runs[:MAX_EXAMPLES]
    ]
    return InvariantResult(
        "stuck_in_stable",
        hard=False,
        count=sum(len(run) for run in long_runs),
        examples=tuple(examples),
        detail={
            "longest_run": max((len(run) for run in runs), default=0),
            "min_days": STUCK_MIN_DAYS,
        },
    )


def _weights_valid(days: Sequence[DayView]) -> InvariantResult:
    examples: list[dict[str, Any]] = []
    count = 0
    for day in days:
        weights = list(day.weights.values())
        broken = (
            any(
                weight < -_WEIGHT_SLACK or weight > 1 + _WEIGHT_SLACK
                for weight in weights
            )
            or abs(sum(weights) - 1.0) > _SUM_SLACK
        )
        if not broken:
            continue
        count += 1
        _example(
            examples,
            {"date": day.date.isoformat(), "sum": round(sum(weights), 9)},
        )
    return InvariantResult(
        "weights_valid", hard=True, count=count, examples=tuple(examples)
    )


def _example(examples: list[dict[str, Any]], example: dict[str, Any]) -> None:
    if len(examples) < MAX_EXAMPLES:
        examples.append(example)


__all__ = [
    "HELD_WEIGHT",
    "InvariantResult",
    "MAX_EXAMPLES",
    "STUCK_MIN_DAYS",
    "STUCK_STABLE_WEIGHT",
    "check_invariants",
]

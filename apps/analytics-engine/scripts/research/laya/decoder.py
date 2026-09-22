"""Offline-only decoder for historical synthetic backtests; never used for live execution."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from scripts.research.laya.questions import (
    BUCKETS,
    POSTURE_TEMPLATES,
    SCORE_LEVEL_WEIGHTS,
    EncodingId,
)
from src.services.backtesting.target_allocation import normalize_target_allocation

ScoreDecoding = Literal["expected", "argmax"]
_GRID_UNITS = 20


def _score_weight(score: float) -> float:
    x = max(0.0, min(float(score), float(len(SCORE_LEVEL_WEIGHTS) - 1)))
    lo = int(math.floor(x))
    hi = min(lo + 1, len(SCORE_LEVEL_WEIGHTS) - 1)
    if lo == hi:
        return SCORE_LEVEL_WEIGHTS[lo]
    return SCORE_LEVEL_WEIGHTS[lo] + (x - lo) * (
        SCORE_LEVEL_WEIGHTS[hi] - SCORE_LEVEL_WEIGHTS[lo]
    )


def _score(answer: dict[str, Any], mode: ScoreDecoding) -> float:
    probs = answer.get("probabilities")
    if mode == "argmax" and isinstance(probs, dict) and probs:
        return float(max(probs, key=lambda key: float(probs[key])))
    return float(answer.get("score", 0.0))


def raw_weights_from_answers(
    encoding: EncodingId,
    answers: dict[str, Any],
    *,
    score_decoding: ScoreDecoding = "expected",
) -> dict[str, float]:
    if encoding == "static_equal_weight":
        values = dict.fromkeys(BUCKETS, 0.25)
    elif encoding == "per_bucket_score":
        values = {
            bucket: _score_weight(_score(answer, score_decoding))
            if isinstance((answer := answers.get(bucket)), dict)
            else 0.0
            for bucket in BUCKETS
        }
    elif encoding == "posture_mixture":
        values = dict.fromkeys(BUCKETS, 0.0)
        answer = answers.get("posture")
        if isinstance(answer, dict):
            probs = answer.get("probabilities")
            if isinstance(probs, dict) and probs:
                for posture, probability in probs.items():
                    template = POSTURE_TEMPLATES.get(str(posture))
                    if template is not None:
                        for bucket in BUCKETS:
                            values[bucket] += (
                                max(0.0, float(probability)) * template[bucket]
                            )
            else:
                template = POSTURE_TEMPLATES.get(str(answer.get("choice")))
                if template is not None:
                    values = dict(template)
    else:
        raise ValueError(f"Unsupported Laya encoding '{encoding}'")
    if sum(max(0.0, value) for value in values.values()) <= 0.0:
        return {"stable": 1.0, "spy": 0.0, "btc": 0.0, "eth": 0.0}
    return values


@dataclass(frozen=True)
class SnappedAllocation:
    units: dict[str, int]

    def __post_init__(self) -> None:
        if (
            tuple(self.units) != BUCKETS
            or any(unit < 0 for unit in self.units.values())
            or sum(self.units.values()) != _GRID_UNITS
        ):
            raise ValueError("Invalid 5pp grid allocation")

    def as_target(self) -> dict[str, float]:
        return normalize_target_allocation(
            {
                "btc": self.units["btc"] / _GRID_UNITS,
                "eth": self.units["eth"] / _GRID_UNITS,
                "spy": self.units["spy"] / _GRID_UNITS,
                "stable": self.units["stable"] / _GRID_UNITS,
                "alt": 0.0,
            }
        )


def snap_to_grid(weights: dict[str, float]) -> SnappedAllocation:
    positive = {bucket: max(0.0, float(weights.get(bucket, 0.0))) for bucket in BUCKETS}
    total = sum(positive.values())
    if total <= 0.0:
        positive = {"stable": 1.0, "spy": 0.0, "btc": 0.0, "eth": 0.0}
        total = 1.0
    exact = {bucket: positive[bucket] / total * _GRID_UNITS for bucket in BUCKETS}
    units = {bucket: int(math.floor(exact[bucket])) for bucket in BUCKETS}
    remaining = _GRID_UNITS - sum(units.values())
    ranked = sorted(
        BUCKETS,
        key=lambda bucket: (-(exact[bucket] - units[bucket]), BUCKETS.index(bucket)),
    )
    for bucket in ranked[:remaining]:
        units[bucket] += 1
    return SnappedAllocation(units=units)


def static_equal_weight() -> SnappedAllocation:
    return SnappedAllocation(units=dict.fromkeys(BUCKETS, 5))


__all__ = [
    "ScoreDecoding",
    "SnappedAllocation",
    "raw_weights_from_answers",
    "snap_to_grid",
    "static_equal_weight",
]

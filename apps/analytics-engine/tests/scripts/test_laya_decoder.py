from __future__ import annotations

import pytest

from scripts.research.laya.decoder import (
    SnappedAllocation,
    raw_weights_from_answers,
    snap_to_grid,
    static_equal_weight,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


def _score(score: float) -> dict[str, object]:
    return {"type": "score", "score": score, "confidence": 0.9}


def test_score_decoding_handles_endpoints_and_interpolation() -> None:
    answers = {
        "stable": _score(0.0),
        "spy": _score(1.5),
        "btc": _score(2.0),
        "eth": _score(4.0),
    }
    weights = raw_weights_from_answers("per_bucket_score", answers)
    assert weights == pytest.approx(
        {"stable": 0.0, "spy": 0.175, "btc": 0.25, "eth": 0.75}
    )


def test_all_zero_scores_fall_back_to_stable() -> None:
    answers = {bucket: _score(0.0) for bucket in ("stable", "spy", "btc", "eth")}
    assert raw_weights_from_answers("per_bucket_score", answers) == {
        "stable": 1.0,
        "spy": 0.0,
        "btc": 0.0,
        "eth": 0.0,
    }


def test_posture_probabilities_are_mixed_before_grid_snap() -> None:
    weights = raw_weights_from_answers(
        "posture_mixture",
        {
            "posture": {
                "type": "choice",
                "choice": "balanced",
                "probabilities": {"balanced": 0.5, "risk_on": 0.5},
                "confidence": 0.7,
            }
        },
    )
    assert weights == pytest.approx(
        {"stable": 0.15, "spy": 0.225, "btc": 0.35, "eth": 0.275}
    )


def test_grid_snap_is_deterministic_and_uses_bucket_order_for_ties() -> None:
    snapped = snap_to_grid({"stable": 1.0, "spy": 1.0, "btc": 1.0, "eth": 0.7})
    assert sum(snapped.units.values()) == 20
    assert tuple(snapped.units) == ("stable", "spy", "btc", "eth")
    # Equal largest remainders are awarded in canonical bucket order.
    tied = snap_to_grid({"stable": 1.0, "spy": 1.0, "btc": 1.0, "eth": 1.0})
    assert tied == static_equal_weight()


def test_snapped_target_is_normalized_and_equality_is_integer_based() -> None:
    allocation = SnappedAllocation(units={"stable": 5, "spy": 5, "btc": 5, "eth": 5})
    target = allocation.as_target()
    assert target == normalize_target_allocation(target)
    assert sum(target.values()) == pytest.approx(1.0)
    assert allocation == static_equal_weight()

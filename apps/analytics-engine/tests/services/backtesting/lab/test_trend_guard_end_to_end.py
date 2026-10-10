"""The trend guard, end to end: the invariants it exists for hold when it runs.

The reference only sells an asset on the day its price crosses under the DMA, so
a position that got there another way (a rotation, a purchase on a day the DMA
was missing) is kept for as long as the price stays under. The guard looks at the
level every day instead, and the lab's invariants say whether it works.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.evaluate import EvalConfig, evaluate
from src.services.backtesting.spec import StrategySpec, parse_spec
from tests.services.backtesting.spec.helpers import reference_raw

# A stress history: assets spend long stretches under their DMA.
BUNDLE = synthetic_bundle("synthetic:stress?seed=2&days=400")
GIT = {"sha": "abc", "dirty": False}


def _with_guard(mode: str) -> StrategySpec:
    raw = reference_raw()
    raw["overlays"] = [
        {
            "kind": "trend_guard",
            "id": "trend_guard",
            "mode": mode,
            "below_dma_buffer": 0.0,
            "confirm_days": 1,
        }
    ]
    return parse_spec(raw)


def _invariants(spec: StrategySpec) -> dict[str, int]:
    report = evaluate(
        spec, BUNDLE, EvalConfig(leave_one_out=False, benchmarks=()), git=GIT
    )
    return {item["name"]: item["count"] for item in report.body["invariants"]}


@pytest.fixture(scope="module")
def reference() -> dict[str, int]:
    return _invariants(parse_spec(reference_raw()))


def test_the_reference_holds_and_buys_below_the_trend(
    reference: dict[str, Any],
) -> None:
    assert reference["held_below_dma_days"] > 100
    assert reference["buys_below_dma"] > 0
    assert reference["proceeds_into_downtrend"] > 0


def test_force_exit_leaves_nothing_held_or_bought_below_the_trend() -> None:
    guarded = _invariants(_with_guard("force_exit"))

    assert guarded["held_below_dma_days"] == 0
    assert guarded["buys_below_dma"] == 0
    assert guarded["proceeds_into_downtrend"] == 0
    assert guarded["weights_valid"] == 0


def test_force_exit_costs_days_in_cash(reference: dict[str, int]) -> None:
    assert (
        _invariants(_with_guard("force_exit"))["stuck_in_stable"]
        > reference["stuck_in_stable"]
    )


def test_block_adds_stops_the_purchases_but_keeps_what_is_held() -> None:
    blocked = _invariants(_with_guard("block_adds"))

    assert blocked["buys_below_dma"] == 0
    assert blocked["proceeds_into_downtrend"] == 0
    assert blocked["held_below_dma_days"] > 0

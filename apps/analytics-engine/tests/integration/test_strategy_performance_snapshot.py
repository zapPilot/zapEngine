from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from scripts.attribution.sweep_production_window import (
    METRIC_KEYS,
    _default_strategy_universe,
)
from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH,
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
)
from src.services.backtesting.strategies.hierarchical_outer_policy import (
    MinimumHierarchicalOuterPolicy,
)

SNAPSHOT_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures/strategy_performance_snapshot_500d.json"
)
pytestmark = pytest.mark.no_integration_db


def load_snapshot() -> dict[str, Any]:
    payload = json.loads(SNAPSHOT_PATH.read_text())
    assert isinstance(payload, dict)
    assert isinstance(payload.get("strategies"), dict)
    return payload


def _strategy_metrics(snapshot: dict[str, Any], strategy_id: str) -> dict[str, Any]:
    strategies = snapshot["strategies"]
    assert isinstance(strategies, dict)
    raw_metrics = strategies[strategy_id]
    assert isinstance(raw_metrics, dict)
    return raw_metrics


def test_hierarchical_minimum_outperforms_current_production() -> None:
    """The minimum stack should materially beat current production."""
    snapshot = load_snapshot()
    minimum = _strategy_metrics(snapshot, STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM)[
        "roi_percent"
    ]
    hierarchical = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
    )["roi_percent"]
    minimum_advantage_floor = 75.0

    assert minimum >= hierarchical + minimum_advantage_floor, (
        f"minimum ROI ({minimum:.2f}%) no longer clears current production "
        f"({hierarchical:.2f}%) by {minimum_advantage_floor}pp. This indicates "
        "the two-feature minimum lost its expected SPY-bearing advantage."
    )


def test_full_minus_adaptive_dma_remains_load_bearing_reference() -> None:
    """The no-adaptive-DMA ablation should keep proving Adaptive DMA is harmful."""
    snapshot = load_snapshot()
    prod_roi = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
    )["roi_percent"]
    no_adaptive_roi = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
    )["roi_percent"]
    advantage_floor = 60.0

    assert no_adaptive_roi >= prod_roi + advantage_floor, (
        f"full-minus-adaptive-DMA ROI ({no_adaptive_roi:.2f}%) no longer clears "
        f"current production ({prod_roi:.2f}%) by {advantage_floor}pp. This weakens "
        "the attribution case against Adaptive DMA."
    )


def test_hierarchical_minimum_does_not_regress_against_nodma_full_minus_spy_latch() -> (
    None
):
    """The minimum stack should preserve NoDMA/full-minus-SPY-latch performance."""
    snapshot = load_snapshot()
    minimum = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
    )
    nodma_without_spy_latch = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH,
    )

    assert minimum["roi_percent"] >= nodma_without_spy_latch["roi_percent"] + 3.0
    assert minimum["calmar_ratio"] >= 4.0


def test_minimum_policy_feature_summary() -> None:
    assert MinimumHierarchicalOuterPolicy().feature_summary()["active_features"] == [
        "dma_stable_gating",
        "greed_sell_suppression",
    ]


def test_every_registered_strategy_has_snapshot_entry() -> None:
    """Snapshot must cover the entire production measurement strategy universe."""
    snapshot = load_snapshot()
    strategies = snapshot["strategies"]
    assert isinstance(strategies, dict)
    expected = set(_default_strategy_universe())
    actual = set(strategies)

    assert actual == expected, (
        "Strategy performance snapshot coverage drifted. "
        f"Missing: {sorted(expected - actual)}; unexpected: {sorted(actual - expected)}"
    )
    for strategy_id in sorted(expected):
        metrics = _strategy_metrics(snapshot, strategy_id)
        missing_metrics = [metric for metric in METRIC_KEYS if metric not in metrics]
        assert not missing_metrics, (
            f"Snapshot entry {strategy_id} is missing metrics: {missing_metrics}"
        )

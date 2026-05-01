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
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
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


def test_spy_does_not_dilute_total_return() -> None:
    """Hierarchical production ROI must not materially lose to crypto-only."""
    snapshot = load_snapshot()
    crypto_only = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
    )["roi_percent"]
    hierarchical = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
    )["roi_percent"]
    tolerance = 5.0

    assert hierarchical >= crypto_only - tolerance, (
        f"SPY-bearing hierarchical_prod ROI ({hierarchical:.2f}%) falls more than "
        f"{tolerance}pp below crypto-only adaptive_binary ({crypto_only:.2f}%). "
        "This indicates SPY allocation is diluting returns rather than diversifying; "
        "next iteration should diagnose why the outer SPY/crypto pair-template fails "
        "to lean to crypto when SPY is weak."
    )


def test_production_not_worse_than_ablations() -> None:
    """The full feature stack should not underperform single-feature removals."""
    snapshot = load_snapshot()
    strategies = snapshot["strategies"]
    assert isinstance(strategies, dict)
    prod_roi = _strategy_metrics(
        snapshot,
        STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
    )["roi_percent"]
    ablation_keys = [
        key for key in strategies if "_minus_" in key and "hierarchical" in key
    ]
    assert ablation_keys, "Snapshot does not include hierarchical ablation variants"
    best_ablation_key = max(
        ablation_keys,
        key=lambda key: _strategy_metrics(snapshot, key)["roi_percent"],
    )
    best_ablation = _strategy_metrics(snapshot, best_ablation_key)["roi_percent"]
    tolerance = 5.0

    assert prod_roi >= best_ablation - tolerance, (
        f"hierarchical_prod ROI ({prod_roi:.2f}%) underperforms its best ablation "
        f"{best_ablation_key} ({best_ablation:.2f}%). This is a feature-interaction "
        "bug: the full feature stack regresses against single-feature removal."
    )


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

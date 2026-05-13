from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.landing.equity_curve import generate


def _timeline() -> list[dict]:
    return [
        {
            "market": {"date": "2026-01-01"},
            "strategies": {
                "dma_fgi_portfolio_rules": {"portfolio": {"total_value": 10_000.0}},
                "dca_classic": {"portfolio": {"total_value": 10_000.0}},
            },
        },
        {
            "market": {"date": "2026-01-02"},
            "strategies": {
                "dma_fgi_portfolio_rules": {"portfolio": {"total_value": 12_500.0}},
                "dca_classic": {"portfolio": {"total_value": 9_500.0}},
            },
        },
        {
            "market": {"date": "2026-01-03"},
            "strategies": {
                "dma_fgi_portfolio_rules": {"portfolio": {"total_value": 15_000.0}},
                "dca_classic": {"portfolio": {"total_value": 9_000.0}},
            },
        },
    ]


def _snapshot_meta() -> dict:
    return {
        "window_start": "2026-01-01",
        "window_end": "2026-01-03",
        "window_days": 3,
        "default_strategy_id": "dma_fgi_portfolio_rules",
        "strategies": {
            "dma_fgi_portfolio_rules": {
                "roi_percent": 50.0,
                "max_drawdown_percent": -5.25,
            },
            "dca_classic": {
                "roi_percent": -10.0,
                "max_drawdown_percent": -20.5,
            },
        },
    }


def test_generate_writes_indexed_equity_curve_shape(tmp_path: Path) -> None:
    output_path = tmp_path / "equity-curve.json"

    generate(
        timeline=_timeline(),
        snapshot_meta=_snapshot_meta(),
        output_path=output_path,
    )

    payload = json.loads(output_path.read_text())

    assert payload["window"] == {
        "start": "2026-01-01",
        "end": "2026-01-03",
        "days": 3,
    }
    assert payload["drawdownBand"] == {
        "label": "Max drawdown range",
        "strategyPercent": -5.25,
        "dcaPercent": -20.5,
    }
    assert payload["source"].startswith(
        "Generated from sweep_production_window.py --update-snapshot"
    )
    assert payload["series"][0]["id"] == "strategy"
    assert payload["series"][0]["values"] == [
        {"date": "2026-01-01", "value": 100.0},
        {"date": "2026-01-02", "value": 125.0},
        {"date": "2026-01-03", "value": 150.0},
    ]
    assert payload["series"][1]["id"] == "dca"
    assert payload["series"][1]["values"] == [
        {"date": "2026-01-01", "value": 100.0},
        {"date": "2026-01-02", "value": 95.0},
        {"date": "2026-01-03", "value": 90.0},
    ]


def test_generate_rejects_strategy_roi_drift(tmp_path: Path) -> None:
    snapshot_meta = _snapshot_meta()
    snapshot_meta["strategies"]["dma_fgi_portfolio_rules"]["roi_percent"] = 30.0

    with pytest.raises(ValueError, match="strategy final indexed ROI"):
        generate(
            timeline=_timeline(),
            snapshot_meta=snapshot_meta,
            output_path=tmp_path / "equity-curve.json",
        )

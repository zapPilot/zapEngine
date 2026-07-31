from __future__ import annotations

import json
from pathlib import Path

import pytest

import scripts.landing.equity_curve as equity_curve
from scripts.landing.equity_curve import generate


def _strategy_day(
    total_value: float,
    transfers: list[dict] | None = None,
    asset_allocation: dict[str, float] | None = None,
) -> dict:
    return {
        "portfolio": {
            "total_value": total_value,
            "spot_asset": "BTC",
            "asset_allocation": asset_allocation
            or {
                "btc": 0.5,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 0.5,
                "alt": 0.0,
            },
        },
        "decision": {"reason": "dma_cross_up", "details": {}},
        "execution": {"transfers": transfers or []},
    }


def _timeline() -> list[dict]:
    return [
        {
            "market": {"date": "2026-01-01"},
            "strategies": {
                "dma_fgi_portfolio_rules": _strategy_day(10_000.0),
                "dca_classic": _strategy_day(10_000.0),
            },
        },
        {
            "market": {"date": "2026-01-02"},
            "strategies": {
                "dma_fgi_portfolio_rules": _strategy_day(
                    12_500.0,
                    [{"from_bucket": "btc", "to_bucket": "eth", "amount_usd": 4_000.0}],
                ),
                "dca_classic": _strategy_day(9_500.0),
            },
        },
        {
            "market": {"date": "2026-01-03"},
            "strategies": {
                "dma_fgi_portfolio_rules": _strategy_day(15_000.0),
                "dca_classic": _strategy_day(9_000.0),
            },
        },
    ]


def _snapshot_meta() -> dict:
    return {
        "reference_date": "2026-01-03",
        "window_start": "2026-01-01",
        "window_end": "2026-01-03",
        "window_days": 3,
        "default_strategy_id": "dma_fgi_portfolio_rules",
        "strategies": {
            "dma_fgi_portfolio_rules": {
                "roi_percent": 50.0,
                "max_drawdown_percent": -5.25,
                "trade_count": 1,
            },
            "dca_classic": {
                "roi_percent": -10.0,
                "max_drawdown_percent": -20.5,
                "trade_count": 3,
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
        "Generated from sweep_production_window.py for the window ending 2026-01-03"
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


def test_source_line_is_reproducible_across_runs(tmp_path: Path) -> None:
    """No wall-clock stamp, so a regeneration can be diffed against the commit."""
    first = tmp_path / "a.json"
    second = tmp_path / "b.json"

    for path in (first, second):
        generate(timeline=_timeline(), snapshot_meta=_snapshot_meta(), output_path=path)

    assert first.read_text() == second.read_text()


def test_generate_emits_events_anchored_to_the_strategy_series(tmp_path: Path) -> None:
    output_path = tmp_path / "equity-curve.json"

    generate(
        timeline=_timeline(),
        snapshot_meta=_snapshot_meta(),
        output_path=output_path,
    )

    payload = json.loads(output_path.read_text())
    series_by_date = {
        point["date"]: point["value"] for point in payload["series"][0]["values"]
    }

    assert payload["events"] == [
        {
            "date": "2026-01-02",
            "type": "rotate_to_eth",
            "toAsset": "ETH",
            "fromAssets": ["BTC"],
            "amountUsd": 4_000.0,
            "amountPercent": 32.0,
            "stableDeltaUsd": 0.0,
            "indexedValue": 125.0,
            "reason": "dma_cross_up",
        }
    ]
    # The defect this artifact exists to prevent: a marker off the curve.
    for event in payload["events"]:
        assert event["indexedValue"] == series_by_date[event["date"]]

    assert payload["eventsMeta"]["strategyId"] == "dma_fgi_portfolio_rules"
    assert payload["eventsMeta"]["count"] == 1
    assert payload["eventsMeta"]["tradeCount"] == 1
    assert payload["eventsMeta"]["unclassifiedCount"] == 0
    assert payload["eventsMeta"]["initialAllocation"]["stable"] == 0.5


def test_generate_emits_one_allocation_row_per_series_point(tmp_path: Path) -> None:
    output_path = tmp_path / "equity-curve.json"
    timeline = _timeline()
    timeline[1]["strategies"]["dma_fgi_portfolio_rules"] = _strategy_day(
        12_500.0,
        [{"from_bucket": "btc", "to_bucket": "eth", "amount_usd": 4_000.0}],
        asset_allocation={
            "btc": 0.18,
            "eth": 0.32,
            "spy": 0.0,
            "stable": 0.5,
            "alt": 0.0,
        },
    )

    generate(
        timeline=timeline,
        snapshot_meta=_snapshot_meta(),
        output_path=output_path,
    )

    payload = json.loads(output_path.read_text())

    assert payload["allocations"] == {
        "assets": ["btc", "eth", "spy", "stable"],
        "values": [
            [0.5, 0.0, 0.0, 0.5],
            [0.18, 0.32, 0.0, 0.5],
            [0.5, 0.0, 0.0, 0.5],
        ],
    }
    # Index alignment is the whole contract of the date-less columnar shape.
    assert len(payload["allocations"]["values"]) == len(payload["series"][0]["values"])


def test_generate_rejects_initial_allocation_drift(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = equity_curve._extract_allocations

    def drifted_allocations(
        timeline: list[dict],
        strategy_id: str,
    ) -> list[list[float]]:
        values = original(timeline, strategy_id)
        values[0][0] = 0.4
        return values

    monkeypatch.setattr(equity_curve, "_extract_allocations", drifted_allocations)

    with pytest.raises(
        ValueError,
        match=r"allocations.values\[0\] and eventsMeta.initialAllocation disagree",
    ):
        generate(
            timeline=_timeline(),
            snapshot_meta=_snapshot_meta(),
            output_path=tmp_path / "equity-curve.json",
        )


def test_generate_rejects_a_nonzero_alt_bucket(tmp_path: Path) -> None:
    """A bucket the chart cannot draw must fail loudly, not fold into stable."""
    timeline = _timeline()
    timeline[2]["strategies"]["dma_fgi_portfolio_rules"] = _strategy_day(
        15_000.0,
        asset_allocation={
            "btc": 0.4,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.5,
            "alt": 0.1,
        },
    )

    with pytest.raises(ValueError, match="alt bucket"):
        generate(
            timeline=timeline,
            snapshot_meta=_snapshot_meta(),
            output_path=tmp_path / "equity-curve.json",
        )


def test_generate_rejects_event_count_that_misses_recorded_trades(
    tmp_path: Path,
) -> None:
    snapshot_meta = _snapshot_meta()
    snapshot_meta["strategies"]["dma_fgi_portfolio_rules"]["trade_count"] = 9

    with pytest.raises(ValueError, match="Event reconciliation failed"):
        generate(
            timeline=_timeline(),
            snapshot_meta=snapshot_meta,
            output_path=tmp_path / "equity-curve.json",
        )


def test_generate_rejects_strategy_roi_drift(tmp_path: Path) -> None:
    snapshot_meta = _snapshot_meta()
    snapshot_meta["strategies"]["dma_fgi_portfolio_rules"]["roi_percent"] = 30.0

    with pytest.raises(ValueError, match="strategy final indexed ROI"):
        generate(
            timeline=_timeline(),
            snapshot_meta=snapshot_meta,
            output_path=tmp_path / "equity-curve.json",
        )

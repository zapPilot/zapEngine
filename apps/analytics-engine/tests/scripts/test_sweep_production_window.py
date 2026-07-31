from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from pytest import MonkeyPatch

from scripts.attribution import sweep_production_window
from scripts.attribution.sweep_production_window import (
    METRIC_KEYS,
    SnapshotCollection,
    collect_snapshot,
)

COMMITTED_FIXTURE = {"default_strategy_id": "strategy-a", "marker": "committed"}
FRESH_SNAPSHOT = {"default_strategy_id": "strategy-a", "marker": "fresh"}


class FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeCompareClient:
    def __init__(self) -> None:
        self.posted_urls: list[str] = []
        self.requests: list[dict[str, Any]] = []

    def post(
        self,
        url: str,
        *,
        json: dict[str, Any],
        timeout: float,
    ) -> FakeResponse:
        self.posted_urls.append(url)
        self.requests.append(json)
        strategies = {
            config["strategy_id"]: {
                "calmar_ratio": 1.1,
                "sharpe_ratio": 0.9,
                "max_drawdown_percent": -12.5,
                "roi_percent": 24.75,
                "trade_count": 8,
                "sortino_ratio": 1.2,
                "volatility": 0.18,
                "ulcer_index": 4.5,
            }
            for config in json["configs"]
        }
        return FakeResponse({"strategies": strategies})


def test_collect_snapshot_can_use_in_process_client_without_endpoint(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        sweep_production_window,
        "_default_strategy_universe",
        lambda *, exclude_deprecated=False: ["strategy-a"],
    )
    monkeypatch.setattr(
        sweep_production_window,
        "get_default_seed_strategy_config",
        lambda: SimpleNamespace(strategy_id="strategy-a"),
    )
    client = FakeCompareClient()

    snapshot = collect_snapshot(
        endpoint=None,
        client=client,
        reference_date=date(2026, 4, 15),
        window_days=2,
        total_capital=1_000.0,
        tolerances=dict.fromkeys(METRIC_KEYS, 1.0),
        show_progress=False,
    )

    assert client.posted_urls == [sweep_production_window.COMPARE_PATH]
    assert client.requests[0]["start_date"] == "2026-04-14"
    assert client.requests[0]["end_date"] == "2026-04-15"
    assert snapshot["default_strategy_id"] == "strategy-a"
    assert snapshot["strategies"]["strategy-a"]["roi_percent"] == 24.75


def _stub_main_dependencies(monkeypatch: MonkeyPatch) -> list[dict[str, Any]]:
    """Wire main() to fakes and make any snapshot write an outright failure."""
    regenerated: list[dict[str, Any]] = []

    monkeypatch.setattr(
        sweep_production_window,
        "_expected_context",
        lambda **_: (
            date(2026, 4, 15),
            500,
            10_000.0,
            dict.fromkeys(METRIC_KEYS, 1.0),
            COMMITTED_FIXTURE,
        ),
    )
    monkeypatch.setattr(
        sweep_production_window,
        "_collect_snapshot_result",
        lambda **_: SnapshotCollection(
            snapshot=FRESH_SNAPSHOT,
            compare_payload={"timeline": [{"market": {"date": "2026-04-15"}}]},
        ),
    )
    monkeypatch.setattr(
        sweep_production_window,
        "_regenerate_landing_equity_curve",
        lambda *, compare_payload, snapshot: regenerated.append(snapshot) or 500,
    )
    monkeypatch.setattr(
        sweep_production_window,
        "_write_snapshot",
        lambda *_, **__: pytest.fail(
            "--write-landing-curve must never touch the snapshot fixture"
        ),
    )
    monkeypatch.setattr(sweep_production_window, "diff_snapshots", lambda **_: [])
    monkeypatch.setattr(sweep_production_window, "render_drift_table", lambda _: "")
    return regenerated


def test_write_landing_curve_leaves_the_snapshot_fixture_alone(
    monkeypatch: MonkeyPatch,
) -> None:
    regenerated = _stub_main_dependencies(monkeypatch)
    monkeypatch.setattr(
        "sys.argv",
        [
            "sweep_production_window.py",
            "--endpoint",
            "http://localhost:8001",
            "--write-landing-curve",
            "--no-progress",
        ],
    )

    sweep_production_window.main()

    # The committed fixture is what validates the fresh curve, so a drifted
    # database fails the 1pp ROI check instead of rewriting headline numbers.
    assert regenerated == [COMMITTED_FIXTURE]


def test_write_landing_curve_conflicts_with_update_snapshot(
    monkeypatch: MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "sys.argv",
        [
            "sweep_production_window.py",
            "--write-landing-curve",
            "--update-snapshot",
        ],
    )

    with pytest.raises(SystemExit) as excinfo:
        sweep_production_window.main()

    assert excinfo.value.code == 2

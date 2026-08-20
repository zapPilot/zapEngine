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


def _snapshot_with_roi(roi_percent: float, marker: str) -> dict[str, Any]:
    return {
        "default_strategy_id": "strategy-a",
        "marker": marker,
        "strategies": {"strategy-a": {"roi_percent": roi_percent}},
    }


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


def _stub_main_dependencies(
    monkeypatch: MonkeyPatch,
    *,
    expected: dict[str, Any] | None = COMMITTED_FIXTURE,
    actual: dict[str, Any] = FRESH_SNAPSHOT,
    written: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Wire main() to fakes and record what it would have published.

    Snapshot writes fail the test outright unless `written` is supplied, which
    is what keeps --write-landing-curve honest about leaving the fixture alone.
    """
    regenerated: list[dict[str, Any]] = []

    monkeypatch.setattr(
        sweep_production_window,
        "_expected_context",
        lambda **_: (
            date(2026, 4, 15),
            500,
            10_000.0,
            dict.fromkeys(METRIC_KEYS, 1.0),
            expected,
        ),
    )
    monkeypatch.setattr(
        sweep_production_window,
        "_collect_snapshot_result",
        lambda **_: SnapshotCollection(
            snapshot=actual,
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
        (lambda _path, snapshot: written.append(snapshot))
        if written is not None
        else lambda *_, **__: pytest.fail(
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


def _run_update_snapshot(
    monkeypatch: MonkeyPatch,
    *,
    expected: dict[str, Any] | None,
    actual: dict[str, Any],
    extra_args: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    written: list[dict[str, Any]] = []
    regenerated = _stub_main_dependencies(
        monkeypatch,
        expected=expected,
        actual=actual,
        written=written,
    )
    monkeypatch.setattr(
        "sys.argv",
        [
            "sweep_production_window.py",
            "--update-snapshot",
            "--no-progress",
            *(extra_args or []),
        ],
    )
    return regenerated, written


def test_update_snapshot_publishes_an_ordinary_roi_move(
    monkeypatch: MonkeyPatch,
) -> None:
    regenerated, written = _run_update_snapshot(
        monkeypatch,
        expected=_snapshot_with_roi(24.0, "committed"),
        actual=_snapshot_with_roi(24.75, "fresh"),
    )

    sweep_production_window.main()

    assert [snapshot["marker"] for snapshot in regenerated] == ["fresh"]
    assert [snapshot["marker"] for snapshot in written] == ["fresh"]


def test_update_snapshot_refuses_a_rewritten_upstream_window(
    monkeypatch: MonkeyPatch,
) -> None:
    regenerated, written = _run_update_snapshot(
        monkeypatch,
        expected=_snapshot_with_roi(10.0, "committed"),
        actual=_snapshot_with_roi(24.75, "fresh"),
    )

    with pytest.raises(SystemExit) as excinfo:
        sweep_production_window.main()

    assert excinfo.value.code == 1
    # The guard runs before the curve is regenerated, so neither artifact moved.
    assert regenerated == []
    assert written == []


def test_update_snapshot_allows_the_first_ever_run(monkeypatch: MonkeyPatch) -> None:
    regenerated, written = _run_update_snapshot(
        monkeypatch,
        expected=None,
        actual=_snapshot_with_roi(24.75, "fresh"),
    )

    sweep_production_window.main()

    assert [snapshot["marker"] for snapshot in regenerated] == ["fresh"]
    assert [snapshot["marker"] for snapshot in written] == ["fresh"]


def test_update_snapshot_allows_a_large_move_when_the_guard_is_raised(
    monkeypatch: MonkeyPatch,
) -> None:
    regenerated, written = _run_update_snapshot(
        monkeypatch,
        expected=_snapshot_with_roi(10.0, "committed"),
        actual=_snapshot_with_roi(24.75, "fresh"),
        extra_args=["--max-roi-shift", "20"],
    )

    sweep_production_window.main()

    assert [snapshot["marker"] for snapshot in regenerated] == ["fresh"]
    assert [snapshot["marker"] for snapshot in written] == ["fresh"]


def test_update_snapshot_skips_the_guard_without_comparable_metrics(
    monkeypatch: MonkeyPatch,
) -> None:
    """The committed fixture predates the metric; the landing generator catches it."""
    regenerated, written = _run_update_snapshot(
        monkeypatch,
        expected=COMMITTED_FIXTURE,
        actual=_snapshot_with_roi(24.75, "fresh"),
    )

    sweep_production_window.main()

    assert [snapshot["marker"] for snapshot in written] == ["fresh"]
    assert regenerated != []

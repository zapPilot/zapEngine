from __future__ import annotations

from datetime import date
from typing import Any

from pytest import MonkeyPatch

from scripts.attribution import sweep_production_window
from scripts.attribution.sweep_production_window import METRIC_KEYS, collect_snapshot


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
    assert snapshot["strategies"]["strategy-a"]["roi_percent"] == 24.75

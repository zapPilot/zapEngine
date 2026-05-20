from __future__ import annotations

from typing import Any

from scripts.attribution import regime_breakdown
from scripts.attribution.regime_breakdown import DailyPoint, compute_breakdowns


class FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeCompareClient:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def post(
        self,
        url: str,
        *,
        json: dict[str, Any],
        timeout: float,
    ) -> FakeResponse:
        self.requests.append(json)
        return FakeResponse(
            {
                "strategies": {"dma_fgi_portfolio_rules": {}},
                "timeline": [],
                "decision_log_path": "/tmp/decisions.jsonl",
            }
        )


def test_fetch_compare_payload_requests_decision_log() -> None:
    client = FakeCompareClient()

    regime_breakdown._fetch_compare_payload(
        client=client,
        endpoint=None,
        strategy_id="dma_fgi_portfolio_rules",
        start_date="2025-12-02",
        end_date="2026-04-15",
        total_capital=10_000.0,
    )

    assert client.requests[0]["emit_decision_log"] is True


def test_extract_timeline_uses_market_sentiment_for_fgi_bucket() -> None:
    payload = {
        "timeline": [
            {
                "market": {
                    "date": "2026-04-14",
                    "sentiment_label": "extreme_greed",
                },
                "strategies": {
                    "dma_fgi_portfolio_rules": {
                        "portfolio": {"total_value": 100.0},
                        "signal": {
                            "regime": "fear",
                            "details": {"dma": {"zone": "above"}},
                        },
                    }
                },
            },
            {
                "market": {
                    "date": "2026-04-15",
                    "sentiment_label": "greed",
                },
                "strategies": {
                    "dma_fgi_portfolio_rules": {
                        "portfolio": {"total_value": 101.0},
                        "signal": {
                            "regime": "neutral",
                            "details": {"dma": {"zone": "below"}},
                        },
                    }
                },
            },
        ]
    }

    points = regime_breakdown._extract_timeline(
        payload,
        "dma_fgi_portfolio_rules",
    )

    assert points[0].fgi_regime == "extreme_greed"


def test_compute_breakdowns_uses_decision_log_trade_indices() -> None:
    points = [
        DailyPoint(
            date="2026-04-13",
            value=100.0,
            fgi_regime="neutral",
            dma_zone="below",
            traded=False,
        ),
        DailyPoint(
            date="2026-04-14",
            value=98.0,
            fgi_regime="greed",
            dma_zone="above",
            traded=False,
        ),
        DailyPoint(
            date="2026-04-15",
            value=103.0,
            fgi_regime="extreme_greed",
            dma_zone="above",
            traded=False,
        ),
    ]

    breakdowns = compute_breakdowns(
        points,
        trade_indices=[1],
        win_horizon_days=1,
    )

    greed = next(row for row in breakdowns["by_fgi_regime"] if row.bucket == "greed")
    above = next(row for row in breakdowns["by_dma_zone"] if row.bucket == "above")
    assert greed.trade_count == 1
    assert greed.win_rate_percent == 100.0
    assert above.trade_count == 1
    assert above.win_rate_percent == 100.0

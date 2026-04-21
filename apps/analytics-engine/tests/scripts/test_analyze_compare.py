"""Tests for the API-first compare analyzer script."""

from __future__ import annotations

import json
from typing import Any

import pytest

import scripts.analyze_compare as analyzer


def _strategy_state(
    *,
    action: str,
    reason: str,
    rule_group: str,
    event: str | None,
    btc_price: float,
    dma_200: float,
    cross_event: str | None,
    allocation: dict[str, float],
    asset_allocation: dict[str, float],
    spot_asset: str | None,
) -> dict[str, Any]:
    distance = (btc_price - dma_200) / dma_200
    return {
        "portfolio": {
            "spot_usd": 10_000.0 * allocation["spot"],
            "stable_usd": 10_000.0 * allocation["stable"],
            "total_value": 10_000.0,
            "allocation": allocation,
            "asset_allocation": asset_allocation,
            "spot_asset": spot_asset,
        },
        "signal": {
            "id": "eth_btc_rs_signal",
            "regime": "fear",
            "raw_value": 30.0,
            "confidence": 1.0,
            "details": {
                "dma": {
                    "dma_200": dma_200,
                    "distance": distance,
                    "zone": "above" if distance > 0 else "below",
                    "cross_event": cross_event,
                },
                "ratio": {
                    "ratio": 0.05,
                    "ratio_dma_200": 0.04,
                    "distance": 0.25,
                    "zone": "above",
                    "cross_event": cross_event,
                    "cooldown_active": False,
                    "cooldown_remaining_days": 0,
                    "cooldown_blocked_zone": None,
                },
            },
        },
        "decision": {
            "action": action,
            "reason": reason,
            "rule_group": rule_group,
            "target_allocation": allocation,
            "target_asset_allocation": asset_allocation,
            "immediate": cross_event is not None,
        },
        "execution": {
            "event": event,
            "transfers": [],
            "blocked_reason": None,
            "step_count": 1,
            "steps_remaining": 0,
            "interval_days": 1,
            "diagnostics": {"plugins": {}},
        },
    }


def _payload() -> dict[str, Any]:
    return {
        "window": {
            "requested": {
                "start_date": "2025-03-23",
                "end_date": "2025-04-23",
                "days": 31,
            },
            "effective": {
                "start_date": "2025-03-23",
                "end_date": "2025-04-23",
                "days": 31,
            },
            "truncated": False,
        },
        "timeline": [
            {
                "market": {
                    "date": "2025-04-21",
                    "token_price": {"btc": 80.0, "eth": 4.0},
                    "sentiment": 25,
                    "sentiment_label": "fear",
                },
                "strategies": {
                    "eth_btc_rotation_default": _strategy_state(
                        action="sell",
                        reason="dma_cross_down",
                        rule_group="cross",
                        event="rebalance",
                        btc_price=80.0,
                        dma_200=100.0,
                        cross_event="cross_down",
                        allocation={"spot": 0.0, "stable": 1.0},
                        asset_allocation={
                            "btc": 0.0,
                            "eth": 0.0,
                            "stable": 1.0,
                            "alt": 0.0,
                        },
                        spot_asset=None,
                    )
                },
            },
            {
                "market": {
                    "date": "2025-04-22",
                    "token_price": {"btc": 100.0, "eth": 5.0},
                    "sentiment": 38,
                    "sentiment_label": "fear",
                },
                "strategies": {
                    "eth_btc_rotation_default": _strategy_state(
                        action="buy",
                        reason="dma_cross_up",
                        rule_group="cross",
                        event="rebalance",
                        btc_price=100.0,
                        dma_200=90.0,
                        cross_event="cross_up",
                        allocation={"spot": 1.0, "stable": 0.0},
                        asset_allocation={
                            "btc": 0.0,
                            "eth": 1.0,
                            "stable": 0.0,
                            "alt": 0.0,
                        },
                        spot_asset="ETH",
                    )
                },
            },
            {
                "market": {
                    "date": "2025-04-23",
                    "token_price": {"btc": 102.0, "eth": 5.2},
                    "sentiment": 45,
                    "sentiment_label": "neutral",
                },
                "strategies": {
                    "eth_btc_rotation_default": _strategy_state(
                        action="hold",
                        reason="above_hold",
                        rule_group="rotation",
                        event=None,
                        btc_price=102.0,
                        dma_200=90.0,
                        cross_event=None,
                        allocation={"spot": 1.0, "stable": 0.0},
                        asset_allocation={
                            "btc": 0.0,
                            "eth": 1.0,
                            "stable": 0.0,
                            "alt": 0.0,
                        },
                        spot_asset="ETH",
                    )
                },
            },
        ],
    }


def test_analyze_payload_builds_api_request_and_filters_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def _fake_fetch(endpoint: str, request_body: dict[str, Any]) -> dict[str, Any]:
        captured["endpoint"] = endpoint
        captured["request"] = request_body
        return _payload()

    monkeypatch.setattr(analyzer, "_fetch_from_api", _fake_fetch)

    rendered = analyzer.analyze_payload(
        endpoint="http://testserver",
        from_date="2025-04-22",
        to_date="2025-04-23",
        output_format="json",
        enrich_db="never",
    )
    data = json.loads(rendered)

    assert captured["endpoint"] == "http://testserver"
    assert captured["request"]["start_date"] == "2025-03-23"
    assert captured["request"]["end_date"] == "2025-04-23"
    assert captured["request"]["configs"] == [
        {
            "config_id": "eth_btc_rotation_default",
            "saved_config_id": "eth_btc_rotation_default",
        }
    ]
    assert [record["date"] for record in data["records"]] == [
        "2025-04-22",
        "2025-04-23",
    ]


def test_analyze_compare_json_contains_lookback_and_rule_classification() -> None:
    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="json",
        enrich_db="never",
        source_label="http://testserver",
        request_body={"configs": []},
    )
    data = json.loads(rendered)

    assert data["lookback_context"]["latest_before_window"]["date"] == "2025-04-21"
    assert (
        data["lookback_context"]["events"][0]["outer_dma_cross_event"] == "cross_down"
    )
    assert data["records"][0]["rule"]["classification"] == "intended_rule"
    assert "full re-entry" in data["records"][0]["rule"]["summary"]


def test_analyze_payload_surfaces_api_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_fetch(_: str, __: dict[str, Any]) -> dict[str, Any]:
        raise analyzer.VerificationError("Compare API request failed: boom")

    monkeypatch.setattr(analyzer, "_fetch_from_api", _fake_fetch)

    with pytest.raises(analyzer.VerificationError, match="boom"):
        analyzer.analyze_payload(date_filter="2025-04-22")


def test_days_request_is_not_combined_with_explicit_dates() -> None:
    with pytest.raises(analyzer.VerificationError, match="--days cannot be combined"):
        analyzer.analyze_payload(days=30, date_filter="2025-04-22")

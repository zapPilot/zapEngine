"""Tests for the API-first compare analyzer script."""

from __future__ import annotations

import json
from copy import deepcopy
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


def _spy_payload() -> dict[str, Any]:
    return {
        "window": {
            "requested": {"days": 2},
            "effective": {"days": 2},
            "truncated": False,
        },
        "timeline": [
            {
                "market": {
                    "date": "2026-04-27",
                    "token_price": {"btc": 100.0, "eth": 5.0, "spy": 600.0},
                    "sentiment": 45,
                    "sentiment_label": "neutral",
                },
                "strategies": {
                    "dma_fgi_hierarchical_spy_crypto": {
                        "portfolio": {
                            "spot_usd": 4_000.0,
                            "stable_usd": 6_000.0,
                            "total_value": 10_000.0,
                            "allocation": {"spot": 0.4, "stable": 0.6},
                            "asset_allocation": {
                                "btc": 0.2,
                                "eth": 0.2,
                                "spy": 0.0,
                                "stable": 0.6,
                                "alt": 0.0,
                            },
                            "spot_asset": "BTC",
                        },
                        "signal": {
                            "id": "spy_eth_btc_rs_signal",
                            "regime": "neutral",
                            "raw_value": 45.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 90.0,
                                    "distance": 0.1111111111,
                                    "zone": "above",
                                    "cross_event": None,
                                    "outer_dma_asset": "BTC",
                                },
                                "spy_dma": {
                                    "dma_200": 610.0,
                                    "distance": -0.0163934426,
                                    "zone": "below",
                                    "cross_event": "cross_down",
                                    "cooldown_active": False,
                                    "cooldown_remaining_days": 0,
                                    "cooldown_blocked_zone": None,
                                },
                                "ratio": {
                                    "ratio": 0.05,
                                    "ratio_dma_200": 0.04,
                                    "distance": 0.25,
                                    "zone": "above",
                                    "cross_event": None,
                                    "cooldown_active": False,
                                    "cooldown_remaining_days": 0,
                                    "cooldown_blocked_zone": None,
                                },
                            },
                        },
                        "decision": {
                            "action": "sell",
                            "reason": "spy_dma_cross_down",
                            "rule_group": "cross",
                            "target_allocation": {
                                "btc": 0.2,
                                "eth": 0.2,
                                "spy": 0.0,
                                "stable": 0.6,
                                "alt": 0.0,
                            },
                            "immediate": False,
                        },
                        "execution": {
                            "event": "rebalance",
                            "transfers": [
                                {
                                    "from_bucket": "spy",
                                    "to_bucket": "stable",
                                    "amount_usd": 1000.0,
                                }
                            ],
                            "blocked_reason": None,
                            "step_count": 1,
                            "steps_remaining": 0,
                            "interval_days": 1,
                            "diagnostics": {"plugins": {}},
                        },
                    }
                },
            }
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


def test_analyze_payload_date_request_uses_stateful_history_window(
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
        date_filter="2025-04-23",
        output_format="json",
        enrich_db="never",
    )
    data = json.loads(rendered)

    assert captured["request"]["start_date"] == "2024-03-19"
    assert captured["request"]["end_date"] == "2025-04-23"
    assert [record["date"] for record in data["records"]] == ["2025-04-23"]


def test_analyze_payload_date_request_accepts_explicit_history_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def _fake_fetch(endpoint: str, request_body: dict[str, Any]) -> dict[str, Any]:
        captured["request"] = request_body
        return _spy_payload()

    monkeypatch.setattr(analyzer, "_fetch_from_api", _fake_fetch)

    analyzer.analyze_payload(
        endpoint="http://testserver",
        saved_config_id="dma_fgi_hierarchical_spy_crypto",
        config_id="dma_fgi_hierarchical_spy_crypto",
        date_filter="2026-04-27",
        history_start_date="2024-11-01",
        output_format="json",
        enrich_db="never",
        profile="spy-eth-btc-rotation",
    )

    assert captured["request"]["start_date"] == "2024-11-01"
    assert captured["request"]["end_date"] == "2026-04-27"
    assert captured["request"]["configs"] == [
        {
            "config_id": "dma_fgi_hierarchical_spy_crypto",
            "saved_config_id": "dma_fgi_hierarchical_spy_crypto",
        }
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


def test_spy_rotation_profile_includes_spy_dma_and_asset_class_summary() -> None:
    rendered = analyzer.analyze_response_payload(
        _spy_payload(),
        strategy_id="dma_fgi_hierarchical_spy_crypto",
        output_format="json",
        enrich_db="never",
        profile="spy-eth-btc-rotation",
        source_label="fixture",
        request_body={"configs": []},
    )
    data = json.loads(rendered)

    assert "spy_dma" in data["sections"]
    assert "asset_class" in data["sections"]
    record = data["records"][0]
    assert record["market"]["token_price"]["spy"] == 600.0
    assert record["spy_dma"]["cross_event"] == "cross_down"
    assert record["asset_class"]["target_spy"] == 0.0
    assert record["asset_class"]["target_crypto"] == pytest.approx(0.4)
    assert "stock_score" in record["asset_class"]
    assert "crypto_gate_state" in record["asset_class"]
    assert record["rule"]["classification"] == "intended_rule"
    assert "SPY DMA cross_down" in record["rule"]["summary"]


def test_analyze_compare_surfaces_matched_rule_name() -> None:
    payload = deepcopy(_payload())
    strategy = payload["timeline"][1]["strategies"]["eth_btc_rotation_default"]
    strategy["decision"]["details"] = {"matched_rule_name": "above_greed_sell"}

    rendered = analyzer.analyze_response_payload(
        payload,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="markdown",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        sections=["decision", "rule"],
    )

    assert "Matched rule: `above_greed_sell`" in rendered
    assert "Sell when price is above DMA and FGI is greed." in rendered


def test_analyze_compare_renders_active_tactics_section() -> None:
    payload = deepcopy(_payload())
    for point in payload["timeline"]:
        state = point["strategies"].pop("eth_btc_rotation_default")
        point["strategies"]["dma_fgi_hierarchical_full"] = state

    rendered = analyzer.analyze_response_payload(
        payload,
        strategy_id="dma_fgi_hierarchical_full",
        date_filter="2025-04-22",
        output_format="markdown",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        sections=["active_tactics"],
    )

    assert "### Active Tactics" in rendered
    assert "Adaptive crypto DMA reference: `True`" in rendered


def test_constraint_validation_passes_and_uses_full_history(
    tmp_path: Any,
) -> None:
    fixture = tmp_path / "constraints.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "cross_up_stable_deploy",
                            "event_type": "crypto_cross_up",
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                },
                                {"type": "target_stable_decreased_from_previous"},
                            ],
                        }
                    ]
                }
            }
        )
    )

    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="json",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        constraints_fixture=str(fixture),
    )
    data = json.loads(rendered)

    validation = data["constraint_validation"]
    assert validation["passed"] is True
    assert validation["checked"] == 1
    assert validation["results"][0]["id"] == "cross_up_stable_deploy"


def test_constraint_validation_reports_trigger_violation(tmp_path: Any) -> None:
    fixture = tmp_path / "constraints.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "missing_spy_cross_down",
                            "event_type": "spy_cross_down",
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                }
                            ],
                        }
                    ]
                }
            }
        )
    )

    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="json",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        constraints_fixture=str(fixture),
    )
    data = json.loads(rendered)

    validation = data["constraint_validation"]
    assert validation["passed"] is False
    assert validation["checked"] == 1
    assert validation["violations"][0]["id"] == "missing_spy_cross_down"
    assert (
        "expected spy_dma cross_event='cross_down'"
        in validation["violations"][0]["message"]
    )


def test_ratio_cross_constraint_requires_zone_transition(tmp_path: Any) -> None:
    fixture = tmp_path / "constraints.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "ratio_cross_up",
                            "event_type": "eth_btc_ratio_cross_up",
                            "assertions": [
                                {"type": "ratio_zone_equals", "zone": "above"}
                            ],
                        }
                    ]
                }
            }
        )
    )

    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="json",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        constraints_fixture=str(fixture),
    )
    data = json.loads(rendered)

    validation = data["constraint_validation"]
    assert validation["passed"] is False
    assert (
        "expected inner ratio zone transition 'below'->'above'"
        in validation["violations"][0]["message"]
    )


def test_constraint_event_id_filters_selected_events(tmp_path: Any) -> None:
    fixture = tmp_path / "constraints.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "unchecked_failure",
                            "event_type": "spy_cross_down",
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                }
                            ],
                        },
                        {
                            "id": "checked_pass",
                            "event_type": "crypto_cross_up",
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                }
                            ],
                        },
                    ]
                }
            }
        )
    )

    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="json",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        constraints_fixture=str(fixture),
        constraint_event_ids=["checked_pass"],
    )
    data = json.loads(rendered)

    validation = data["constraint_validation"]
    assert validation["passed"] is True
    assert validation["checked"] == 1
    assert validation["results"][0]["id"] == "checked_pass"


def test_constraints_outside_selected_range_are_skipped(tmp_path: Any) -> None:
    fixture = tmp_path / "constraints.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "outside",
                            "event_type": "crypto_cross_up",
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                }
                            ],
                        }
                    ]
                }
            }
        )
    )

    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        from_date="2025-04-23",
        to_date="2025-04-23",
        output_format="json",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        constraints_fixture=str(fixture),
    )
    data = json.loads(rendered)

    validation = data["constraint_validation"]
    assert validation["passed"] is True
    assert validation["checked"] == 0
    assert validation["skipped"][0]["id"] == "outside"


def test_no_constraints_disables_validation() -> None:
    rendered = analyzer.analyze_response_payload(
        _payload(),
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        output_format="json",
        enrich_db="never",
        source_label="fixture",
        request_body={"configs": []},
        constraints_fixture=None,
    )
    data = json.loads(rendered)

    assert data["constraint_validation"] == {
        "enabled": False,
        "fixture": None,
        "passed": True,
        "checked": 0,
        "violations": [],
        "results": [],
        "skipped": [],
    }


def test_main_exits_nonzero_after_printing_constraint_report(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fixture = tmp_path / "constraints.json"
    fixture.write_text(
        json.dumps(
            {
                "2025-04-22": {
                    "events": [
                        {
                            "id": "bad_reference",
                            "event_type": "crypto_cross_up",
                            "reference_asset": "BTC",
                            "assertions": [
                                {
                                    "type": "target_asset_equals",
                                    "asset": "stable",
                                    "value": 0.0,
                                }
                            ],
                        }
                    ]
                }
            }
        )
    )

    def _fake_fetch(_: str, __: dict[str, Any]) -> dict[str, Any]:
        return _payload()

    monkeypatch.setattr(analyzer, "_fetch_from_api", _fake_fetch)

    exit_code = analyzer.main(
        [
            "--endpoint",
            "http://testserver",
            "--date",
            "2025-04-22",
            "--format",
            "json",
            "--enrich-db",
            "never",
            "--constraints-fixture",
            str(fixture),
        ]
    )
    output = capsys.readouterr().out
    data = json.loads(output)

    assert exit_code == 1
    assert data["constraint_validation"]["passed"] is False
    assert data["constraint_validation"]["violations"][0]["id"] == "bad_reference"


def test_analyze_payload_surfaces_api_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_fetch(_: str, __: dict[str, Any]) -> dict[str, Any]:
        raise analyzer.VerificationError("Compare API request failed: boom")

    monkeypatch.setattr(analyzer, "_fetch_from_api", _fake_fetch)

    with pytest.raises(analyzer.VerificationError, match="boom"):
        analyzer.analyze_payload(date_filter="2025-04-22")


def test_days_request_is_not_combined_with_explicit_dates() -> None:
    with pytest.raises(analyzer.VerificationError, match="--days cannot be combined"):
        analyzer.analyze_payload(days=30, date_filter="2025-04-22")

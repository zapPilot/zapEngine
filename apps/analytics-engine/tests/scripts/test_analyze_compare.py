"""Tests for compare analyzer script."""

from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest

import scripts.backtesting.analyzer as analyzer


def _current_payload() -> dict[str, Any]:
    return {
        "window": {
            "requested": {
                "start_date": "2024-11-19",
                "end_date": "2026-04-03",
                "days": 500,
            },
            "effective": {
                "start_date": "2024-11-19",
                "end_date": "2026-04-03",
                "days": 500,
            },
            "truncated": False,
        },
        "timeline": [
            {
                "market": {
                    "date": "2025-03-09",
                    "token_price": {"btc": 80601.04131142, "eth": 2015.50910884},
                    "sentiment": 24,
                    "sentiment_label": "fear",
                },
                "strategies": {
                    "eth_btc_rotation_default": {
                        "portfolio": {
                            "spot_usd": 0.0,
                            "stable_usd": 10325.687980316476,
                            "total_value": 10325.687980316476,
                            "allocation": {"spot": 0.0, "stable": 1.0},
                            "asset_allocation": {
                                "btc": 0.0,
                                "eth": 0.0,
                                "stable": 1.0,
                                "alt": 0.0,
                            },
                            "spot_asset": None,
                        },
                        "signal": {
                            "id": "eth_btc_rs_signal",
                            "regime": "fear",
                            "raw_value": 24.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 83267.20986908,
                                    "distance": -0.032019429519158704,
                                    "zone": "below",
                                    "cross_event": "cross_down",
                                }
                            },
                        },
                        "decision": {
                            "action": "sell",
                            "reason": "dma_cross_down",
                            "rule_group": "cross",
                            "target_allocation": {"spot": 0.0, "stable": 1.0},
                            "target_asset_allocation": {
                                "btc": 0.0,
                                "eth": 0.0,
                                "stable": 1.0,
                                "alt": 0.0,
                            },
                            "immediate": True,
                        },
                        "execution": {
                            "event": "rebalance",
                            "transfers": [
                                {
                                    "from_bucket": "btc",
                                    "to_bucket": "stable",
                                    "amount_usd": 1036.9050999345588,
                                },
                                {
                                    "from_bucket": "eth",
                                    "to_bucket": "stable",
                                    "amount_usd": 333.65357330589467,
                                },
                            ],
                            "blocked_reason": None,
                            "step_count": 1,
                            "steps_remaining": 0,
                            "interval_days": 1,
                            "diagnostics": {"plugins": {}},
                        },
                    }
                },
            },
            {
                "market": {
                    "date": "2025-04-22",
                    "token_price": {"btc": 93441.89334756, "eth": 1757.33170294},
                    "sentiment": 38,
                    "sentiment_label": "fear",
                },
                "strategies": {
                    "eth_btc_rotation_default": {
                        "portfolio": {
                            "spot_usd": 10386.77578528007,
                            "stable_usd": 0.0,
                            "total_value": 10386.77578528007,
                            "allocation": {"spot": 1.0, "stable": 0.0},
                            "asset_allocation": {
                                "btc": 0.0,
                                "eth": 1.0,
                                "stable": 0.0,
                                "alt": 0.0,
                            },
                            "spot_asset": "ETH",
                        },
                        "signal": {
                            "id": "eth_btc_rs_signal",
                            "regime": "fear",
                            "raw_value": 38.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 88377.0506727,
                                    "distance": 0.05730947838050615,
                                    "zone": "above",
                                    "cross_event": "cross_up",
                                }
                            },
                        },
                        "decision": {
                            "action": "buy",
                            "reason": "dma_cross_up",
                            "rule_group": "cross",
                            "target_allocation": {"spot": 1.0, "stable": 0.0},
                            "target_asset_allocation": {
                                "btc": 0.0,
                                "eth": 1.0,
                                "stable": 0.0,
                                "alt": 0.0,
                            },
                            "immediate": True,
                        },
                        "execution": {
                            "event": "rebalance",
                            "transfers": [
                                {
                                    "from_bucket": "stable",
                                    "to_bucket": "eth",
                                    "amount_usd": 10417.459055230525,
                                }
                            ],
                            "blocked_reason": None,
                            "step_count": 1,
                            "steps_remaining": 0,
                            "interval_days": 1,
                            "diagnostics": {
                                "plugins": {
                                    "dma_buy_gate": {
                                        "buy_strength": 0.0,
                                        "sideways_confirmed": False,
                                    }
                                }
                            },
                        },
                    }
                },
            },
            {
                "market": {
                    "date": "2025-04-23",
                    "token_price": {"btc": 93699.11317604, "eth": 1796.1041889},
                    "sentiment": 52,
                    "sentiment_label": "neutral",
                },
                "strategies": {
                    "eth_btc_rotation_default": {
                        "portfolio": {
                            "spot_usd": 10616.814579562566,
                            "stable_usd": 0.0,
                            "total_value": 10616.814579562566,
                            "allocation": {"spot": 1.0, "stable": 0.0},
                            "asset_allocation": {
                                "btc": 0.0,
                                "eth": 1.0,
                                "stable": 0.0,
                                "alt": 0.0,
                            },
                            "spot_asset": "ETH",
                        },
                        "signal": {
                            "id": "eth_btc_rs_signal",
                            "regime": "neutral",
                            "raw_value": 52.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 88535.09649628,
                                    "distance": -0.9797130826081444,
                                    "zone": "below",
                                    "cross_event": None,
                                }
                            },
                        },
                        "decision": {
                            "action": "hold",
                            "reason": "below_side_cooldown_active",
                            "rule_group": "rotation",
                            "target_allocation": {"spot": 1.0, "stable": 0.0},
                            "target_asset_allocation": {
                                "btc": 0.0,
                                "eth": 1.0,
                                "stable": 0.0,
                                "alt": 0.0,
                            },
                            "immediate": False,
                        },
                        "execution": {
                            "event": None,
                            "transfers": [],
                            "blocked_reason": None,
                            "step_count": 0,
                            "steps_remaining": 0,
                            "interval_days": 0,
                            "diagnostics": {"plugins": {}},
                        },
                    }
                },
            },
        ],
    }


def _legacy_payload() -> dict[str, Any]:
    return {
        "timeline": [
            {
                "market": {
                    "date": "2025-01-02",
                    "token_price": {"btc": 90000.0, "eth": 2500.0},
                    "sentiment": 10,
                    "sentiment_label": "extreme_fear",
                },
                "strategies": {
                    "dma_case": {
                        "portfolio": {
                            "spot_usd": 0.0,
                            "stable_usd": 10000.0,
                            "total_value": 10000.0,
                            "allocation": {"spot": 0.0, "stable": 1.0},
                        },
                        "signal": {
                            "signal_id": "dma_gated_fgi",
                            "regime": "extreme_fear",
                            "raw_value": 10.0,
                            "confidence": 1.0,
                            "ath_event": None,
                            "dma": {
                                "dma_200": 100000.0,
                                "distance": -0.15,
                                "zone": "below",
                                "cross_event": None,
                            },
                        },
                        "decision": {
                            "action": "buy",
                            "reason": "below_extreme_fear_buy",
                            "rule_group": "dma_fgi",
                            "target_allocation": {"spot": 1.0, "stable": 0.0},
                            "target_asset_allocation": {
                                "btc": 1.0,
                                "eth": 0.0,
                                "stable": 0.0,
                                "alt": 0.0,
                            },
                            "immediate": False,
                        },
                        "execution": {
                            "event": None,
                            "transfers": [],
                            "blocked_reason": "sideways_not_confirmed",
                            "step_count": 6,
                            "steps_remaining": 6,
                            "interval_days": 2,
                            "buy_gate": {
                                "buy_strength": 0.4,
                                "sideways_confirmed": False,
                                "block_reason": "sideways_not_confirmed",
                            },
                        },
                    }
                },
            }
        ]
    }


def _write_payload(tmp_path: Path, payload: dict[str, Any], name: str) -> str:
    path = tmp_path / name
    path.write_text(json.dumps(payload))
    return str(path)


def test_analyze_compare_marks_intended_rule_and_anomaly(tmp_path: Path) -> None:
    path = _write_payload(tmp_path, _current_payload(), "current.json")

    march_output = analyzer.analyze_payload(
        path,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-03-09",
        profile="eth-btc-rotation",
        output_format="text",
        enrich_db="never",
    )
    april_output = analyzer.analyze_payload(
        path,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        profile="eth-btc-rotation",
        output_format="text",
        enrich_db="never",
    )
    anomaly_output = analyzer.analyze_payload(
        path,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-23",
        profile="eth-btc-rotation",
        output_format="text",
        enrich_db="never",
    )

    assert "classification=intended_rule" in march_output
    assert "cross_down forced an immediate exit" in march_output
    assert "full re-entry into spot" in april_output
    assert "full risk-on sleeve to ETH" in april_output
    assert "classification=anomaly" in anomaly_output
    assert "matches ETH price against BTC DMA" in anomaly_output


def test_analyze_compare_raw_profile_normalizes_legacy_schema(tmp_path: Path) -> None:
    path = _write_payload(tmp_path, _legacy_payload(), "legacy.json")

    output = analyzer.analyze_payload(
        path,
        strategy_id="dma_case",
        profile="raw",
        output_format="json",
    )
    parsed = json.loads(output)

    assert parsed[0]["signal"]["id"] == "dma_gated_fgi"
    assert parsed[0]["signal"]["dma"]["zone"] == "below"
    assert (
        parsed[0]["execution"]["buy_gate"]["block_reason"] == "sideways_not_confirmed"
    )


def test_analyze_compare_auto_db_enrichment_falls_back_to_json_only(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    path = _write_payload(tmp_path, _current_payload(), "current.json")

    import src.core.database as database
    from src.services.market.token_price_service import TokenPriceService

    monkeypatch.setattr(database, "init_database", lambda: None)
    monkeypatch.setattr(database, "close_database", lambda: None)

    @contextmanager
    def _fake_session_scope():
        yield object()

    monkeypatch.setattr(database, "session_scope", _fake_session_scope)

    def _raise_dns(*args: Any, **kwargs: Any) -> dict[Any, Any]:
        raise RuntimeError("dns failure")

    monkeypatch.setattr(
        TokenPriceService,
        "get_pair_ratio_dma_history",
        _raise_dns,
    )

    output = analyzer.analyze_payload(
        path,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-22",
        profile="eth-btc-rotation",
        output_format="json",
        enrich_db="auto",
    )
    parsed = json.loads(output)

    assert parsed["records"][0]["inner_ratio"]["source"] == "unavailable"
    assert any("DB enrichment unavailable" in warning for warning in parsed["warnings"])


def test_analyze_compare_prefers_runtime_ratio_details_when_present(
    tmp_path: Path,
) -> None:
    payload = _current_payload()
    payload["timeline"][2]["strategies"]["eth_btc_rotation_default"]["signal"][
        "details"
    ]["ratio"] = {
        "ratio": 0.019169,
        "ratio_dma_200": 0.022000,
        "distance": -0.12868181818181817,
        "zone": "below",
        "cross_event": "cross_down",
        "cooldown_active": True,
        "cooldown_remaining_days": 30,
        "cooldown_blocked_zone": "below",
    }
    path = _write_payload(tmp_path, payload, "current_with_ratio.json")

    output = analyzer.analyze_payload(
        path,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-04-23",
        profile="eth-btc-rotation",
        output_format="json",
        enrich_db="never",
    )
    parsed = json.loads(output)
    inner_ratio = parsed["records"][0]["inner_ratio"]

    assert inner_ratio["source"] == "runtime"
    assert inner_ratio["zone"] == "below"
    assert inner_ratio["cross_event"] == "cross_down"
    assert inner_ratio["cooldown_active"] is True
    assert inner_ratio["cooldown_remaining_days"] == 30
    assert inner_ratio["cooldown_blocked_zone"] == "below"


def test_analyze_payload_accepts_dict_source_directly() -> None:
    payload = _current_payload()
    output = analyzer.analyze_payload(
        payload,
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-03-09",
        profile="eth-btc-rotation",
        output_format="text",
        enrich_db="never",
    )
    assert "classification=intended_rule" in output


def test_analyze_payload_fetches_from_api_when_source_is_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import httpx

    payload = _current_payload()

    class _FakeResponse:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return payload

        def raise_for_status(self) -> None:
            pass

    def _fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        assert "/api/v3/backtesting/compare" in url
        return _FakeResponse()

    monkeypatch.setattr(httpx, "post", _fake_post)

    output = analyzer.analyze_payload(
        None,
        endpoint="http://test:8001",
        strategy_id="eth_btc_rotation_default",
        date_filter="2025-03-09",
        profile="eth-btc-rotation",
        output_format="json",
        enrich_db="never",
    )
    parsed = json.loads(output)
    assert parsed["source"] == "http://test:8001"
    assert len(parsed["records"]) == 1

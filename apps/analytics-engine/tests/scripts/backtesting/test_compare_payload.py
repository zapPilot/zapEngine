"""Tests for compare payload normalization helpers."""

from __future__ import annotations

from scripts.backtesting.compare_payload import (
    iter_normalized_points,
    normalize_execution,
    normalize_signal,
)


def test_normalize_signal_supports_current_and_legacy_schema() -> None:
    current = normalize_signal(
        {
            "id": "eth_btc_rs_signal",
            "regime": "fear",
            "raw_value": 24.0,
            "confidence": 1.0,
            "details": {
                "ath_event": "token_ath",
                "dma": {"zone": "below", "cross_event": "cross_down"},
            },
        }
    )
    legacy = normalize_signal(
        {
            "signal_id": "dma_gated_fgi",
            "regime": "greed",
            "raw_value": 72.0,
            "confidence": 1.0,
            "ath_event": "both_ath",
            "dma": {"zone": "above", "cross_event": None},
        }
    )

    assert current is not None
    assert current["id"] == "eth_btc_rs_signal"
    assert current["ath_event"] == "token_ath"
    assert current["dma"]["zone"] == "below"

    assert legacy is not None
    assert legacy["id"] == "dma_gated_fgi"
    assert legacy["ath_event"] == "both_ath"
    assert legacy["dma"]["zone"] == "above"


def test_normalize_execution_reads_buy_gate_from_legacy_or_diagnostics() -> None:
    current = normalize_execution(
        {
            "event": None,
            "transfers": [],
            "blocked_reason": "sideways_not_confirmed",
            "diagnostics": {
                "plugins": {
                    "dma_buy_gate": {
                        "buy_strength": 0.4,
                        "sideways_confirmed": False,
                        "block_reason": "sideways_not_confirmed",
                    }
                }
            },
        }
    )
    legacy = normalize_execution(
        {
            "event": None,
            "transfers": [],
            "blocked_reason": "sideways_not_confirmed",
            "buy_gate": {
                "buy_strength": 0.4,
                "sideways_confirmed": False,
                "block_reason": "sideways_not_confirmed",
            },
        }
    )

    assert current["buy_gate"]["block_reason"] == "sideways_not_confirmed"
    assert legacy["buy_gate"]["block_reason"] == "sideways_not_confirmed"


def test_iter_normalized_points_returns_strategy_view() -> None:
    timeline = [
        {
            "market": {"date": "2025-03-09", "token_price": {"btc": 100000.0}},
            "strategies": {
                "case": {
                    "portfolio": {
                        "spot_usd": 0.0,
                        "stable_usd": 10000.0,
                        "total_value": 10000.0,
                        "allocation": {"spot": 0.0, "stable": 1.0},
                    },
                    "signal": {
                        "id": "dma_gated_fgi",
                        "regime": "fear",
                        "raw_value": 20.0,
                        "confidence": 1.0,
                        "details": {"dma": {"zone": "below"}},
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
                        "transfers": [],
                        "blocked_reason": None,
                        "diagnostics": {"plugins": {}},
                    },
                }
            },
        }
    ]

    points = iter_normalized_points(timeline, "case")

    assert points[0]["date"] == "2025-03-09"
    assert points[0]["signal"]["id"] == "dma_gated_fgi"
    assert points[0]["execution"]["diagnostics"]["plugins"] == {}

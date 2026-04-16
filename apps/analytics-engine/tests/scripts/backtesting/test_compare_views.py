"""Tests for compare view extraction helpers."""

from __future__ import annotations

import pytest

from scripts.backtesting.compare_payload import VerificationError
from scripts.backtesting.compare_views import (
    DECISION_COLUMNS,
    EXECUTION_COLUMNS,
    extract_decision_rows,
    extract_execution_rows,
    filter_rows_by_date,
    format_csv,
    format_table,
)


def _decision_payload() -> dict:
    return {
        "timeline": [
            {
                "market": {
                    "date": "2025-01-20",
                    "token_price": {"btc": 100000.0},
                    "sentiment": 72,
                    "sentiment_label": "greed",
                },
                "strategies": {
                    "dma_case": {
                        "portfolio": {
                            "spot_usd": 5000.0,
                            "stable_usd": 5000.0,
                            "total_value": 10000.0,
                            "allocation": {"spot": 0.5, "stable": 0.5},
                        },
                        "signal": {
                            "id": "dma_gated_fgi",
                            "regime": "greed",
                            "raw_value": 72.0,
                            "confidence": 1.0,
                            "details": {
                                "ath_event": "both_ath",
                                "dma": {
                                    "dma_200": 95000.0,
                                    "distance": 0.052,
                                    "zone": "above",
                                    "cross_event": None,
                                },
                            },
                        },
                        "decision": {
                            "action": "sell",
                            "reason": "above_greed_sell",
                            "rule_group": "dma_fgi",
                            "target_allocation": {"spot": 0.0, "stable": 1.0},
                            "target_asset_allocation": {
                                "btc": 0.0,
                                "eth": 0.0,
                                "stable": 1.0,
                                "alt": 0.0,
                            },
                            "immediate": False,
                        },
                        "execution": {
                            "event": "rebalance",
                            "transfers": [],
                            "blocked_reason": None,
                            "step_count": 5,
                            "steps_remaining": 4,
                            "interval_days": 2,
                            "diagnostics": {"plugins": {}},
                        },
                    }
                },
            },
            {
                "market": {
                    "date": "2025-03-09",
                    "token_price": {"btc": 100000.0},
                    "sentiment": 25,
                    "sentiment_label": "fear",
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
                            "id": "dma_gated_fgi",
                            "regime": "fear",
                            "raw_value": 25.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 101000.0,
                                    "distance": -0.01,
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
                            "transfers": [],
                            "blocked_reason": None,
                            "step_count": 1,
                            "steps_remaining": 0,
                            "interval_days": 1,
                            "diagnostics": {"plugins": {}},
                        },
                    }
                },
            },
        ]
    }


def _execution_payload() -> dict:
    buy_gate_blocked = {
        "buy_strength": 0.4,
        "sideways_confirmed": False,
        "window_days": 5,
        "range_value": 0.06,
        "leg_index": None,
        "leg_cap_pct": None,
        "leg_cap_usd": None,
        "leg_spent_usd": 0.0,
        "episode_state": "idle",
        "block_reason": "sideways_not_confirmed",
    }
    buy_gate_executed = {
        "buy_strength": 0.4,
        "sideways_confirmed": True,
        "window_days": 5,
        "range_value": 0.02,
        "leg_index": 1,
        "leg_cap_pct": 0.05,
        "leg_cap_usd": 500.0,
        "leg_spent_usd": 500.0,
        "episode_state": "consumed",
        "block_reason": None,
    }
    return {
        "timeline": [
            {
                "market": {
                    "date": "2025-03-11",
                    "token_price": {"btc": 100000.0},
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
                            "id": "dma_gated_fgi",
                            "regime": "extreme_fear",
                            "raw_value": 10.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 100000.0,
                                    "distance": -0.15,
                                    "zone": "below",
                                    "cross_event": None,
                                }
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
                            "diagnostics": {
                                "plugins": {"dma_buy_gate": buy_gate_blocked}
                            },
                        },
                    }
                },
            },
            {
                "market": {
                    "date": "2025-03-12",
                    "token_price": {"btc": 100000.0},
                    "sentiment": 10,
                    "sentiment_label": "extreme_fear",
                },
                "strategies": {
                    "dma_case": {
                        "portfolio": {
                            "spot_usd": 500.0,
                            "stable_usd": 9500.0,
                            "total_value": 10000.0,
                            "allocation": {"spot": 0.05, "stable": 0.95},
                        },
                        "signal": {
                            "id": "dma_gated_fgi",
                            "regime": "extreme_fear",
                            "raw_value": 10.0,
                            "confidence": 1.0,
                            "details": {
                                "dma": {
                                    "dma_200": 100000.0,
                                    "distance": -0.15,
                                    "zone": "below",
                                    "cross_event": None,
                                }
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
                            "event": "rebalance",
                            "transfers": [
                                {
                                    "from_bucket": "stable",
                                    "to_bucket": "spot",
                                    "amount_usd": 500.0,
                                }
                            ],
                            "blocked_reason": None,
                            "step_count": 6,
                            "steps_remaining": 5,
                            "interval_days": 2,
                            "diagnostics": {
                                "plugins": {"dma_buy_gate": buy_gate_executed}
                            },
                        },
                    }
                },
            },
        ]
    }


def test_extract_decision_rows_uses_new_schema() -> None:
    rows = extract_decision_rows(_decision_payload()["timeline"], "dma_case")
    assert rows[0]["DATE"] == "2025-01-20"
    assert rows[0]["SIGNAL"] == "dma_gated_fgi"
    assert rows[0]["RULE_GROUP"] == "dma_fgi"
    assert rows[0]["REASON"] == "above_greed_sell"
    assert rows[0]["ATH_EVENT"] == "both_ath"
    assert rows[0]["ACTION"] == "SELL"
    assert rows[1]["ACTION"] == "CROSS"


def test_extract_execution_rows_uses_execution_buy_gate() -> None:
    rows = extract_execution_rows(_execution_payload()["timeline"], "dma_case")
    assert rows[0]["EXECUTED"] == "false"
    assert rows[0]["BLOCK_REASON"] == "sideways_not_confirmed"
    assert rows[0]["BUY_GATE"] == "sideways_not_confirmed"
    assert rows[1]["EXECUTED"] == "true"
    assert rows[1]["LEG"] == "1"
    assert rows[1]["LEG_CAP_USD"] == "500.000000"
    assert rows[1]["LEG_SPENT_USD"] == "500.000000"


def test_formatters_emit_headers_for_both_views() -> None:
    decision_rows = extract_decision_rows(_decision_payload()["timeline"], "dma_case")
    execution_rows = extract_execution_rows(
        _execution_payload()["timeline"], "dma_case"
    )
    assert "DATE" in format_table(decision_rows, DECISION_COLUMNS).splitlines()[0]
    assert "DATE," in format_csv(decision_rows, DECISION_COLUMNS)
    assert "DATE" in format_table(execution_rows, EXECUTION_COLUMNS).splitlines()[0]
    assert "DATE," in format_csv(execution_rows, EXECUTION_COLUMNS)


def test_filter_rows_by_date_errors_on_missing_date() -> None:
    rows = extract_decision_rows(_decision_payload()["timeline"], "dma_case")
    filtered = filter_rows_by_date(rows, "2025-03-09")
    assert filtered == [rows[1]]
    with pytest.raises(VerificationError, match="was not found"):
        filter_rows_by_date(rows, "2025-12-31")

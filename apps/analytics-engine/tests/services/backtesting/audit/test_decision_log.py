from __future__ import annotations

import json

from src.services.backtesting.audit.decision_log import format_decision_log_line


def test_format_decision_log_line_uses_flat_stable_schema() -> None:
    point = {
        "date": "2025-04-22",
        "decision": {
            "action": "buy",
            "reason": "portfolio_cross_up_equal_weight",
            "rule_group": "cross",
            "target_allocation": {
                "btc": 0.3,
                "eth": 0.3,
                "spy": 0.4,
                "stable": 0.0,
                "alt": 0.0,
            },
            "details": {
                "allocation_name": "portfolio_cross_up_equal_weight",
                "decision_score": 0.95,
                "matched_rule_name": "cross_up_equal_weight",
                "signals_consulted": {
                    "btc.cross": "cross_up",
                    "spy.zone": "above",
                },
            },
        },
        "execution": {"transfers": [{"from_bucket": "stable", "to_bucket": "btc"}]},
    }
    line = format_decision_log_line(
        strategy_id="dma_fgi_portfolio_rules",
        point=point,
        prior_target={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    payload = json.loads(line)

    assert payload == {
        "date": "2025-04-22",
        "strategy": "dma_fgi_portfolio_rules",
        "action": "buy",
        "rule": "cross_up_equal_weight",
        "group": "cross",
        "reason": "portfolio_cross_up_equal_weight",
        "score": 0.95,
        "signals": {"btc.cross": "cross_up", "spy.zone": "above"},
        "target_diff": {"btc": 0.3, "eth": 0.3, "spy": 0.4, "stable": -1.0},
        "target": "portfolio_cross_up_equal_weight",
        "executed": True,
    }
    assert len(line) < 500


def test_format_decision_log_line_keeps_holds() -> None:
    point = {
        "date": "2025-04-23",
        "decision": {
            "action": "hold",
            "reason": "regime_no_signal",
            "rule_group": "none",
            "target_allocation": {"btc": 0.3, "eth": 0.3, "spy": 0.4, "stable": 0.0},
            "details": {
                "decision_score": 0.0,
                "matched_rule_name": "regime_no_signal_hold",
            },
        },
        "execution": {"transfers": []},
    }

    payload = json.loads(
        format_decision_log_line(
            strategy_id="dma_fgi_portfolio_rules",
            point=point,
            prior_target={"btc": 0.3, "eth": 0.3, "spy": 0.4, "stable": 0.0},
        )
    )

    assert payload["action"] == "hold"
    assert payload["rule"] == "regime_no_signal_hold"
    assert payload["target_diff"] == {}
    assert payload["executed"] is False


def test_format_decision_log_line_preserves_sizing_meta() -> None:
    point = {
        "date": "2025-04-22",
        "decision": {
            "action": "buy",
            "reason": "portfolio_extreme_fear_dca_buy",
            "rule_group": "dma_fgi",
            "target_allocation": {"btc": 0.075, "stable": 0.925},
            "details": {
                "decision_score": 1.0,
                "matched_rule_name": "extreme_fear_dca_buy",
                "sizing_meta": {
                    "strategy": "fgi_exponential",
                    "base": 0.05,
                    "adjusted": 0.075,
                    "fgi": 0.0,
                },
            },
        },
        "execution": {"transfers": [{"from_bucket": "stable", "to_bucket": "btc"}]},
    }

    payload = json.loads(
        format_decision_log_line(
            strategy_id="dma_fgi_portfolio_rules",
            point=point,
            prior_target={"btc": 0.0, "stable": 1.0},
        )
    )

    assert payload["sizing_meta"] == {
        "strategy": "fgi_exponential",
        "base": 0.05,
        "adjusted": 0.075,
        "fgi": 0.0,
    }

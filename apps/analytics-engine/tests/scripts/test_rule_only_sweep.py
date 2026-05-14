from __future__ import annotations

from typing import Any

import pytest

from scripts.attribution import rule_only_sweep
from scripts.attribution.rule_only_sweep import build_rule_only_compare_request


def test_build_rule_only_compare_request_adds_baseline_and_rule_variants() -> None:
    request = build_rule_only_compare_request(
        start_date="2026-04-14",
        end_date="2026-04-15",
        total_capital=1_000.0,
        baseline_rules=frozenset({"cross_down_exit", "cross_up_equal_weight"}),
        candidate_rules=("spy_latch", "dma_overextension_dca_sell"),
        decision_log_dir="/tmp/rules",
        extra_params={"trade_quota": {"min_trade_interval_days": 3}},
    )

    assert request["emit_decision_log"] is True
    assert request["decision_log_dir"] == "/tmp/rules"
    assert [config["config_id"] for config in request["configs"]] == [
        "baseline",
        "baseline_plus_spy_latch",
        "baseline_plus_dma_overextension_dca_sell",
    ]
    assert request["configs"][0]["params"]["enabled_rules"] == [
        "cross_down_exit",
        "cross_up_equal_weight",
    ]
    assert request["configs"][0]["params"]["trade_quota"] == {
        "min_trade_interval_days": 3
    }
    assert request["configs"][1]["params"]["enabled_rules"] == [
        "cross_down_exit",
        "cross_up_equal_weight",
        "spy_latch",
    ]


def test_overextension_sweep_flags_build_nested_extra_params() -> None:
    args, unknown = rule_only_sweep._build_arg_parser().parse_known_args(
        [
            "--rule",
            "dma_overextension_dca_sell",
            "--overextension-multiplier-greed",
            "0.67",
            "--overextension-multiplier-extreme-greed",
            "0.5",
        ]
    )

    assert unknown == []
    assert args.overextension_multiplier_greed == 0.67
    assert args.overextension_multiplier_extreme_greed == 0.5

    request = build_rule_only_compare_request(
        start_date="2026-04-14",
        end_date="2026-04-15",
        total_capital=1_000.0,
        baseline_rules=frozenset({"cross_down_exit"}),
        candidate_rules=("dma_overextension_dca_sell",),
        decision_log_dir="/tmp/rules",
        extra_params=rule_only_sweep._extra_params(args),
    )

    assert request["configs"][1]["params"]["top_escape"] == {
        "overextension_threshold_multiplier_greed": 0.67,
        "overextension_threshold_multiplier_extreme_greed": 0.5,
    }


def test_main_wires_overextension_flags_into_sweep_params(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_collect_rule_only_sweep(**kwargs: Any) -> list[Any]:
        captured.update(kwargs)
        return []

    monkeypatch.setattr(
        rule_only_sweep,
        "collect_rule_only_sweep",
        fake_collect_rule_only_sweep,
    )

    exit_code = rule_only_sweep.main(
        [
            "--rule",
            "dma_overextension_dca_sell",
            "--overextension-multiplier-greed",
            "0.67",
            "--overextension-multiplier-extreme-greed",
            "0.5",
            "--format",
            "json",
        ]
    )

    assert exit_code == 0
    assert captured["extra_params"] == {
        "top_escape": {
            "overextension_threshold_multiplier_greed": 0.67,
            "overextension_threshold_multiplier_extreme_greed": 0.5,
        }
    }

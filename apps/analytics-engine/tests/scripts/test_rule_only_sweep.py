from __future__ import annotations

from scripts.attribution.rule_only_sweep import build_rule_only_compare_request


def test_build_rule_only_compare_request_adds_baseline_and_rule_variants() -> None:
    request = build_rule_only_compare_request(
        start_date="2026-04-14",
        end_date="2026-04-15",
        total_capital=1_000.0,
        baseline_rules=frozenset({"cross_down_exit", "cross_up_equal_weight"}),
        candidate_rules=("extreme_fear_dca_buy", "cross_down_exit"),
        decision_log_dir="/tmp/rules",
        extra_params={"extreme_fear": {"min_consecutive_days": 3}},
    )

    assert request["emit_decision_log"] is True
    assert request["decision_log_dir"] == "/tmp/rules"
    assert [config["config_id"] for config in request["configs"]] == [
        "baseline",
        "baseline_plus_extreme_fear_dca_buy",
        "baseline_plus_cross_down_exit",
    ]
    assert request["configs"][0]["params"]["enabled_rules"] == [
        "cross_down_exit",
        "cross_up_equal_weight",
    ]
    assert request["configs"][0]["params"]["extreme_fear"] == {
        "min_consecutive_days": 3
    }
    assert request["configs"][1]["params"]["enabled_rules"] == [
        "cross_down_exit",
        "cross_up_equal_weight",
        "extreme_fear_dca_buy",
    ]

from __future__ import annotations

from src.services.backtesting.lab.attribution import RuleStats, rule_attribution
from tests.services.backtesting.lab.views import day


def _matches(*entries):
    return [
        {
            "rule_name": name,
            "matched": matched,
            "would_have_acted_action": "sell" if matched else None,
            "suppressed_by": suppressed,
        }
        for name, matched, suppressed in entries
    ]


def test_each_rule_is_counted_from_the_traces() -> None:
    days = [
        day(
            0,
            transfers=(("btc", "stable", 10.0),),
            details={
                "matched_rule_name": "exit",
                "portfolio_rule_matches": _matches(
                    ("exit", True, None), ("trim", True, "exit"), ("other", False, None)
                ),
            },
        ),
        day(
            1,
            details={
                "matched_rule_name": "trim",
                "portfolio_rule_matches": _matches(
                    ("exit", False, None), ("trim", True, None)
                ),
                "cooldown_skipped_rules": [{"rule": "exit"}, {"rule": "unknown"}],
            },
        ),
    ]

    stats = rule_attribution(days, ["exit", "trim", "other"]).rules

    assert stats["exit"] == RuleStats(
        matches=1, wins=1, trades=1, shadowed=0, cooldown_skips=1
    )
    assert stats["trim"] == RuleStats(
        matches=2, wins=1, trades=0, shadowed=1, cooldown_skips=0
    )
    assert stats["other"] == RuleStats()


def test_a_decision_by_something_else_credits_no_rule() -> None:
    days = [day(0, details={"matched_rule_name": "regime_no_signal_hold"})]

    stats = rule_attribution(days, ["exit"]).rules

    assert stats["exit"] == RuleStats()


def test_overlay_adjustments_are_counted_by_name() -> None:
    days = [
        day(0, details={"post_intent_adjustments": ["trend_guard_force_exit"]}),
        day(
            1,
            details={
                "post_intent_adjustments": [
                    "trend_guard_block_adds",
                    "trend_guard_force_exit",
                ]
            },
        ),
        day(2),
    ]

    attribution = rule_attribution(days, [])

    assert attribution.adjustments == {
        "trend_guard_force_exit": 2,
        "trend_guard_block_adds": 1,
    }
    assert attribution.as_dict()["adjustments"] == {
        "trend_guard_block_adds": 1,
        "trend_guard_force_exit": 2,
    }


def test_attribution_serializes() -> None:
    attribution = rule_attribution([day(0)], ["exit"])

    assert attribution.as_dict() == {
        "rules": {
            "exit": {
                "matches": 0,
                "wins": 0,
                "trades": 0,
                "shadowed": 0,
                "cooldown_skips": 0,
            }
        },
        "adjustments": {},
    }

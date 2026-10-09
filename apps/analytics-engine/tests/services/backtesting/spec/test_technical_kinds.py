"""The research rule kinds: ``technical_trim`` and ``technical_add``.

They are the spec form of the twelve research rules the old ``enabled_rules``
universe held. Whatever the old table could say, a spec can, and every number the
old rules carried is a field the spec states.
"""

from __future__ import annotations

import copy
from dataclasses import replace
from typing import Any

import pytest

from src.services.backtesting.lab import pointers
from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.liveness import (
    DEAD,
    UNPROBED,
    liveness,
    tunable_leaves,
)
from src.services.backtesting.portfolio_rules.technical_experiments import (
    TECHNICAL_EXPERIMENT_RULES,
    TechnicalDcaBuyRule,
    TechnicalDcaSellRule,
)
from src.services.backtesting.spec import (
    StrategySpec,
    behavior_hash,
    compile_spec,
    parse_spec,
)
from tests.services.backtesting.spec.helpers import (
    issues_for,
    reference_raw,
    technical_rules,
)

FIRST_RESEARCH_RULE = 6  # the reference has six rules


def _raw_with(*names: str) -> dict[str, Any]:
    raw = reference_raw()
    research = technical_rules()
    raw["rules"] = [*raw["rules"], *(research[name] for name in names)]
    return raw


def _spec_with(*names: str) -> StrategySpec:
    return parse_spec(_raw_with(*names))


def test_the_research_rule_fixture_is_a_fresh_copy_each_time() -> None:
    first = technical_rules()
    first["breakout_20d_dca_buy"]["trigger"].clear()

    assert technical_rules()["breakout_20d_dca_buy"]["trigger"] == {
        "signal": "breakout_20d"
    }


def test_the_helper_lists_the_old_table_in_priority_order() -> None:
    assert list(technical_rules()) == [rule.name for rule in TECHNICAL_EXPERIMENT_RULES]


def test_the_twelve_research_rules_compile_to_the_rules_the_old_table_holds() -> None:
    components = compile_spec(_spec_with(*technical_rules()))

    compiled = components.rules[FIRST_RESEARCH_RULE:]
    assert len(compiled) == len(TECHNICAL_EXPERIMENT_RULES) == 12
    for rule, legacy in zip(compiled, TECHNICAL_EXPERIMENT_RULES, strict=True):
        # Priority is the position in the spec and the description is generated
        # from the signal; nothing the rule does differs.
        assert (
            replace(rule, priority=legacy.priority, description=legacy.description)
            == legacy
        )


def test_a_trim_becomes_a_sell_rule_and_an_add_becomes_a_buy_rule() -> None:
    compiled = compile_spec(_spec_with(*technical_rules())).rules[FIRST_RESEARCH_RULE:]

    kinds = {
        name: type(rule) for name, rule in zip(technical_rules(), compiled, strict=True)
    }
    for name, rule in technical_rules().items():
        expected = (
            TechnicalDcaSellRule
            if rule["kind"] == "technical_trim"
            else TechnicalDcaBuyRule
        )
        assert kinds[name] is expected, name


def test_the_numbers_a_rule_states_are_the_numbers_it_runs_with() -> None:
    raw = _raw_with("rsi_overbought_dca_sell", "breakout_20d_dca_buy")
    trim, add = raw["rules"][FIRST_RESEARCH_RULE:]
    trim.update(cooldown_days=3, sell_step=0.2)
    trim["trigger"]["rsi_at_least"] = 62.5
    trim["proceeds"] = {
        "to": [{"asset": "BTC", "share": 0.25}, {"asset": "SPY", "share": 0.5}]
    }
    add.update(cooldown_days=11, buy_step=0.15)

    sell, buy = compile_spec(parse_spec(raw)).rules[FIRST_RESEARCH_RULE:]

    assert isinstance(sell, TechnicalDcaSellRule) and isinstance(
        buy, TechnicalDcaBuyRule
    )
    assert (sell.cooldown_days, sell.sell_step) == (3, 0.2)
    assert sell.predicate.rsi_at_least == 62.5  # type: ignore[attr-defined]
    assert sell.proceeds.to == (("BTC", 0.25), ("SPY", 0.5))
    assert (buy.cooldown_days, buy.buy_step) == (11, 0.15)


def test_a_rule_without_a_description_in_the_spec_is_described_by_its_signal() -> None:
    rules = compile_spec(
        _spec_with("rsi_overbought_dca_sell", "breakout_20d_dca_buy")
    ).rules

    assert rules[FIRST_RESEARCH_RULE].description == (
        "Research-only trim on the rsi_overbought_turning_down signal."
    )
    assert rules[FIRST_RESEARCH_RULE + 1].description == (
        "Research-only buy on the breakout_20d signal."
    )


def test_a_trigger_level_is_behavior_and_changes_the_hash() -> None:
    base = _raw_with("rsi_overbought_dca_sell")
    moved = copy.deepcopy(base)
    moved["rules"][FIRST_RESEARCH_RULE]["trigger"]["rsi_at_least"] = 65.0
    described = copy.deepcopy(base)
    described["description"] = "Something else entirely."

    assert behavior_hash(parse_spec(moved)) != behavior_hash(parse_spec(base))
    assert behavior_hash(parse_spec(described)) == behavior_hash(parse_spec(base))


def _issue_codes(raw: dict[str, Any]) -> dict[str, str]:
    return {issue.pointer: issue.code for issue in issues_for(raw)}


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (
            lambda rule: rule["trigger"].update(rsi_at_least=100.0),
            {"/rules/6/trigger/rsi_at_least": "less_than"},
        ),
        (
            lambda rule: rule["trigger"].update(rsi_at_least=0.0),
            {"/rules/6/trigger/rsi_at_least": "greater_than"},
        ),
        (
            lambda rule: rule["trigger"].update(oops=1),
            {"/rules/6/trigger/oops": "extra_forbidden"},
        ),
        (
            lambda rule: rule["trigger"].pop("rsi_at_least"),
            {"/rules/6/trigger/rsi_at_least": "missing"},
        ),
        (
            lambda rule: rule["trigger"].update(signal="astrology"),
            {"/rules/6/trigger": "union_tag_invalid"},
        ),
        (
            lambda rule: rule["trigger"].pop("signal"),
            {"/rules/6/trigger": "union_tag_not_found"},
        ),
        (
            lambda rule: rule.pop("trigger"),
            {"/rules/6/trigger": "missing"},
        ),
        (
            lambda rule: rule.pop("proceeds"),
            {"/rules/6/proceeds": "missing"},
        ),
        (
            lambda rule: rule.update(sell_step=0.0),
            {"/rules/6/sell_step": "greater_than"},
        ),
        (
            lambda rule: rule.update(
                proceeds={
                    "to": [
                        {"asset": "SPY", "share": 0.3},
                        {"asset": "SPY", "share": 0.3},
                    ]
                }
            ),
            {"/rules/6/proceeds/to": "duplicate_proceeds_asset"},
        ),
        (
            lambda rule: rule.update(
                proceeds={
                    "to": [
                        {"asset": "SPY", "share": 0.7},
                        {"asset": "BTC", "share": 0.7},
                    ]
                }
            ),
            {"/rules/6/proceeds/to": "proceeds_exceed_one"},
        ),
    ],
    ids=[
        "level-too-high",
        "level-too-low",
        "unknown-key",
        "missing-key",
        "unknown-signal",
        "missing-signal",
        "missing-trigger",
        "missing-proceeds",
        "no-step",
        "proceeds-repeat-an-asset",
        "proceeds-exceed-one",
    ],
)
def test_a_bad_trim_points_at_the_fault(mutate: Any, expected: dict[str, str]) -> None:
    raw = _raw_with("rsi_overbought_dca_sell")
    mutate(raw["rules"][FIRST_RESEARCH_RULE])

    assert _issue_codes(raw) == expected


def test_a_bad_add_points_at_the_fault() -> None:
    raw = _raw_with("breakout_20d_dca_buy")
    raw["rules"][FIRST_RESEARCH_RULE]["buy_step"] = 1.5
    raw["rules"][FIRST_RESEARCH_RULE]["proceeds"] = {"to": []}

    assert _issue_codes(raw) == {
        "/rules/6/buy_step": "less_than_equal",
        "/rules/6/proceeds": "extra_forbidden",
    }


def test_a_research_rule_cannot_reuse_an_id() -> None:
    raw = _raw_with("rsi_overbought_dca_sell", "breakout_20d_dca_buy")
    raw["rules"][FIRST_RESEARCH_RULE + 1]["id"] = "rsi_overbought_dca_sell"
    raw["rules"][0]["id"] = "rsi_overbought_dca_sell"

    assert _issue_codes(raw) == {
        "/rules/6/id": "duplicate_id",
        "/rules/7/id": "duplicate_id",
    }


def test_the_same_signal_may_drive_both_a_trim_and_an_add() -> None:
    raw = _raw_with("breakout_20d_dca_buy")
    trim = {**technical_rules()["breakdown_20d_dca_sell"], "id": "trim_on_breakout"}
    trim["trigger"] = {"signal": "breakout_20d"}
    raw["rules"].append(trim)

    spec = parse_spec(raw)

    assert [rule.kind for rule in spec.rules[FIRST_RESEARCH_RULE:]] == [
        "technical_add",
        "technical_trim",
    ]


def test_every_level_of_a_research_rule_is_a_tunable_leaf() -> None:
    spec = _spec_with(*technical_rules())

    leaves = {leaf.pointer: leaf.value for leaf in tunable_leaves(spec)}

    assert leaves["/rules[rsi_overbought_dca_sell]/trigger/rsi_at_least"] == 70.0
    assert leaves["/rules[rsi_oversold_recovery_dca_buy]/trigger/rsi_at_most"] == 35.0
    assert (
        leaves["/rules[momentum_breakdown_dca_sell]/trigger/short_momentum_below"]
        == 0.0
    )
    assert (
        leaves["/rules[momentum_breakdown_dca_sell]/trigger/long_momentum_above"] == 0.0
    )
    assert leaves["/rules[volatility_spike_dca_sell]/trigger/thresholds/BTC"] == 0.80
    assert (
        leaves["/rules[bollinger_upper_band_dca_sell]/trigger/zscore_at_least"] == 2.0
    )
    assert leaves["/rules[bollinger_lower_band_dca_buy]/trigger/zscore_at_most"] == -2.0
    assert leaves["/rules[breakout_20d_dca_buy]/buy_step"] == 0.05
    assert leaves["/rules[breakdown_20d_dca_sell]/sell_step"] == 0.05
    assert leaves["/rules[breakdown_20d_dca_sell]/proceeds/to/0/share"] == 0.5
    # A signal with no level has nothing to tune but the rule around it.
    assert not [
        p for p in leaves if p.startswith("/rules[macd_bearish_cross_dca_sell]/trigger")
    ]
    raw = _spec_with(*technical_rules()).model_dump(mode="json")
    for pointer, value in leaves.items():
        assert pointers.get(raw, pointer) == value


def test_a_search_can_move_a_trigger_level() -> None:
    from src.services.backtesting.lab.sweep import SpaceError, check_space, parse_space

    spec = _spec_with("rsi_overbought_dca_sell")
    pointer = "/rules[rsi_overbought_dca_sell]/trigger/rsi_at_least"

    check_space(
        parse_space({"parameters": [{"pointer": pointer, "values": [60, 70, 80]}]}),
        spec,
    )
    with pytest.raises(SpaceError, match="not a tunable leaf"):
        check_space(
            parse_space(
                {
                    "parameters": [
                        {
                            "pointer": "/rules[rsi_overbought_dca_sell]/trigger/signal",
                            "values": ["x"],
                        }
                    ]
                }
            ),
            spec,
        )


def test_every_level_a_trigger_states_changes_what_the_rule_does() -> None:
    """Perturbing a level on real-looking history must change some decision.

    A level that moved nothing would be a field the spec states and the engine
    ignores. The rules below fire on the synthetic histories; the zero-valued
    momentum levels are the reason the liveness check moves a zero by a tenth of
    its span.
    """
    names = [
        "rsi_overbought_dca_sell",
        "rsi_oversold_recovery_dca_buy",
        "momentum_breakdown_dca_sell",
        "volatility_spike_dca_sell",
        "bollinger_upper_band_dca_sell",
        "bollinger_lower_band_dca_buy",
    ]
    spec = _spec_with(*names)
    bundles = {
        "regimes": synthetic_bundle("synthetic:regimes?seed=1&days=400"),
        "stress": synthetic_bundle("synthetic:stress?seed=2&days=400"),
    }

    report = liveness(
        spec,
        bundles,
        {"regimes"},
        only=[f"/rules[{name}]/trigger" for name in names],
    )

    statuses = {leaf.pointer: leaf.status for leaf in report.leaves}
    assert len(statuses) == 9
    assert DEAD not in statuses.values() and UNPROBED not in statuses.values(), statuses

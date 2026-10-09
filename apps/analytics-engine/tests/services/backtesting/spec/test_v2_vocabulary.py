"""The knobs and kinds added after the reference was locked.

They are additive. A spec written before they existed keeps its hash and its
behavior, because a knob at its default is left out of the canonical form and its
default is what the strategy always did. A spec that uses one is a different
strategy with a hash of its own.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

from src.services.backtesting.lab.liveness import tunable_leaves
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.portfolio_rules.fgi_downshift_dca_sell import (
    FgiDownshiftDcaSellRule,
)
from src.services.backtesting.portfolio_rules.technical_experiments import (
    TechnicalDcaSellRule,
)
from src.services.backtesting.portfolio_rules.trend_dca_entry import TrendDcaEntryRule
from src.services.backtesting.portfolio_rules.trend_guard import TrendGuardRule
from src.services.backtesting.sizing import FlatSizing, RelativeSizing
from src.services.backtesting.spec import (
    behavior_hash,
    canonical_json,
    compile_spec,
    load_spec,
    parse_spec,
)
from tests.services.backtesting.spec.helpers import (
    REFERENCE_REF,
    issues_for,
    reference_raw,
    rule_index,
    technical_rules,
    v2_raw,
    with_value,
)

# What a spec that predates the knobs would have to say, spelled out.
SPELLED_DEFAULTS: list[Callable[[dict[str, Any]], None]] = [
    lambda raw: raw["rules"][rule_index(raw, "dma_cross_down_exit")].update(
        cooldown_scope="rule"
    ),
    lambda raw: raw["rules"][rule_index(raw, "dma_cross_up_rebalance")].update(
        allocation="equal_weight"
    ),
    lambda raw: raw["rules"][rule_index(raw, "dma_overextension_trim")].update(
        sizing={"mode": "absolute"}
    ),
    lambda raw: raw["rules"][rule_index(raw, "fgi_downshift_trim")].update(
        sizing={"mode": "absolute"}
    ),
]
# The same knobs, used.
CHANGED_KNOBS: list[Callable[[dict[str, Any]], None]] = [
    lambda raw: raw["rules"][rule_index(raw, "dma_cross_down_exit")].update(
        cooldown_scope="trigger_symbol"
    ),
    lambda raw: raw["rules"][rule_index(raw, "dma_cross_up_rebalance")].update(
        allocation="deploy_stable"
    ),
    lambda raw: raw["rules"][rule_index(raw, "dma_overextension_trim")].update(
        sizing={"mode": "relative", "floor_weight": 0.1}
    ),
    lambda raw: raw["rules"][rule_index(raw, "fgi_downshift_trim")].update(
        sizing={"mode": "relative", "floor_weight": 0.1}
    ),
    lambda raw: raw["overlays"].append(
        {
            "kind": "trend_guard",
            "id": "trend_guard",
            "mode": "block_adds",
            "below_dma_buffer": 0.02,
            "confirm_days": 3,
        }
    ),
    lambda raw: raw["rules"].append(
        {
            "kind": "trend_dca_entry",
            "id": "trend_dca_entry",
            "cooldown_days": 7,
            "buy_step": 0.1,
            "max_weight": 0.5,
        }
    ),
]


def _pointers(raw: dict[str, Any]) -> list[tuple[str, str]]:
    return [(issue.pointer, issue.code) for issue in issues_for(raw)]


def test_the_reference_canonical_form_mentions_none_of_the_later_knobs() -> None:
    canonical = canonical_json(load_spec(REFERENCE_REF))

    for knob in (
        "cooldown_scope",
        "allocation",
        "sizing",
        "trend_dca_entry",
        "trend_guard",
    ):
        assert knob not in canonical


@pytest.mark.parametrize("spell", SPELLED_DEFAULTS)
def test_spelling_out_a_default_is_the_same_strategy(
    spell: Callable[[dict[str, Any]], None],
) -> None:
    raw = reference_raw()
    spell(raw)

    assert behavior_hash(parse_spec(raw)) == behavior_hash(load_spec(REFERENCE_REF))


@pytest.mark.parametrize("use", CHANGED_KNOBS)
def test_using_a_knob_is_a_different_strategy(
    use: Callable[[dict[str, Any]], None],
) -> None:
    raw = reference_raw()
    use(raw)

    assert behavior_hash(parse_spec(raw)) != behavior_hash(load_spec(REFERENCE_REF))


def test_a_spec_that_omits_the_knobs_reads_them_at_their_defaults() -> None:
    spec = load_spec(REFERENCE_REF)
    by_id = {rule.id: rule for rule in spec.rules}

    assert by_id["cross_down_exit"].cooldown_scope == "rule"
    assert by_id["cross_up_equal_weight"].allocation == "equal_weight"
    assert by_id["dma_overextension_dca_sell"].sizing.mode == "absolute"
    assert by_id["fgi_downshift_dca_sell"].sizing.mode == "absolute"


def test_the_reference_compiles_to_the_rules_it_always_did() -> None:
    rules = {rule.name: rule for rule in compile_spec(load_spec(REFERENCE_REF)).rules}

    exit_rule = rules["cross_down_exit"]
    assert isinstance(exit_rule, CrossDownExitRule)
    assert exit_rule.cooldown_keyed_by_trigger_symbol is False
    cross_up = rules["cross_up_equal_weight"]
    assert isinstance(cross_up, CrossUpEqualWeightRule)
    assert cross_up.deploy_stable_only is False
    for name in ("dma_overextension_dca_sell", "fgi_downshift_dca_sell"):
        trim = rules[name]
        assert isinstance(trim, DmaOverextensionDcaSellRule | FgiDownshiftDcaSellRule)
        assert trim.sizing == FlatSizing()


def test_the_v2_fixture_compiles_every_knob_and_kind() -> None:
    components = compile_spec(parse_spec(v2_raw()))
    rules = {rule.name: rule for rule in components.rules}

    assert rules["cross_down_exit"].cooldown_keyed_by_trigger_symbol is True
    assert rules["cross_up_equal_weight"].deploy_stable_only is True
    for name in ("dma_overextension_dca_sell", "fgi_downshift_dca_sell"):
        assert rules[name].sizing == RelativeSizing(floor_weight=0.1)
    entry = rules["trend_dca_entry"]
    assert isinstance(entry, TrendDcaEntryRule)
    assert (entry.cooldown_days, entry.buy_step, entry.max_weight) == (7, 0.1, 0.5)
    guard = rules["trend_guard"]
    assert isinstance(guard, TrendGuardRule)
    assert (guard.mode, guard.below_dma_buffer, guard.confirm_days) == (
        "force_exit",
        0.02,
        3,
    )


def test_overlays_follow_the_rules_in_the_order_listed() -> None:
    names = [rule.name for rule in compile_spec(parse_spec(v2_raw())).rules]

    assert names[-3:] == ["trend_dca_entry", "spy_latch", "trend_guard"]


def test_a_technical_trim_can_be_sized_by_the_position() -> None:
    raw = reference_raw()
    trim = technical_rules()["rsi_bearish_divergence_dca_sell"]
    trim["sizing"] = {"mode": "relative", "floor_weight": 0.2}
    raw["rules"].append(trim)

    rule = compile_spec(parse_spec(raw)).rules[-1]

    assert isinstance(rule, TechnicalDcaSellRule)
    assert rule.sizing == RelativeSizing(floor_weight=0.2)


def test_the_filled_form_of_a_spec_parses_back_to_the_same_strategy() -> None:
    spec = parse_spec(v2_raw())

    again = parse_spec(spec.model_dump(mode="json"))

    assert again == spec
    assert behavior_hash(again) == behavior_hash(spec)


def test_a_sizing_floor_is_a_share_below_one() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_overextension_trim")

    with_value(
        raw, ("rules", index, "sizing"), {"mode": "relative", "floor_weight": 1.0}
    )

    assert _pointers(raw) == [(f"/rules/{index}/sizing/floor_weight", "less_than")]


def test_a_relative_sizing_must_state_its_floor() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_overextension_trim")

    with_value(raw, ("rules", index, "sizing"), {"mode": "relative"})

    assert _pointers(raw) == [(f"/rules/{index}/sizing/floor_weight", "missing")]


def test_an_unknown_sizing_mode_points_at_the_sizing() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_overextension_trim")

    with_value(raw, ("rules", index, "sizing"), {"mode": "fractional"})

    assert _pointers(raw) == [(f"/rules/{index}/sizing", "union_tag_invalid")]


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("confirm_days", 0, "greater_than_equal"),
        ("confirm_days", 61, "less_than_equal"),
        ("below_dma_buffer", -0.01, "greater_than_equal"),
        ("below_dma_buffer", 0.6, "less_than_equal"),
        ("mode", "sell_everything", "literal_error"),
    ],
)
def test_the_trend_guard_refuses_out_of_range_values(
    field: str, value: Any, code: str
) -> None:
    raw = v2_raw()

    with_value(raw, ("overlays", 1, field), value)

    assert _pointers(raw) == [(f"/overlays/1/{field}", code)]


def test_an_unknown_overlay_kind_points_at_the_overlay() -> None:
    raw = v2_raw()

    with_value(raw, ("overlays", 1, "kind"), "moon_phase")

    assert _pointers(raw) == [("/overlays/1", "union_tag_invalid")]


def test_the_two_overlay_kinds_may_sit_together_but_not_twice() -> None:
    assert issues_for(v2_raw()) == []
    raw = v2_raw()
    raw["overlays"].append({**raw["overlays"][1], "id": "another_guard"})

    assert _pointers(raw) == [("/overlays/2", "duplicate_overlay")]


def test_an_overlay_cannot_reuse_a_rule_id() -> None:
    raw = v2_raw()

    with_value(raw, ("overlays", 1, "id"), "trend_dca_entry")

    assert _pointers(raw) == [("/overlays/1/id", "duplicate_id")]


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("max_weight", 0.0, "greater_than"),
        ("max_weight", 1.5, "less_than_equal"),
        ("buy_step", 0.0, "greater_than"),
        ("cooldown_days", -1, "greater_than_equal"),
    ],
)
def test_a_trend_entry_refuses_out_of_range_values(
    field: str, value: Any, code: str
) -> None:
    raw = v2_raw()
    index = rule_index(raw, "trend_dca_entry")

    with_value(raw, ("rules", index, field), value)

    assert _pointers(raw) == [(f"/rules/{index}/{field}", code)]


def test_every_number_the_new_kinds_add_is_a_tunable_leaf() -> None:
    leaves = {leaf.pointer for leaf in tunable_leaves(parse_spec(v2_raw()))}

    assert {
        "/rules[dma_overextension_dca_sell]/sizing/floor_weight",
        "/rules[fgi_downshift_dca_sell]/sizing/floor_weight",
        "/rules[trend_dca_entry]/cooldown_days",
        "/rules[trend_dca_entry]/buy_step",
        "/rules[trend_dca_entry]/max_weight",
        "/overlays[trend_guard]/below_dma_buffer",
        "/overlays[trend_guard]/confirm_days",
    } <= leaves

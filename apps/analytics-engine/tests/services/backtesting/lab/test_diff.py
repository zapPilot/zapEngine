from __future__ import annotations

import pytest

from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.diff import (
    behavior_changed,
    compare_on_bundle,
    spec_diff,
)
from src.services.backtesting.lab.evaluate import EvalConfig
from src.services.backtesting.spec import load_spec, parse_spec
from tests.services.backtesting.spec.helpers import (
    reference_raw,
    rule_index,
    with_value,
)

TREND_GUARD = {
    "kind": "trend_guard",
    "id": "trend_guard",
    "mode": "block_adds",
    "below_dma_buffer": 0.02,
    "confirm_days": 3,
}


def _changes(raw):
    return [
        change.as_dict()
        for change in spec_diff(load_spec("reference/dma_fgi"), parse_spec(raw))
    ]


def _pointers(raw):
    return [(item["pointer"], item["kind"]) for item in _changes(raw)]


def test_identical_specs_differ_nowhere() -> None:
    spec = load_spec("reference/dma_fgi")

    assert spec_diff(spec, spec) == []
    assert not behavior_changed(spec, spec)


def test_a_changed_number_is_one_change_addressed_by_rule_name() -> None:
    raw = with_value(reference_raw(), ("rules", 0, "cooldown_days"), 21)

    assert _changes(raw) == [
        {
            "pointer": "/rules[cross_down_exit]/cooldown_days",
            "kind": "changed",
            "before": 30,
            "after": 21,
        }
    ]


def test_nested_objects_are_walked() -> None:
    raw = with_value(
        reference_raw(), ("signals", "dma", "cross_cooldown_days", "SPY"), 9
    )

    assert _pointers(raw) == [("/signals/dma/cross_cooldown_days/SPY", "changed")]


def test_a_list_that_is_not_keyed_changes_as_a_whole() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_cross_down_exit")
    raw["rules"][index]["peer_groups"] = [["SPY", "BTC", "ETH"]]

    [change] = _changes(raw)

    assert change["pointer"] == "/rules[cross_down_exit]/peer_groups"
    assert change["before"] == [["SPY"], ["BTC", "ETH"]]
    assert change["after"] == [["SPY", "BTC", "ETH"]]


def test_a_removed_rule_is_one_removal() -> None:
    raw = reference_raw()
    del raw["rules"][-1]

    changes = _changes(raw)

    assert [(item["pointer"], item["kind"]) for item in changes] == [
        ("/rules[fgi_downshift_dca_sell]", "removed")
    ]
    assert changes[0]["before"]["kind"] == "fgi_downshift_trim"


def test_an_added_rule_and_overlay() -> None:
    raw = reference_raw()
    raw["rules"].append({**raw["rules"][1], "id": "second_rebalance"})
    raw["overlays"] = [TREND_GUARD]

    assert _pointers(raw) == [
        ("/overlays[trend_guard]", "added"),
        ("/rules[second_rebalance]", "added"),
    ]


def test_moving_a_rule_is_one_reordering_not_a_cascade() -> None:
    raw = reference_raw()
    raw["rules"] = [raw["rules"][1], raw["rules"][0], *raw["rules"][2:]]

    [change] = _changes(raw)

    assert change["pointer"] == "/rules"
    assert change["kind"] == "reordered"
    assert change["before"][:2] == ["cross_down_exit", "cross_up_equal_weight"]
    assert change["after"][:2] == ["cross_up_equal_weight", "cross_down_exit"]


def test_adding_a_rule_does_not_count_as_reordering() -> None:
    raw = reference_raw()
    raw["rules"].insert(0, {**raw["rules"][1], "id": "second_rebalance"})

    assert _pointers(raw) == [("/rules[second_rebalance]", "added")]


def test_a_removed_and_a_changed_spec_key_are_both_reported() -> None:
    other = parse_spec({**reference_raw(), "description": "Said differently."})

    changes = spec_diff(load_spec("reference/dma_fgi"), other)

    assert [(c.pointer, c.kind) for c in changes] == [("/description", "changed")]
    assert not behavior_changed(load_spec("reference/dma_fgi"), other)


def test_a_behavior_change_is_flagged() -> None:
    other = parse_spec(with_value(reference_raw(), ("rules", 0, "cooldown_days"), 21))

    assert behavior_changed(load_spec("reference/dma_fgi"), other)


def test_keys_missing_on_one_side_are_added_or_removed() -> None:
    base = {"a": 1, "b": 2}
    candidate = {"b": 2, "c": 3}
    from src.services.backtesting.lab import diff as diff_module

    changes: list = []
    diff_module._diff_object("", base, candidate, changes)

    assert [(c.pointer, c.kind) for c in changes] == [
        ("/a", "removed"),
        ("/c", "added"),
    ]


@pytest.fixture(scope="module")
def bundle():
    return synthetic_bundle("synthetic:stress?seed=2&days=300")


def test_the_same_spec_never_parts_ways(bundle) -> None:
    spec = load_spec("reference/dma_fgi")

    result = compare_on_bundle(spec, spec, bundle)

    assert result["first_divergence"] is None
    assert result["days_differing"] == 0
    assert result["roi_pp"] == 0
    assert result["days"] == 300


def test_a_change_is_followed_to_the_first_day_it_decides_differently(bundle) -> None:
    base = load_spec("reference/dma_fgi")
    raw = reference_raw()
    raw["rules"] = [rule for rule in raw["rules"] if rule["id"] != "cross_down_exit"]
    candidate = parse_spec(raw)

    result = compare_on_bundle(base, candidate, bundle)

    divergence = result["first_divergence"]
    assert divergence["date"] >= "2025-01-01"
    assert divergence["base"]["rule"] == "cross_down_exit"
    assert divergence["candidate"]["rule"] != "cross_down_exit"
    assert result["days_differing"] > 0
    assert result["roi_pp"] == pytest.approx(
        result["candidate"]["roi_percent"] - result["base"]["roi_percent"], abs=1e-5
    )
    assert result["base"]["ref"].startswith("dma_fgi@1#")


def test_the_comparison_follows_the_window(bundle) -> None:
    spec = load_spec("reference/dma_fgi")
    config = EvalConfig(start=bundle.manifest.start.replace(month=3, day=1))

    result = compare_on_bundle(spec, spec, bundle, config)

    assert result["days"] < 300

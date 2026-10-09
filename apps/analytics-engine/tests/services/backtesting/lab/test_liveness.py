from __future__ import annotations

import pytest

from src.services.backtesting.lab import liveness as liveness_module
from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.liveness import (
    DEAD,
    DORMANT,
    LIVE,
    UNPROBED,
    Leaf,
    LeafResult,
    NoDaysError,
    liveness,
    perturbations,
    probes,
    tunable_leaves,
)
from src.services.backtesting.spec import load_spec, parse_spec
from src.services.backtesting.spec.validation import SpecError
from tests.services.backtesting.spec.helpers import reference_raw

REFERENCE_LEAVES = [
    "/signals/dma/cross_cooldown_days/SPY",
    "/signals/dma/cross_cooldown_days/BTC",
    "/signals/dma/cross_cooldown_days/ETH",
    "/signals/dma/cross_on_touch",
    "/signals/ratio/cross_cooldown_days",
    "/rules[cross_down_exit]/cooldown_days",
    "/rules[cross_up_equal_weight]/cooldown_days",
    "/rules[eth_btc_ratio_rotation]/cooldown_days",
    "/rules[eth_btc_deviation_dca]/tiers/0/threshold",
    "/rules[eth_btc_deviation_dca]/tiers/0/rotation_fraction",
    "/rules[eth_btc_deviation_dca]/tiers/0/cooldown_days",
    "/rules[eth_btc_deviation_dca]/tiers/1/threshold",
    "/rules[eth_btc_deviation_dca]/tiers/1/rotation_fraction",
    "/rules[eth_btc_deviation_dca]/tiers/1/cooldown_days",
    "/rules[dma_overextension_dca_sell]/cooldown_days",
    "/rules[dma_overextension_dca_sell]/sell_step",
    "/rules[dma_overextension_dca_sell]/thresholds/SPY",
    "/rules[dma_overextension_dca_sell]/thresholds/BTC",
    "/rules[dma_overextension_dca_sell]/thresholds/ETH",
    "/rules[dma_overextension_dca_sell]/fgi_multipliers/extreme_fear",
    "/rules[dma_overextension_dca_sell]/fgi_multipliers/fear",
    "/rules[dma_overextension_dca_sell]/fgi_multipliers/neutral",
    "/rules[dma_overextension_dca_sell]/fgi_multipliers/greed",
    "/rules[dma_overextension_dca_sell]/fgi_multipliers/extreme_greed",
    "/rules[dma_overextension_dca_sell]/proceeds/to/0/share",
    "/rules[fgi_downshift_dca_sell]/cooldown_days",
    "/rules[fgi_downshift_dca_sell]/sell_step",
]


@pytest.fixture(scope="module")
def spec():
    return load_spec("reference/dma_fgi")


def test_the_reference_exposes_exactly_its_behavior_knobs(spec) -> None:
    leaves = tunable_leaves(spec)

    assert [leaf.pointer for leaf in leaves] == REFERENCE_LEAVES


def test_a_leaf_carries_its_value_and_bounds(spec) -> None:
    by_pointer = {leaf.pointer: leaf for leaf in tunable_leaves(spec)}

    cooldown = by_pointer["/rules[cross_down_exit]/cooldown_days"]
    threshold = by_pointer["/rules[dma_overextension_dca_sell]/thresholds/SPY"]
    flag = by_pointer["/signals/dma/cross_on_touch"]

    assert (cooldown.value, cooldown.low, cooldown.high) == (30, 0.0, 365.0)
    assert (cooldown.low_open, cooldown.high_open) == (False, False)
    assert (threshold.low, threshold.low_open, threshold.high) == (0.0, True, 10.0)
    assert (flag.value, flag.low, flag.high) == (True, None, None)


def test_overlays_and_guards_are_tunable_when_present() -> None:
    raw = reference_raw()
    raw["overlays"] = [
        {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 14}
    ]
    raw["guards"] = [
        {
            "kind": "trade_quota",
            "min_trade_interval_days": 3,
            "max_trades_7d": None,
            "max_trades_30d": 8,
        }
    ]

    pointers_ = [leaf.pointer for leaf in tunable_leaves(parse_spec(raw))]

    assert "/overlays[spy_latch]/follow_through_days" in pointers_
    assert "/guards[trade_quota]/min_trade_interval_days" in pointers_
    assert "/guards[trade_quota]/max_trades_30d" in pointers_
    assert "/guards[trade_quota]/max_trades_7d" not in pointers_


def _leaf(value, **bounds) -> Leaf:
    return Leaf("/x", value, **bounds)


@pytest.mark.parametrize(
    ("leaf", "expected"),
    [
        (_leaf(30, low=0.0, high=365.0), {"down": 15, "up": 60}),
        (_leaf(0, low=0.0, high=365.0), {"up": 1}),
        (_leaf(1, low=0.0, high=365.0), {"down": 0, "up": 2}),
        (_leaf(300, low=0.0, high=365.0), {"down": 150, "up": 365}),
        (_leaf(365, low=0.0, high=365.0), {"down": 182}),
        (_leaf(0.5, low=0.0, low_open=True, high=1.0), {"down": 0.25, "up": 0.75}),
        (_leaf(1.5, low=0.0, high=2.0), {"down": 0.75, "up": 2.0}),
        (_leaf(2.0, low=0.0, high=2.0), {"down": 1.0}),
        (_leaf(True), {"flip": False}),
        (_leaf(False), {"flip": True}),
        (_leaf(1, low=0.0, low_open=True), {"up": 2}),
        (_leaf(2e-6, low=0.0, low_open=True, high=1.0), {"down": 1e-06, "up": 3e-06}),
        # Rounded to six decimals both candidates land on the open bound.
        (_leaf(1e-7, low=0.0, low_open=True, high=1.0), {}),
        (_leaf(5.0, high=6.0, high_open=True), {"down": 2.5, "up": 5.5}),
        (_leaf(5, high=6.0, high_open=True), {"down": 2}),
        (_leaf(5, low=4.0), {"down": 4, "up": 10}),
    ],
)
def test_perturbations_stay_inside_the_bounds(leaf: Leaf, expected: dict) -> None:
    assert perturbations(leaf) == expected


def test_a_value_pinned_at_a_bound_has_nowhere_to_go() -> None:
    assert perturbations(_leaf(0.0, low=0.0, high=0.0)) == {}


def test_every_probe_is_a_valid_spec_or_says_why_not(spec) -> None:
    found = probes(spec)

    valid = [probe for probe in found if probe.spec is not None]
    invalid = [probe for probe in found if probe.spec is None]
    assert len(valid) > 40
    assert [(probe.leaf.pointer, probe.direction) for probe in invalid] == [
        ("/rules[eth_btc_deviation_dca]/tiers/0/threshold", "down"),
        ("/rules[eth_btc_deviation_dca]/tiers/1/threshold", "up"),
    ]
    assert "strongest tier first" in (invalid[0].invalid or "")


def test_probes_can_be_limited_to_a_pointer_prefix(spec) -> None:
    found = probes(
        spec, only=["/signals/dma/cross_on_touch", "/rules[cross_down_exit]"]
    )

    assert [(p.leaf.pointer, p.direction) for p in found] == [
        ("/signals/dma/cross_on_touch", "flip"),
        ("/rules[cross_down_exit]/cooldown_days", "down"),
        ("/rules[cross_down_exit]/cooldown_days", "up"),
    ]


def _result(statuses: dict[str, dict[str, int]], *, valid: bool = True) -> LeafResult:
    result = LeafResult("/x", 1)
    for direction, days in statuses.items():
        result.probes.append(
            {
                "direction": direction,
                "value": 2,
                "invalid": None if valid else "broken",
                "days_differing": days,
            }
        )
    return result


@pytest.mark.parametrize(
    ("probes_", "status", "one_sided"),
    [
        ({"down": {"main": 4}, "up": {"main": 2}}, LIVE, False),
        ({"down": {"main": 4}, "up": {"main": 0}}, LIVE, True),
        ({"flip": {"main": 4}}, LIVE, False),
        (
            {"down": {"main": 0, "stress": 3}, "up": {"main": 0, "stress": 0}},
            DORMANT,
            False,
        ),
        (
            {"down": {"main": 0, "stress": 0}, "up": {"main": 0, "stress": 0}},
            DEAD,
            False,
        ),
    ],
)
def test_a_leaf_is_live_dormant_or_dead_by_where_it_changes_decisions(
    probes_: dict, status: str, one_sided: bool
) -> None:
    result = _result(probes_)

    liveness_module._classify(result, {"main"})

    assert (result.status, result.one_sided) == (status, one_sided)


def test_a_leaf_whose_every_perturbation_is_invalid_is_unprobed() -> None:
    result = _result({"down": {}, "up": {}}, valid=False)

    liveness_module._classify(result, {"main"})

    assert result.status == UNPROBED


def test_a_leaf_without_any_perturbation_is_unprobed() -> None:
    result = LeafResult("/x", 0)

    liveness_module._classify(result, {"main"})

    assert result.status == UNPROBED
    assert result.as_dict()["probes"] == []


@pytest.fixture(scope="module")
def bundles():
    return {
        "regimes": synthetic_bundle("synthetic:regimes?seed=1&days=300"),
        "stress": synthetic_bundle("synthetic:stress?seed=6&days=400"),
    }


def test_the_reference_has_live_dormant_and_dead_knobs(spec, bundles) -> None:
    report = liveness(
        spec,
        bundles,
        {"regimes"},
        only=[
            "/signals/dma/cross_on_touch",
            "/signals/ratio",
            "/signals/dma/cross_cooldown_days/BTC",
            "/rules[cross_down_exit]",
        ],
    )

    status = {leaf.pointer: leaf for leaf in report.leaves}

    # A price touching its average is rare: only the stress history shows it.
    assert status["/signals/dma/cross_on_touch"].status == DORMANT
    # One cooldown already masks the other: nothing moves.
    assert status["/signals/ratio/cross_cooldown_days"].status == DEAD
    btc = status["/signals/dma/cross_cooldown_days/BTC"]
    assert (btc.status, btc.one_sided) == (LIVE, True)
    assert status["/rules[cross_down_exit]/cooldown_days"].status == LIVE
    assert report.counts == {LIVE: 2, DORMANT: 1, DEAD: 1, UNPROBED: 0}


def test_the_report_names_its_evidence(spec, bundles) -> None:
    report = liveness(spec, bundles, {"regimes"}, only=["/signals/dma/cross_on_touch"])

    dumped = report.as_dict()

    assert dumped["bundles"] == ["regimes", "stress"]
    assert dumped["primary"] == ["regimes"]
    assert dumped["days"] == {"regimes": 300, "stress": 400}
    assert dumped["summary"][DORMANT] == 1
    [leaf] = dumped["leaves"]
    assert leaf["pointer"] == "/signals/dma/cross_on_touch"
    [probe] = leaf["probes"]
    assert probe["direction"] == "flip" and probe["value"] is False
    assert probe["days_differing"] == {"regimes": 0, "stress": 108}


def test_a_knob_that_cannot_be_perturbed_is_listed_unprobed(spec, bundles) -> None:
    raw = reference_raw()
    for rule in raw["rules"]:
        if rule["kind"] == "dma_overextension_trim":
            rule["fgi_multipliers"]["extreme_fear"] = 0.0
    pinned = parse_spec(raw)

    report = liveness(
        pinned,
        {"regimes": bundles["regimes"]},
        {"regimes"},
        only=["/rules[dma_overextension_dca_sell]/fgi_multipliers/extreme_fear"],
    )

    [leaf] = report.leaves
    assert leaf.status == UNPROBED and leaf.probes == []


def test_a_variant_that_breaks_the_spec_is_not_run(
    spec, bundles, monkeypatch: pytest.MonkeyPatch
) -> None:
    def refuse(raw):
        raise SpecError([])

    monkeypatch.setattr(liveness_module, "parse_spec", refuse)

    report = liveness(
        spec,
        {"regimes": bundles["regimes"]},
        {"regimes"},
        only=["/rules[cross_down_exit]"],
    )

    [leaf] = report.leaves
    assert leaf.status == UNPROBED
    assert all(probe["invalid"] is not None for probe in leaf.probes)


def test_a_history_with_no_days_in_the_window_cannot_vouch_for_anything(
    spec, bundles
) -> None:
    from datetime import date

    from src.services.backtesting.lab.runner import EvalConfig

    empty_window = EvalConfig(start=date(2031, 1, 1), end=date(2031, 2, 1))

    with pytest.raises(NoDaysError, match="regimes has no days"):
        liveness(
            spec,
            {"regimes": bundles["regimes"]},
            {"regimes"},
            empty_window,
            only=["/rules[cross_down_exit]"],
        )

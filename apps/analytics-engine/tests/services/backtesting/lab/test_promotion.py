from __future__ import annotations

import copy
import json
from typing import Any

import pytest

from src.services.backtesting.lab.policy import POLICY_PATH, PromotionPolicy
from src.services.backtesting.lab.promotion import (
    FAIL,
    INSUFFICIENT,
    INSUFFICIENT_EVIDENCE,
    PASS,
    PROMOTABLE,
    REJECTED,
    Evidence,
    Gate,
    OwnChecks,
    evaluate_gates,
    verdict,
)

CANDIDATE = "sha256:candidate"
REFERENCE = "sha256:reference"
CANONICAL = "sha256:canonical-config"
ASSUMPTIONS = {"fill_lag_days": 1, "slippage_rate": 0.003, "stable_apr": 0.03}
CAPITAL = 10_000.0


def _policy(**sections: dict[str, Any]) -> PromotionPolicy:
    raw: dict[str, Any] = copy.deepcopy(json.loads(POLICY_PATH.read_text()))
    for name, changes in sections.items():
        raw[name].update(changes)
    return PromotionPolicy.model_validate(raw)


def _sweep(**overrides: Any) -> dict[str, Any]:
    sweep: dict[str, Any] = {
        "status": "ok",
        "sweep_id": "abc123",
        "fingerprint": {
            "spec": {"ref": "guarded@1#aaa", "behavior_hash": CANDIDATE},
            "reference": {"ref": "dma_fgi@1#bbb", "behavior_hash": REFERENCE},
            "bundle": {"ref": "prod:1", "content_sha256": "x", "source": "prod"},
            "eval_config_hash": CANONICAL,
            "space_hash": "s",
        },
        "folds": [
            {"index": index, "oos": {"edge_pp": 2.0, "max_drawdown_pp": 1.0}}
            for index in (1, 2, 3)
        ],
        "aggregate": {
            "fold_win_rate": 1.0,
            "mean_oos_edge_pp": 2.0,
            "oos_edge_annualized_pp": {"p_not_positive": 0.01},
        },
        "deflated_sharpe": {"value": 0.95, "trials": 5},
    }
    sweep.update(overrides)
    return sweep


def _look(**overrides: Any) -> dict[str, Any]:
    look: dict[str, Any] = {
        "lineage": "lin",
        "bundle": {"ref": "prod:2", "content_sha256": "y", "source": "prod"},
        "assumptions": dict(ASSUMPTIONS),
        "total_capital": CAPITAL,
        "window": {"days": 120},
        "candidate": {"ref": "guarded@1#aaa", "behavior_hash": CANDIDATE},
        "reference": {"ref": "dma_fgi@1#bbb", "behavior_hash": REFERENCE},
        "edge": {"roi_pp": 1.0, "max_drawdown_pp": 0.5, "sharpe": 0.2},
    }
    look.update(overrides)
    return look


def _own(**overrides: Any) -> OwnChecks:
    fields: dict[str, Any] = {
        "bundle_source": "prod",
        "dead_parameters": [],
        "broken_hard_invariants": [],
        "events_checked": 14,
        "event_failures": [],
        "golden_differences": {},
    }
    fields.update(overrides)
    return OwnChecks(**fields)


def _evidence(**overrides: Any) -> Evidence:
    fields: dict[str, Any] = {
        "candidate_hash": CANDIDATE,
        "reference_hash": REFERENCE,
        "own": _own(),
        "canonical_eval_config_hash": CANONICAL,
        "canonical_assumptions": dict(ASSUMPTIONS),
        "canonical_capital": CAPITAL,
        "sweep": _sweep(),
        "sweep_trials": frozenset({"sha256:other"}),
        "look": _look(),
    }
    fields.update(overrides)
    return Evidence(**fields)


def _insufficient_sweep(*reasons: str) -> dict[str, Any]:
    """What a sweep with too few folds writes: its identity and why it said nothing."""
    return {
        "status": "insufficient_evidence",
        "sweep_id": "abc123",
        "fingerprint": _sweep()["fingerprint"],
        "reasons": list(reasons),
    }


def _by_name(gates: list[Gate]) -> dict[str, Gate]:
    return {gate.name: gate for gate in gates}


def _status(policy: PromotionPolicy, evidence: Evidence, name: str) -> str:
    return _by_name(evaluate_gates(policy, evidence))[name].status


def test_a_candidate_that_clears_every_gate_is_promotable() -> None:
    gates = evaluate_gates(_policy(), _evidence())

    assert {gate.status for gate in gates} == {PASS}
    assert [gate.name for gate in gates] == [
        "real_data_only",
        "canonical_assumptions",
        "no_dead_parameters",
        "hard_invariants",
        "validation_events",
        "golden_unaffected",
        "judged_against_reference",
        "candidate_was_searched",
        "folds",
        "fold_win_rate",
        "mean_oos_edge_pp",
        "bootstrap_p",
        "fold_drawdown",
        "deflated_sharpe",
        "holdout_look",
        "holdout_roi",
        "holdout_drawdown",
    ]
    assert verdict(gates) == PROMOTABLE


def test_a_gate_serializes_with_the_numbers_behind_it() -> None:
    gate = _by_name(evaluate_gates(_policy(), _evidence()))["fold_win_rate"]

    assert gate.as_dict() == {
        "group": "walk_forward",
        "name": "fold_win_rate",
        "status": PASS,
        "detail": "share of folds won: 1, needs to be at least 0.6",
        "value": 1.0,
        "threshold": 0.6,
    }


# The edge of each bar: which side of it passes.
BOUNDARIES = [
    ("fold_win_rate", ("aggregate", "fold_win_rate"), 0.6, PASS),
    ("fold_win_rate", ("aggregate", "fold_win_rate"), 0.59, FAIL),
    ("mean_oos_edge_pp", ("aggregate", "mean_oos_edge_pp"), 0.0, FAIL),
    ("mean_oos_edge_pp", ("aggregate", "mean_oos_edge_pp"), 0.0001, PASS),
    (
        "bootstrap_p",
        ("aggregate", "oos_edge_annualized_pp", "p_not_positive"),
        0.1,
        FAIL,
    ),
    (
        "bootstrap_p",
        ("aggregate", "oos_edge_annualized_pp", "p_not_positive"),
        0.099,
        PASS,
    ),
    ("deflated_sharpe", ("deflated_sharpe", "value"), 0.9, FAIL),
    ("deflated_sharpe", ("deflated_sharpe", "value"), 0.91, PASS),
]


@pytest.mark.parametrize(("gate", "path", "value", "expected"), BOUNDARIES)
def test_each_walk_forward_bar_has_a_side_that_passes(
    gate: str, path: tuple[str, ...], value: float, expected: str
) -> None:
    sweep = _sweep()
    target: Any = sweep
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value

    assert _status(_policy(), _evidence(sweep=sweep), gate) == expected


@pytest.mark.parametrize(
    ("worst", "expected"), [(-3.0, PASS), (-3.01, FAIL), (0.5, PASS)]
)
def test_a_fold_may_be_worse_than_the_reference_by_exactly_the_allowance(
    worst: float, expected: str
) -> None:
    sweep = _sweep()
    sweep["folds"][1]["oos"]["max_drawdown_pp"] = worst

    assert _status(_policy(), _evidence(sweep=sweep), "fold_drawdown") == expected


@pytest.mark.parametrize(
    ("edge", "expected"),
    [
        ({"roi_pp": -2.0, "max_drawdown_pp": 0.0}, (PASS, PASS)),
        ({"roi_pp": -2.01, "max_drawdown_pp": 0.0}, (FAIL, PASS)),
        ({"roi_pp": 0.0, "max_drawdown_pp": -3.0}, (PASS, PASS)),
        ({"roi_pp": 0.0, "max_drawdown_pp": -3.01}, (PASS, FAIL)),
    ],
)
def test_the_holdout_bars_allow_a_small_shortfall(
    edge: dict[str, float], expected: tuple[str, str]
) -> None:
    gates = _by_name(
        evaluate_gates(_policy(), _evidence(look=_look(edge={**edge, "sharpe": 0.0})))
    )

    assert (gates["holdout_roi"].status, gates["holdout_drawdown"].status) == expected


def test_a_policy_can_ask_for_more_folds_than_the_sweep_had() -> None:
    policy = _policy(walk_forward={"min_folds": 4})

    assert _status(policy, _evidence(), "folds") == FAIL


def test_synthetic_data_is_never_evidence_when_the_policy_says_so() -> None:
    own = _own(bundle_source="synthetic")

    assert _status(_policy(), _evidence(own=own), "real_data_only") == FAIL
    sweep = _sweep()
    sweep["fingerprint"]["bundle"]["source"] = "synthetic"
    assert _status(_policy(), _evidence(sweep=sweep), "real_data_only") == FAIL
    look = _look(bundle={"ref": "x", "source": "synthetic"})
    assert _status(_policy(), _evidence(look=look), "real_data_only") == FAIL


def test_a_policy_that_allows_synthetic_data_does_not_ask() -> None:
    policy = _policy(prerequisites={"real_data_only": False})
    gates = _by_name(
        evaluate_gates(policy, _evidence(own=_own(bundle_source="synthetic")))
    )

    assert "real_data_only" not in gates


def test_every_number_must_come_from_the_default_assumptions() -> None:
    wrong_sweep = _sweep()
    wrong_sweep["fingerprint"]["eval_config_hash"] = "sha256:other"
    assert (
        _status(_policy(), _evidence(sweep=wrong_sweep), "canonical_assumptions")
        == FAIL
    )

    for change in (
        {"assumptions": {**ASSUMPTIONS, "slippage_rate": 0.0}},
        {"total_capital": 5_000.0},
    ):
        assert (
            _status(_policy(), _evidence(look=_look(**change)), "canonical_assumptions")
            == FAIL
        )


def test_with_nothing_to_check_the_assumptions_are_unproven() -> None:
    evidence = _evidence(sweep=None, look=None)

    assert _status(_policy(), evidence, "canonical_assumptions") == INSUFFICIENT


def test_an_insufficient_sweep_has_no_assumptions_to_check() -> None:
    evidence = _evidence(sweep=_insufficient_sweep("x"), look=None)

    assert _status(_policy(), evidence, "canonical_assumptions") == INSUFFICIENT


@pytest.mark.parametrize(
    ("gate", "own", "expected"),
    [
        ("no_dead_parameters", {"dead_parameters": ["/rules[x]/cooldown_days"]}, FAIL),
        ("hard_invariants", {"broken_hard_invariants": ["weights_valid"]}, FAIL),
        (
            "golden_unaffected",
            {"golden_differences": {"reference/dma_fgi": ["x"]}},
            FAIL,
        ),
        ("validation_events", {"event_failures": ["btc_cross_down"]}, FAIL),
        ("validation_events", {"events_checked": 0}, INSUFFICIENT),
    ],
)
def test_the_prerequisites_the_promotion_checks_itself(
    gate: str, own: dict[str, Any], expected: str
) -> None:
    assert _status(_policy(), _evidence(own=_own(**own)), gate) == expected


def test_a_failed_prerequisite_names_what_failed() -> None:
    gates = _by_name(
        evaluate_gates(
            _policy(),
            _evidence(
                own=_own(
                    dead_parameters=["/a", "/b"],
                    event_failures=["e1", "e2"],
                    events_checked=14,
                )
            ),
        )
    )

    assert (
        gates["no_dead_parameters"].detail
        == "Parameters that change no decision: /a, /b"
    )
    assert gates["validation_events"].detail == "2 of 14 events fail: e1, e2"


def test_without_a_sweep_the_walk_forward_is_one_missing_piece_of_evidence() -> None:
    gates = [
        gate
        for gate in evaluate_gates(_policy(), _evidence(sweep=None))
        if gate.group == "walk_forward"
    ]

    assert [(gate.name, gate.status) for gate in gates] == [("sweep", INSUFFICIENT)]


def test_a_sweep_with_too_few_folds_is_insufficient_evidence_not_a_failure() -> None:
    sweep = _insufficient_sweep("Only 2 folds fit.")
    gates = [
        gate
        for gate in evaluate_gates(_policy(), _evidence(sweep=sweep))
        if gate.group == "walk_forward"
    ]

    assert [(gate.status, gate.detail) for gate in gates] == [
        (INSUFFICIENT, "The sweep is insufficient evidence: Only 2 folds fit.")
    ]


def test_the_folds_must_have_been_judged_against_the_production_reference() -> None:
    sweep = _sweep()
    sweep["fingerprint"]["reference"] = {
        "ref": "tuned@1#zzz",
        "behavior_hash": "sha256:x",
    }

    gate = _by_name(evaluate_gates(_policy(), _evidence(sweep=sweep)))[
        "judged_against_reference"
    ]

    assert gate.status == FAIL
    assert "tuned@1#zzz" in gate.detail


def test_a_sweep_that_named_no_reference_judged_against_its_own_spec() -> None:
    sweep = _sweep()
    del sweep["fingerprint"]["reference"]

    # Its own spec is the candidate here, not the production reference.
    assert (
        _status(_policy(), _evidence(sweep=sweep), "judged_against_reference") == FAIL
    )
    sweep["fingerprint"]["spec"]["behavior_hash"] = REFERENCE
    assert (
        _status(_policy(), _evidence(sweep=sweep), "judged_against_reference") == PASS
    )


def test_the_candidate_must_be_what_the_sweep_searched() -> None:
    other = _evidence(candidate_hash="sha256:someone-else")
    assert _status(_policy(), other, "candidate_was_searched") == FAIL

    trial = _evidence(
        candidate_hash="sha256:trial", sweep_trials=frozenset({"sha256:trial"})
    )
    assert _status(_policy(), trial, "candidate_was_searched") == PASS


def test_a_sweep_that_does_not_report_fold_drawdowns_must_be_run_again() -> None:
    sweep = _sweep()
    del sweep["folds"][0]["oos"]["max_drawdown_pp"]

    assert _status(_policy(), _evidence(sweep=sweep), "fold_drawdown") == INSUFFICIENT


def test_a_deflated_sharpe_that_cannot_be_computed_is_not_a_pass() -> None:
    sweep = _sweep(deflated_sharpe={"value": None, "trials": 1})

    assert _status(_policy(), _evidence(sweep=sweep), "deflated_sharpe") == INSUFFICIENT


def test_the_holdout_look_is_required_by_default() -> None:
    gates = [
        gate
        for gate in evaluate_gates(_policy(), _evidence(look=None))
        if gate.group == "holdout"
    ]

    assert [(gate.name, gate.status) for gate in gates] == [
        ("holdout_look", INSUFFICIENT)
    ]


def test_a_policy_that_does_not_require_a_look_asks_for_none() -> None:
    policy = _policy(holdout={"required": False})

    assert [
        g for g in evaluate_gates(policy, _evidence(look=None)) if g.group == "holdout"
    ] == []


def test_a_look_of_another_candidate_is_no_evidence_for_this_one() -> None:
    look = _look(candidate={"ref": "changed@1#ccc", "behavior_hash": "sha256:changed"})

    gates = [
        gate
        for gate in evaluate_gates(_policy(), _evidence(look=look))
        if gate.group == "holdout"
    ]

    assert [(gate.name, gate.status) for gate in gates] == [("holdout_look", FAIL)]
    assert "changed@1#ccc" in gates[0].detail
    assert "new lineage" in gates[0].detail


def test_a_look_that_compared_with_another_reference_is_no_evidence() -> None:
    look = _look(reference={"ref": "tuned@1#zzz", "behavior_hash": "sha256:zzz"})

    gate = _by_name(evaluate_gates(_policy(), _evidence(look=look)))["holdout_look"]

    assert gate.status == FAIL
    assert "tuned@1#zzz" in gate.detail


def test_the_verdict_follows_the_worst_gate() -> None:
    passed = Gate("g", "a", PASS, "")
    missing = Gate("g", "b", INSUFFICIENT, "")
    failed = Gate("g", "c", FAIL, "")

    assert verdict([passed]) == PROMOTABLE
    assert verdict([passed, missing]) == INSUFFICIENT_EVIDENCE
    assert verdict([passed, missing, failed]) == REJECTED
    assert verdict([]) == PROMOTABLE

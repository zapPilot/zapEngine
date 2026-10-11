from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from src.services.backtesting.lab import promotion_checks
from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.diff import compare_on_bundle
from src.services.backtesting.lab.envelope import Context
from src.services.backtesting.lab.promotion_checks import (
    own_checks,
    structural_checks,
    structural_issues,
    validation_events,
)
from src.services.backtesting.lab.promotion_commands import DEFAULT_EVENTS
from src.services.backtesting.lab.report import hash_of, normalize
from src.services.backtesting.lab.runner import EvalConfig
from src.services.backtesting.spec import load_spec, parse_spec
from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.validation.event_runner import ValidationEventError
from tests.services.backtesting.spec.helpers import reference_raw
from tests.services.backtesting.spec.test_review_queue import QUEUE

BUNDLE = "synthetic:regimes?seed=1&days=300"


def _without(rule_id: str):
    raw = reference_raw()
    raw["id"] = f"without_{rule_id}"
    raw["rules"] = [rule for rule in raw["rules"] if rule["id"] != rule_id]
    return parse_spec(raw)


def test_the_reference_passes_every_validation_event() -> None:
    checked, failures = validation_events(
        load_spec("reference/dma_fgi"), DEFAULT_EVENTS
    )

    assert (checked, failures) == (14, [])


def test_a_candidate_that_breaks_the_behavioral_contract_names_the_events() -> None:
    checked, failures = validation_events(_without("cross_down_exit"), DEFAULT_EVENTS)

    assert checked == 14
    assert "btc_cross_down_2025_03_08" in failures
    assert "spy_cross_down_2025_03_10" in failures


def test_events_for_other_strategies_prove_nothing_about_this_one(
    tmp_path: Path,
) -> None:
    events = json.loads(DEFAULT_EVENTS.read_text())
    for day in events.values():
        for event in day["events"]:
            event["applicable_strategies"] = ["dca_classic"]
    path = tmp_path / "events.json"
    path.write_text(json.dumps(events))

    assert validation_events(load_spec("reference/dma_fgi"), path) == (0, [])


def test_a_missing_events_fixture_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(ValidationEventError, match="not found"):
        validation_events(load_spec("reference/dma_fgi"), tmp_path / "nope.json")


def test_the_default_events_are_the_committed_fixture() -> None:
    assert DEFAULT_EVENTS.name == "hierarchical_validation_events.json"
    assert DEFAULT_EVENTS.is_file()


@pytest.fixture()
def stubbed_slow_checks(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Liveness and the golden check take minutes; these tests stub them."""
    calls: dict[str, Any] = {}

    def liveness(spec: Any, bundles: Any, primary: Any, config: Any) -> Any:
        calls["liveness"] = (spec.id, sorted(bundles), sorted(primary))
        return SimpleNamespace(
            leaves=[
                SimpleNamespace(pointer="/a", status="live"),
                SimpleNamespace(pointer="/b", status="dead"),
                SimpleNamespace(pointer="/c", status="dormant"),
            ]
        )

    def golden_differences(path: Path, refs: Any, context: Context) -> Any:
        calls["golden"] = (path, refs)
        return ["reference/dma_fgi"], {"reference/dma_fgi": ["digest changed"]}

    monkeypatch.setattr(promotion_checks, "liveness", liveness)
    monkeypatch.setattr(promotion_checks, "golden_differences", golden_differences)
    return calls


def test_the_promotion_runs_its_own_checks_on_the_evidence(
    tmp_path: Path, stubbed_slow_checks: dict[str, Any]
) -> None:
    bundle = synthetic_bundle(BUNDLE)
    stress = {
        "synthetic:stress?seed=1&days=300": synthetic_bundle(
            "synthetic:stress?seed=1&days=300"
        )
    }
    context = Context(strategies_dir=STRATEGIES_DIR, lab_dir=tmp_path)

    checks = own_checks(
        load_spec("reference/dma_fgi"),
        bundle,
        stress=stress,
        events_path=DEFAULT_EVENTS,
        golden_path=tmp_path / "golden.json",
        context=context,
    )

    assert checks.bundle_source == "synthetic"
    assert checks.dead_parameters == ["/b"]
    assert checks.broken_hard_invariants == []
    assert (checks.events_checked, checks.event_failures) == (14, [])
    assert checks.golden_differences == {"reference/dma_fgi": ["digest changed"]}
    primary = f"{bundle.manifest.name}:{bundle.manifest.bundle_id}"
    assert stubbed_slow_checks["liveness"] == (
        "dma_fgi",
        sorted([primary, "synthetic:stress?seed=1&days=300"]),
        [primary],
    )
    assert stubbed_slow_checks["golden"] == (tmp_path / "golden.json", None)


def test_a_broken_hard_invariant_is_named(
    tmp_path: Path,
    stubbed_slow_checks: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del stubbed_slow_checks

    def evaluate(spec: Any, bundle: Any, config: Any, *, git: Any) -> Any:
        return SimpleNamespace(
            body={
                "invariants": [
                    {"name": "weights_valid", "hard": True, "count": 2},
                    {"name": "held_below_dma_days", "hard": False, "count": 40},
                    {"name": "never_broken", "hard": True, "count": 0},
                ]
            }
        )

    monkeypatch.setattr(promotion_checks, "evaluate", evaluate)

    checks = own_checks(
        load_spec("reference/dma_fgi"),
        synthetic_bundle(BUNDLE),
        stress={},
        events_path=DEFAULT_EVENTS,
        golden_path=tmp_path / "golden.json",
        context=Context(strategies_dir=STRATEGIES_DIR, lab_dir=tmp_path),
    )

    assert checks.broken_hard_invariants == ["weights_valid"]


REFERENCE = load_spec("reference/dma_fgi")
# Which of the review's edits only simplify the reference, and what stops the others.
QUEUE_VERDICTS: dict[str, set[str]] = {
    "one_ratio_rule": set(),
    "no_stable_sweep": set(),
    "deploy_stable_on_cross_up": set(),
    "trend_guard": {"added_piece"},
    "relative_trims_with_a_rebuy": {"added_piece", "added_parameter"},
    "staged_entry": {"added_piece"},
}


def _edited(edit: Any) -> Any:
    raw = reference_raw()
    raw["id"] = "edited"
    edit(raw)
    return parse_spec(raw)


def test_every_edit_of_the_queue_has_a_structural_verdict() -> None:
    assert set(QUEUE_VERDICTS) == set(QUEUE)


@pytest.mark.parametrize("name", sorted(QUEUE))
def test_the_queue_says_which_edits_only_simplify(name: str) -> None:
    issues = structural_issues(REFERENCE, _edited(QUEUE[name]))

    assert {issue.code for issue in issues} == QUEUE_VERDICTS[name]


def _rule(raw: dict[str, Any], rule_id: str) -> dict[str, Any]:
    return next(rule for rule in raw["rules"] if rule["id"] == rule_id)


def test_moving_a_tunable_number_is_not_structural() -> None:
    def tune(raw: dict[str, Any]) -> None:
        _rule(raw, "cross_down_exit")["cooldown_days"] = 21

    issues = structural_issues(REFERENCE, _edited(tune))

    assert [issue.as_dict() for issue in issues] == [
        {
            "pointer": "/rules[cross_down_exit]/cooldown_days",
            "code": "tuned_parameter",
            "message": "/rules[cross_down_exit]/cooldown_days moves from 30 to 21",
        }
    ]


def test_moving_a_number_that_is_not_tunable_is_not_structural_either() -> None:
    def warm_up_less(raw: dict[str, Any]) -> None:
        raw["signals"]["warmup_days"] = 7

    issues = structural_issues(REFERENCE, _edited(warm_up_less))

    assert [(issue.pointer, issue.code) for issue in issues] == [
        ("/signals/warmup_days", "changed_number")
    ]


def test_flipping_a_tunable_flag_is_tuning() -> None:
    def no_touch(raw: dict[str, Any]) -> None:
        raw["signals"]["dma"]["cross_on_touch"] = False

    issues = structural_issues(REFERENCE, _edited(no_touch))

    assert [(issue.pointer, issue.code) for issue in issues] == [
        ("/signals/dma/cross_on_touch", "tuned_parameter")
    ]


def test_the_rules_that_remain_keep_their_order() -> None:
    def swap(raw: dict[str, Any]) -> None:
        raw["rules"][2], raw["rules"][3] = raw["rules"][3], raw["rules"][2]

    issues = structural_issues(REFERENCE, _edited(swap))

    assert [(issue.pointer, issue.code) for issue in issues] == [
        ("/rules", "reordered")
    ]


def test_removing_rules_keeps_the_order_of_the_rest() -> None:
    def drop_two(raw: dict[str, Any]) -> None:
        raw["rules"] = [
            rule
            for rule in raw["rules"]
            if rule["id"] not in {"cross_up_equal_weight", "eth_btc_deviation_dca"}
        ]

    assert structural_issues(REFERENCE, _edited(drop_two)) == []


def test_a_rule_that_changes_kind_is_one_issue() -> None:
    def rebuild(raw: dict[str, Any]) -> None:
        index = next(
            i
            for i, rule in enumerate(raw["rules"])
            if rule["id"] == "cross_up_equal_weight"
        )
        raw["rules"][index] = {
            "kind": "trend_dca_entry",
            "id": "cross_up_equal_weight",
            "cooldown_days": 30,
            "buy_step": 0.1,
            "max_weight": 0.34,
        }

    issues = structural_issues(REFERENCE, _edited(rebuild))

    assert [(issue.pointer, issue.code) for issue in issues] == [
        ("/rules[cross_up_equal_weight]/kind", "changed_kind")
    ]


def test_turning_a_piece_off_is_structural_and_turning_one_on_is_not() -> None:
    def leg_off(raw: dict[str, Any]) -> None:
        _rule(raw, "eth_btc_deviation_dca")["below"] = None

    without_leg = _edited(leg_off)

    assert structural_issues(REFERENCE, without_leg) == []
    assert [
        (issue.pointer, issue.code)
        for issue in structural_issues(without_leg, REFERENCE)
    ] == [("/rules[eth_btc_deviation_dca]/below", "added_piece")]


def test_a_new_name_or_description_is_not_a_change_of_structure() -> None:
    def rename(raw: dict[str, Any]) -> None:
        raw["version"] = 7
        raw["description"] = "Another sentence."

    assert structural_issues(REFERENCE, _edited(rename)) == []


def test_a_tier_removed_ahead_of_another_reads_as_moved_numbers() -> None:
    """Tiers are addressed by position, so the check refuses rather than guesses."""

    def drop_large_tier(raw: dict[str, Any]) -> None:
        tiers = _rule(raw, "eth_btc_deviation_dca")["tiers"]
        _rule(raw, "eth_btc_deviation_dca")["tiers"] = tiers[1:]

    issues = structural_issues(REFERENCE, _edited(drop_large_tier))

    assert {issue.code for issue in issues} == {"tuned_parameter"}
    assert {issue.pointer for issue in issues} == {
        "/rules[eth_btc_deviation_dca]/tiers/0/threshold",
        "/rules[eth_btc_deviation_dca]/tiers/0/rotation_fraction",
        "/rules[eth_btc_deviation_dca]/tiers/0/cooldown_days",
    }


def test_the_structural_evidence_runs_both_specs_on_every_history() -> None:
    candidate = _edited(QUEUE["one_ratio_rule"])
    config = EvalConfig()
    suite = {
        ref: synthetic_bundle(ref)
        for ref in (
            "synthetic:regimes?seed=1&days=120",
            "synthetic:stress?seed=2&days=120",
        )
    }
    real = {"roi_pp": 1.0, "max_drawdown_pp": 0.0}

    evidence = structural_checks(
        REFERENCE, candidate, real=real, suite=suite, config=config
    )

    assert evidence.issues == []
    assert evidence.real == real
    assert evidence.eval_config_hash == hash_of(normalize(config.as_dict()))
    assert sorted(evidence.stress) == sorted(suite)
    for ref, history in suite.items():
        compared = compare_on_bundle(REFERENCE, candidate, history, config)
        for side in ("base", "candidate"):
            assert evidence.stress[ref][side] == {
                metric: compared[side][metric]
                for metric in ("roi_percent", "max_drawdown_percent", "trade_count")
            }


def test_the_structural_evidence_carries_the_issues() -> None:
    def tune(raw: dict[str, Any]) -> None:
        _rule(raw, "cross_down_exit")["cooldown_days"] = 21

    evidence = structural_checks(
        REFERENCE, _edited(tune), real={}, suite={}, config=EvalConfig()
    )

    assert [issue["code"] for issue in evidence.issues] == ["tuned_parameter"]

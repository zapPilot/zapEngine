from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab.bundle import Bundle, synthetic_bundle
from src.services.backtesting.lab.coverage import OOS_BLOCK_DAYS
from src.services.backtesting.lab.evaluate import evaluate
from src.services.backtesting.lab.folds import MIN_FOLDS
from src.services.backtesting.lab.ledger import Ledger
from src.services.backtesting.lab.runner import EvalConfig
from src.services.backtesting.lab.sweep import (
    INSUFFICIENT,
    MAX_TRIALS,
    OK,
    SearchSpace,
    SpaceError,
    SweepConfig,
    apply,
    check_space,
    load_space,
    parse_space,
    sample,
    sweep,
)
from src.services.backtesting.spec import load_spec, parse_spec
from tests.services.backtesting.spec.helpers import reference_raw

COOLDOWN = "/rules[cross_down_exit]/cooldown_days"
STEP = "/rules[dma_overextension_dca_sell]/sell_step"
TOUCH = "/signals/dma/cross_on_touch"


def _space(**overrides: Any) -> dict[str, Any]:
    space: dict[str, Any] = {
        "parameters": [
            {"pointer": COOLDOWN, "values": [15, 30, 60]},
            {"pointer": STEP, "values": [0.025, 0.05, 0.075]},
        ],
        "sampling": {"method": "grid"},
    }
    space.update(overrides)
    return space


@pytest.fixture(scope="module")
def spec():
    return load_spec("reference/dma_fgi")


@pytest.fixture(scope="module")
def long_bundle() -> Bundle:
    return synthetic_bundle("synthetic:regimes?seed=1&days=760")


@pytest.fixture(scope="module")
def result(spec, long_bundle) -> dict[str, Any]:
    return sweep(spec, long_bundle, parse_space(_space()))


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ([], "has 'parameters'"),
        ({"parameters": [], "x": 1}, "has 'parameters'"),
        ({"parameters": []}, "non-empty list"),
        ({"parameters": [{"values": [1]}]}, "needs a 'pointer'"),
        ({"parameters": [{"pointer": "/a", "values": [1], "extra": 1}]}, "takes only"),
        ({"parameters": [{"pointer": "/a", "values": []}]}, "non-empty list"),
        ({"parameters": [{"pointer": "/a", "values": [1], "min": 0}]}, "not both"),
        ({"parameters": [{"pointer": "/a"}]}, "'min' below 'max'"),
        ({"parameters": [{"pointer": "/a", "min": 2, "max": 1}]}, "'min' below 'max'"),
        (
            {"parameters": [{"pointer": "/a", "min": 0, "max": 1, "steps": 1}]},
            "at least 2",
        ),
        (
            {
                "parameters": [
                    {"pointer": "/a", "values": [1]},
                    {"pointer": "/a", "values": [2]},
                ]
            },
            "appears twice",
        ),
        (_space(sampling=[]), "takes only"),
        (_space(sampling={"extra": 1}), "takes only"),
        (_space(sampling={"method": "sobol"}), "must be one of"),
        (_space(sampling={"trials": 0}), "from 1 to"),
        (_space(sampling={"trials": MAX_TRIALS + 1}), "from 1 to"),
        (_space(sampling={"trials": True}), "from 1 to"),
        (_space(sampling={"seed": 1.5}), "seed must be an integer"),
        (
            {
                "parameters": [{"pointer": f"/p{i}", "values": [1]} for i in range(11)],
                "sampling": {"method": "halton"},
            },
            "at most 10",
        ),
    ],
)
def test_a_malformed_space_is_refused(raw: Any, message: str) -> None:
    with pytest.raises(SpaceError, match=message):
        parse_space(raw)


def test_a_space_has_defaults_and_serializes() -> None:
    space = parse_space({"parameters": [{"pointer": COOLDOWN, "values": [15, 30]}]})

    assert (space.method, space.trials, space.seed) == ("grid", 50, 1)
    assert space.as_dict()["parameters"][0] == {
        "pointer": COOLDOWN,
        "values": [15, 30],
        "min": None,
        "max": None,
        "steps": None,
    }


def test_a_space_loads_from_a_file(tmp_path: Path) -> None:
    path = tmp_path / "space.json"
    path.write_text(json.dumps(_space()))

    assert len(load_space(path).parameters) == 2
    with pytest.raises(SpaceError, match="No search space"):
        load_space(tmp_path / "missing.json")
    path.write_text("{not json")
    with pytest.raises(SpaceError, match="is not JSON"):
        load_space(path)


def test_pointers_must_be_tunable_leaves_of_the_spec(spec) -> None:
    with pytest.raises(SpaceError, match="not a tunable leaf"):
        check_space(
            parse_space({"parameters": [{"pointer": "/id", "values": ["a"]}]}), spec
        )
    with pytest.raises(SpaceError, match="the tunable pointers are"):
        check_space(
            parse_space(
                {"parameters": [{"pointer": "/rules/0/cooldown_days", "values": [1]}]}
            ),
            spec,
        )


@pytest.mark.parametrize(
    ("parameter", "message"),
    [
        ({"pointer": TOUCH, "values": [1, 0]}, "is a flag"),
        ({"pointer": TOUCH, "min": 0, "max": 1}, "is a flag"),
        ({"pointer": COOLDOWN, "values": ["a"]}, "is a number"),
        ({"pointer": COOLDOWN, "min": 5, "max": 60}, "needs 'values' or 'steps'"),
    ],
)
def test_values_must_fit_the_leaf(spec, parameter: dict, message: str) -> None:
    with pytest.raises(SpaceError, match=message):
        check_space(parse_space({"parameters": [parameter]}), spec)


def test_a_grid_is_every_combination(spec) -> None:
    assignments = sample(parse_space(_space()), spec)

    assert len(assignments) == 9
    assert assignments[0] == {COOLDOWN: 15, STEP: 0.025}
    assert assignments[-1] == {COOLDOWN: 60, STEP: 0.075}


def test_a_grid_over_a_range_takes_evenly_spaced_steps(spec) -> None:
    space = parse_space(
        {"parameters": [{"pointer": COOLDOWN, "min": 10, "max": 50, "steps": 5}]}
    )

    assert [item[COOLDOWN] for item in sample(space, spec)] == [10, 20, 30, 40, 50]


def test_a_grid_that_is_too_big_is_refused_not_trimmed(spec) -> None:
    space = parse_space(
        {
            "parameters": [
                {"pointer": COOLDOWN, "values": list(range(1, 21))},
                {"pointer": STEP, "min": 0.01, "max": 0.1, "steps": 20},
            ]
        }
    )

    with pytest.raises(SpaceError, match="limit is 200"):
        sample(space, spec)


def test_random_sampling_is_seeded(spec) -> None:
    raw = _space(sampling={"method": "random", "trials": 12, "seed": 4})
    raw["parameters"][1] = {"pointer": STEP, "min": 0.02, "max": 0.1}
    space = parse_space(raw)

    first = sample(space, spec)

    assert first == sample(space, spec)
    assert first != sample(
        parse_space({**raw, "sampling": {**raw["sampling"], "seed": 5}}), spec
    )
    assert all(0.02 <= item[STEP] <= 0.1 for item in first)
    assert all(item[COOLDOWN] in (15, 30, 60) for item in first)


def test_random_integers_are_integers(spec) -> None:
    space = parse_space(
        {
            "parameters": [{"pointer": COOLDOWN, "min": 5, "max": 90}],
            "sampling": {"method": "random", "trials": 20, "seed": 2},
        }
    )

    assert all(isinstance(item[COOLDOWN], int) for item in sample(space, spec))


def test_halton_sampling_spreads_evenly_and_repeats(spec) -> None:
    raw = {
        "parameters": [
            {"pointer": COOLDOWN, "min": 0, "max": 100},
            {"pointer": STEP, "min": 0.0, "max": 1.0},
        ],
        "sampling": {"method": "halton", "trials": 16},
    }
    space = parse_space(raw)

    points = sample(space, spec)

    assert points == sample(space, spec)
    assert len(points) == 16
    cooldowns = sorted(item[COOLDOWN] for item in points)
    # Evenly spread: no gap in the first dimension is wide.
    assert max(b - a for a, b in zip(cooldowns, cooldowns[1:], strict=False)) <= 13


def test_halton_over_listed_values_cycles_through_them(spec) -> None:
    space = parse_space(
        {
            "parameters": [{"pointer": COOLDOWN, "values": [15, 30, 60]}],
            "sampling": {"method": "halton", "trials": 30},
        }
    )

    assert {item[COOLDOWN] for item in sample(space, spec)} == {15, 30, 60}


def test_repeated_draws_are_dropped(spec) -> None:
    space = parse_space(
        {
            "parameters": [{"pointer": COOLDOWN, "values": [15, 30]}],
            "sampling": {"method": "random", "trials": 40, "seed": 1},
        }
    )

    assert len(sample(space, spec)) == 2


def test_an_assignment_becomes_a_spec(spec) -> None:
    changed = apply(spec.model_dump(mode="json"), {COOLDOWN: 21, STEP: 0.1})

    assert changed.rules[0].cooldown_days == 21  # type: ignore[union-attr]
    assert changed.rules[4].sell_step == 0.1  # type: ignore[union-attr]


def test_too_little_history_is_insufficient_evidence_not_a_result(spec) -> None:
    short = synthetic_bundle("synthetic:regimes?seed=1&days=400")

    outcome = sweep(spec, short, parse_space(_space()))

    assert outcome["status"] == INSUFFICIENT
    assert any("at least 3 are needed" in reason for reason in outcome["reasons"])
    assert outcome["recommendation"]["folds"] < MIN_FOLDS
    assert "folds" not in outcome


def test_a_bundle_with_no_complete_stretch_is_insufficient(spec) -> None:
    long = synthetic_bundle("synthetic:regimes?seed=1&days=760")
    empty = Bundle(manifest=long.manifest, prices=[], sentiments={})

    outcome = sweep(spec, empty, parse_space(_space()))

    assert outcome["status"] == INSUFFICIENT
    assert "No stretch has every series" in outcome["reasons"][0]


def test_a_window_that_starts_after_the_data_ends_is_insufficient(spec) -> None:
    long = synthetic_bundle("synthetic:regimes?seed=1&days=760")
    late = Bundle(
        manifest=long.manifest.__class__(
            **{**long.manifest.__dict__, "start": date(2030, 1, 1)}
        ),
        prices=long.prices,
        sentiments=long.sentiments,
    )

    assert sweep(spec, late, parse_space(_space()))["status"] == INSUFFICIENT


def test_a_sweep_says_what_it_did(result: dict[str, Any]) -> None:
    assert result["status"] == OK
    assert len(result["sweep_id"]) == 16
    assert result["window"]["folds"] == 3
    assert result["window"]["holdout"] is not None
    assert result["trials"]["valid"] == 9 and result["trials"]["invalid"] == []
    assert result["fingerprint"]["bundle"]["source"] == "synthetic"
    assert set(result["fingerprint"]) == {
        "spec",
        "reference",
        "bundle",
        "eval_config_hash",
        "space_hash",
    }
    # With no reference named, the folds are judged against the spec searched.
    assert result["fingerprint"]["reference"] == result["fingerprint"]["spec"]


def test_a_sweep_can_be_judged_against_another_spec(spec, long_bundle) -> None:
    raw = reference_raw()
    raw["id"] = "no_exit"
    raw["rules"] = [rule for rule in raw["rules"] if rule["id"] != "cross_down_exit"]
    candidate = parse_spec(raw)
    space = parse_space(
        {
            "parameters": [{"pointer": STEP, "values": [0.025, 0.05]}],
            "sampling": {"method": "grid"},
        }
    )

    judged = sweep(candidate, long_bundle, space, reference=spec)
    own = sweep(spec, long_bundle, space)

    assert judged["fingerprint"]["spec"]["ref"].startswith("no_exit@")
    assert judged["fingerprint"]["reference"] == own["fingerprint"]["spec"]
    # What the folds beat is the reference, over the same window and assumptions.
    assert judged["reference"] == own["reference"]
    assert (
        judged["folds"][0]["oos"]["reference_roi_percent"]
        == (own["folds"][0]["oos"]["reference_roi_percent"])
    )


def test_naming_the_same_behavior_as_the_reference_changes_nothing(
    spec, long_bundle
) -> None:
    space = parse_space(
        {
            "parameters": [{"pointer": STEP, "values": [0.025, 0.05]}],
            "sampling": {"method": "grid"},
        }
    )

    alone = sweep(spec, long_bundle, space)
    named = sweep(spec, long_bundle, space, reference=load_spec("reference/dma_fgi"))

    assert named == alone


def test_only_the_development_window_is_searched(result: dict[str, Any]) -> None:
    window = result["window"]

    assert window["development"]["end"] < window["holdout"]["start"]
    assert (
        date.fromisoformat(window["holdout"]["start"])
        - date.fromisoformat(window["development"]["end"])
    ).days == 1
    last_test = result["folds"][-1]["test"]["end"]
    assert last_test <= window["development"]["end"]


def test_folds_train_on_the_past_and_test_the_next_block(
    result: dict[str, Any],
) -> None:
    folds = result["folds"]

    for fold in folds:
        train_end = date.fromisoformat(fold["train"]["end"])
        test_start = date.fromisoformat(fold["test"]["start"])
        test_end = date.fromisoformat(fold["test"]["end"])
        assert test_start - train_end == timedelta(days=1)
        assert (test_end - test_start).days + 1 == OOS_BLOCK_DAYS
    for earlier, later in zip(folds, folds[1:], strict=False):
        assert later["test"]["start"] > earlier["test"]["end"]
        assert later["train"]["end"] > earlier["train"]["end"]


def test_each_fold_picks_a_trial_and_is_judged_against_the_reference(result) -> None:
    for fold in result["folds"]:
        oos = fold["oos"]

        assert fold["selected"]["params"].keys() == {COOLDOWN, STEP}
        assert oos["edge_pp"] == pytest.approx(
            oos["selected_roi_percent"] - oos["reference_roi_percent"], abs=1e-4
        )
        assert oos["win"] is (oos["edge_pp"] > 0)


def test_each_fold_says_how_deep_the_selected_trial_fell_against_the_reference(
    result,
) -> None:
    for fold in result["folds"]:
        oos = fold["oos"]
        assert oos["selected_max_drawdown_percent"] <= 0.0
        assert oos["reference_max_drawdown_percent"] <= 0.0
        assert oos["max_drawdown_pp"] == pytest.approx(
            oos["selected_max_drawdown_percent"]
            - oos["reference_max_drawdown_percent"],
            abs=1e-4,
        )


def test_the_aggregate_is_the_folds_summed_up(result) -> None:
    folds = result["folds"]
    aggregate = result["aggregate"]

    wins = sum(1 for fold in folds if fold["oos"]["win"])
    assert aggregate["fold_win_rate"] == pytest.approx(wins / len(folds), abs=1e-5)
    assert aggregate["mean_oos_edge_pp"] == pytest.approx(
        sum(fold["oos"]["edge_pp"] for fold in folds) / len(folds), abs=1e-5
    )
    assert aggregate["distinct_selected"] == len(
        {fold["selected"]["trial"] for fold in folds}
    )
    edge = aggregate["oos_edge_annualized_pp"]
    assert edge["low"] <= edge["mean"] <= edge["high"]
    assert 0.0 <= edge["p_not_positive"] <= 1.0
    assert edge["block"] == 10 and edge["resamples"] == 2000


def test_the_best_trial_is_the_best_in_sample_and_not_vouched_for(result) -> None:
    top = result["trials"]["top"]

    assert result["best"]["trial"] == top[0]["trial"]
    assert [item["sharpe"] for item in top] == sorted(
        (item["sharpe"] for item in top), reverse=True
    )
    assert len(top) == 5
    assert any("not validated" in warning for warning in result["warnings"])
    assert any("not evidence" in warning for warning in result["warnings"])
    assert result["reference"].keys() == {"sharpe", "roi_percent"}


def test_a_sweeps_numbers_are_the_evaluators_on_the_same_window(
    spec, long_bundle, result
) -> None:
    window = result["window"]["development"]
    config = EvalConfig(
        start=date.fromisoformat(window["start"]),
        end=date.fromisoformat(window["end"]),
        leave_one_out=False,
        benchmarks=(),
    )

    reference = evaluate(spec, long_bundle, config).body["strategies"]["strategy"]
    best = apply(spec.model_dump(mode="json"), result["best"]["params"])
    chosen = evaluate(best, long_bundle, config).body["strategies"]["strategy"]

    assert result["reference"]["roi_percent"] == pytest.approx(
        reference["roi_percent"], abs=1e-5
    )
    assert result["reference"]["sharpe"] == pytest.approx(
        reference["sharpe_ratio"], abs=1e-5
    )
    assert result["best"]["roi_percent"] == pytest.approx(
        chosen["roi_percent"], abs=1e-5
    )
    assert result["best"]["sharpe"] == pytest.approx(chosen["sharpe_ratio"], abs=1e-5)


def test_plateau_and_deflation_are_reported(result) -> None:
    assert result["plateau"]["neighbors"] == 5
    assert 0 < result["plateau"]["retention"] <= 1.5
    assert result["deflated_sharpe"]["trials"] == 9
    assert 0.0 <= result["deflated_sharpe"]["value"] <= 1.0


def test_the_same_inputs_give_the_same_sweep(spec, long_bundle, result) -> None:
    assert sweep(spec, long_bundle, parse_space(_space())) == result


def test_a_different_space_is_a_different_sweep(spec, long_bundle, result) -> None:
    other = sweep(
        spec, long_bundle, parse_space(_space(sampling={"method": "grid", "seed": 9}))
    )

    assert other["sweep_id"] != result["sweep_id"]


def test_trials_that_break_the_spec_are_reported_not_run(spec, long_bundle) -> None:
    space = parse_space(
        {
            "parameters": [
                {
                    "pointer": "/rules[eth_btc_deviation_dca]/tiers/1/threshold",
                    "values": [0.4, 0.9],
                }
            ]
        }
    )

    outcome = sweep(spec, long_bundle, space)

    assert outcome["trials"]["valid"] == 1
    [invalid] = outcome["trials"]["invalid"]
    assert invalid["params"] == {"/rules[eth_btc_deviation_dca]/tiers/1/threshold": 0.9}
    assert "strongest tier first" in invalid["reason"]


def test_a_space_with_no_valid_spec_is_an_error(spec, long_bundle) -> None:
    space = parse_space(
        {
            "parameters": [
                {
                    "pointer": "/rules[eth_btc_deviation_dca]/tiers/1/threshold",
                    "values": [0.9],
                }
            ]
        }
    )

    with pytest.raises(SpaceError, match="No assignment"):
        sweep(spec, long_bundle, space)


def test_every_trial_is_recorded_and_reruns_do_not_inflate_the_count(
    spec, long_bundle, tmp_path: Path
) -> None:
    clock = lambda: datetime(2026, 10, 10, tzinfo=UTC)  # noqa: E731
    ledger = Ledger(tmp_path / "ledger.jsonl", clock=clock)
    space = parse_space(_space())

    first = sweep(spec, long_bundle, space, ledger=ledger)
    second = sweep(spec, long_bundle, space, ledger=ledger)

    assert len(ledger.entries("sweep_trial")) == 18
    assert len(ledger.entries("sweep")) == 2
    # Nine behaviors, however often they were run; the reference is one of them.
    assert ledger.distinct_candidates() == 9
    assert first["deflated_sharpe"]["trials"] == second["deflated_sharpe"]["trials"]
    assert first == second


def test_earlier_attempts_raise_the_bar(spec, long_bundle, tmp_path: Path) -> None:
    ledger = Ledger(tmp_path / "ledger.jsonl")
    for index in range(30):
        ledger.append(
            "eval",
            spec={"ref": f"old@1#{index}", "behavior_hash": f"sha256:old{index}"},
        )

    outcome = sweep(spec, long_bundle, parse_space(_space()), ledger=ledger)
    alone = sweep(spec, long_bundle, parse_space(_space()))

    assert outcome["deflated_sharpe"]["trials"] > alone["deflated_sharpe"]["trials"]
    assert outcome["deflated_sharpe"]["value"] <= alone["deflated_sharpe"]["value"]


def test_a_sweep_needs_three_folds_so_it_needs_720_days_and_a_holdout(spec) -> None:
    too_short = synthetic_bundle("synthetic:regimes?seed=1&days=719")
    enough = synthetic_bundle("synthetic:regimes?seed=1&days=720")

    refused = sweep(spec, too_short, parse_space(_space()))
    ran = sweep(spec, enough, parse_space(_space()))

    assert refused["status"] == INSUFFICIENT
    assert refused["recommendation"]["folds"] == 2
    assert ran["status"] == OK
    assert ran["window"]["folds"] == 3
    # A sweep that runs always has data left to confirm on.
    assert ran["window"]["holdout"] is not None


def test_a_flag_can_be_swept(spec, long_bundle) -> None:
    space = parse_space({"parameters": [{"pointer": TOUCH, "values": [True, False]}]})

    outcome = sweep(spec, long_bundle, space)

    assert outcome["trials"]["valid"] == 2
    assert outcome["plateau"]["retention"] is not None


def test_the_config_is_part_of_the_identity(spec, long_bundle, result) -> None:
    from src.models.backtesting import BacktestAssumptions

    other = sweep(
        spec,
        long_bundle,
        parse_space(_space()),
        SweepConfig(assumptions=BacktestAssumptions(slippage_rate=0.0)),
    )

    assert other["sweep_id"] != result["sweep_id"]
    assert (
        other["fingerprint"]["eval_config_hash"]
        != result["fingerprint"]["eval_config_hash"]
    )


def test_the_default_space_object_is_usable() -> None:
    assert SearchSpace(()).method == "grid"


def test_raw_spec_json_is_not_changed_by_an_assignment() -> None:
    raw = reference_raw()

    apply(raw, {COOLDOWN: 99})

    assert raw["rules"][0]["cooldown_days"] == 30

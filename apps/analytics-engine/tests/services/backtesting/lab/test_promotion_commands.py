from __future__ import annotations

import copy
import io
import json
from contextlib import redirect_stdout
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab import promotion_checks, promotion_commands
from src.services.backtesting.lab.cli import main
from src.services.backtesting.lab.ledger import LEDGER_FILENAME, Ledger
from src.services.backtesting.lab.liveness import NoDaysError
from src.services.backtesting.lab.policy import POLICY_PATH
from src.services.backtesting.lab.promotion import OwnChecks, StructuralEvidence
from src.services.backtesting.spec import behavior_hash, load_spec, parse_spec
from tests.services.backtesting.spec.helpers import reference_raw

BUNDLE = "synthetic:regimes?seed=1&days=300"
REFERENCE = load_spec("reference/dma_fgi")
SWEEP_ID = "s1"
LINEAGE = "lin"
TODAY = date(2026, 10, 10)


def _invoke(lab: Path, *argv: str) -> tuple[int, dict[str, Any]]:
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        code = main(["--lab-dir", str(lab), *argv])
    return code, json.loads(buffer.getvalue())


def _candidate_raw() -> dict[str, Any]:
    raw = reference_raw()
    raw["id"] = "guarded"
    raw["description"] = "The reference with a force-exit trend guard."
    raw["overlays"] = [
        {
            "kind": "trend_guard",
            "id": "trend_guard",
            "mode": "force_exit",
            "below_dma_buffer": 0.02,
            "confirm_days": 2,
        }
    ]
    return raw


@pytest.fixture()
def candidate(tmp_path: Path) -> Path:
    path = tmp_path / "guarded.json"
    path.write_text(json.dumps(_candidate_raw()))
    return path


@pytest.fixture()
def relaxed(tmp_path: Path) -> Path:
    """The committed policy, but willing to read synthetic data."""
    raw = json.loads(POLICY_PATH.read_text())
    raw["prerequisites"]["real_data_only"] = False
    path = tmp_path / "relaxed_policy.json"
    path.write_text(json.dumps(raw))
    return path


def _own(**overrides: Any) -> OwnChecks:
    fields: dict[str, Any] = {
        "bundle_source": "synthetic",
        "dead_parameters": [],
        "broken_hard_invariants": [],
        "events_checked": 14,
        "event_failures": [],
        "golden_differences": {},
    }
    fields.update(overrides)
    return OwnChecks(**fields)


@pytest.fixture()
def own_checks_stub(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """The four slow checks, answered by ``calls['own']``; ``calls`` records the call."""
    calls: dict[str, Any] = {"own": _own()}

    def fake(*args: Any, **kwargs: Any) -> OwnChecks:
        calls["args"] = args
        calls["kwargs"] = kwargs
        return calls["own"]

    monkeypatch.setattr(promotion_commands, "own_checks", fake)
    monkeypatch.setattr(promotion_commands, "_today", lambda: TODAY)
    return calls


def _write_sweep(lab: Path, **overrides: Any) -> None:
    sweep: dict[str, Any] = {
        "status": "ok",
        "sweep_id": SWEEP_ID,
        "fingerprint": {
            "spec": {
                "ref": "guarded@1#x",
                "behavior_hash": behavior_hash(parse_spec(_candidate_raw())),
            },
            "reference": {
                "ref": "dma_fgi@1#a22bccfabb4b",
                "behavior_hash": behavior_hash(REFERENCE),
            },
            "bundle": {"ref": "prod:1", "content_sha256": "x", "source": "prod"},
            "eval_config_hash": promotion_commands_canonical(),
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
    path = lab / "runs" / f"sweep-{SWEEP_ID}" / "sweep.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(sweep))


def promotion_commands_canonical() -> str:
    from src.services.backtesting.lab.report import hash_of, normalize
    from src.services.backtesting.lab.runner import EvalConfig

    return hash_of(normalize(EvalConfig().as_dict()))


def _write_look(lab: Path, **overrides: Any) -> None:
    look: dict[str, Any] = {
        "lineage": LINEAGE,
        "bundle": {"ref": "prod:2", "content_sha256": "y", "source": "prod"},
        "assumptions": {"fill_lag_days": 1, "slippage_rate": 0.003, "stable_apr": 0.03},
        "total_capital": 10_000.0,
        "window": {"days": 120},
        "candidate": {
            "ref": "guarded@1#x",
            "behavior_hash": behavior_hash(parse_spec(_candidate_raw())),
        },
        "reference": {
            "ref": "dma_fgi@1#a22bccfabb4b",
            "behavior_hash": behavior_hash(REFERENCE),
        },
        "edge": {"roi_pp": 1.0, "max_drawdown_pp": 0.5, "sharpe": 0.2},
    }
    look.update(overrides)
    path = lab / "holdouts" / f"{LINEAGE}.look.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(look))


def _passing_evidence(lab: Path) -> None:
    _write_sweep(lab)
    _write_look(lab)
    Ledger(lab / LEDGER_FILENAME).append(
        "sweep_trial",
        sweep=SWEEP_ID,
        spec={
            "ref": "guarded@1#x",
            "behavior_hash": behavior_hash(parse_spec(_candidate_raw())),
        },
    )


def _promote(
    lab: Path, candidate: Path, policy: Path, *extra: str
) -> tuple[int, dict[str, Any]]:
    return _invoke(
        lab,
        "promote",
        "--spec",
        str(candidate),
        "--bundle",
        BUNDLE,
        "--policy",
        str(policy),
        *extra,
    )


def test_a_candidate_with_every_piece_of_evidence_is_promotable(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _passing_evidence(tmp_path)

    code, out = _promote(
        tmp_path, candidate, relaxed, "--sweep", SWEEP_ID, "--lineage", LINEAGE
    )

    result = out["result"]
    assert (code, out["command"], out["ok"]) == (0, "promote", True)
    assert result["verdict"] == "promotable"
    assert {gate["status"] for gate in result["gates"]} == {"pass"}
    assert out["warnings"] == []
    assert result["candidate"]["ref"].startswith("guarded@1#")
    assert result["reference"]["ref"] == "dma_fgi@1#a22bccfabb4b"
    assert result["ledger"] == {"distinct_candidates": 1}
    assert result["log_entry"].startswith("### 2026-10-10 - Promotion of guarded@1#")
    assert "- **Status**: active" in result["log_entry"]
    record = tmp_path / "promotions" / f"{result['promotion_id']}.json"
    assert out["artifacts"] == [str(record)]
    stored = json.loads(record.read_text())
    assert "log_entry" not in stored
    assert stored["promotion_id"] == result["promotion_id"]
    assert stored["gates"] == result["gates"]


def test_the_checks_run_on_the_evidence_data_with_the_policys_events(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _promote(tmp_path, candidate, relaxed)

    spec, bundle = own_checks_stub["args"]
    assert spec.id == "guarded"
    assert bundle.manifest.name == "synthetic-regimes-1-300"
    kwargs = own_checks_stub["kwargs"]
    assert kwargs["events_path"] == promotion_commands.DEFAULT_EVENTS
    assert sorted(kwargs["stress"]) == sorted(promotion_commands.DEFAULT_STRESS)


def test_the_evidence_data_is_not_also_a_stress_history(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    stress = "synthetic:stress?seed=1&days=300"

    _promote(tmp_path, candidate, relaxed, "--stress", stress)
    assert list(own_checks_stub["kwargs"]["stress"]) == [stress]

    _invoke(
        tmp_path,
        "promote",
        "--spec",
        str(candidate),
        "--bundle",
        stress,
        "--policy",
        str(relaxed),
        "--stress",
        stress,
    )
    assert own_checks_stub["kwargs"]["stress"] == {}


def test_without_a_sweep_or_a_look_the_evidence_is_missing_not_failing(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    code, out = _promote(tmp_path, candidate, relaxed)

    result = out["result"]
    missing = {
        gate["name"] for gate in result["gates"] if gate["status"] == "insufficient"
    }
    assert (code, out["ok"], result["verdict"]) == (4, False, "insufficient_evidence")
    assert missing == {"canonical_assumptions", "sweep", "holdout_look"}
    assert len(out["warnings"]) == 3
    assert (tmp_path / "promotions" / f"{result['promotion_id']}.json").is_file()


def test_a_lineage_that_has_not_looked_yet_is_missing_evidence(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    code, out = _promote(tmp_path, candidate, relaxed, "--lineage", "never-looked")

    gates = {gate["name"]: gate["status"] for gate in out["result"]["gates"]}
    assert (code, gates["holdout_look"]) == (4, "insufficient")


def test_a_failed_gate_rejects_the_candidate(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _passing_evidence(tmp_path)
    own_checks_stub["own"] = _own(dead_parameters=["/rules[x]/cooldown_days"])

    code, out = _promote(
        tmp_path, candidate, relaxed, "--sweep", SWEEP_ID, "--lineage", LINEAGE
    )

    assert (code, out["ok"], out["result"]["verdict"]) == (1, False, "rejected")
    assert out["warnings"] == [
        "no_dead_parameters: fail, Parameters that change no decision: "
        "/rules[x]/cooldown_days"
    ]


def test_the_committed_policy_refuses_synthetic_data(
    tmp_path: Path, candidate: Path, own_checks_stub: dict[str, Any]
) -> None:
    del own_checks_stub

    code, out = _invoke(
        tmp_path, "promote", "--spec", str(candidate), "--bundle", BUNDLE
    )

    gates = {gate["name"]: gate for gate in out["result"]["gates"]}
    assert code in {1, 4}
    assert gates["real_data_only"]["status"] == "fail"
    assert "Synthetic data is not evidence" in gates["real_data_only"]["detail"]


def test_a_sweep_can_be_named_by_path(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _passing_evidence(tmp_path)
    path = tmp_path / "runs" / f"sweep-{SWEEP_ID}" / "sweep.json"

    code, out = _promote(
        tmp_path, candidate, relaxed, "--sweep", str(path), "--lineage", LINEAGE
    )

    assert (code, out["result"]["verdict"]) == (0, "promotable")


def test_a_sweep_of_another_candidate_does_not_vouch_for_this_one(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _write_sweep(tmp_path)
    fingerprint = copy.deepcopy(
        json.loads((tmp_path / "runs" / f"sweep-{SWEEP_ID}" / "sweep.json").read_text())
    )["fingerprint"]
    fingerprint["spec"]["behavior_hash"] = "sha256:someone-else"
    _write_sweep_fingerprint(tmp_path, fingerprint)

    _, out = _promote(tmp_path, candidate, relaxed, "--sweep", SWEEP_ID)

    gates = {gate["name"]: gate["status"] for gate in out["result"]["gates"]}
    assert gates["candidate_was_searched"] == "fail"


def _write_sweep_fingerprint(lab: Path, fingerprint: dict[str, Any]) -> None:
    path = lab / "runs" / f"sweep-{SWEEP_ID}" / "sweep.json"
    sweep = json.loads(path.read_text())
    sweep["fingerprint"] = fingerprint
    path.write_text(json.dumps(sweep))


def test_trials_come_from_the_sweep_the_ledger_names(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _write_sweep(tmp_path)
    fingerprint = json.loads(
        (tmp_path / "runs" / f"sweep-{SWEEP_ID}" / "sweep.json").read_text()
    )["fingerprint"]
    fingerprint["spec"]["behavior_hash"] = "sha256:base-of-the-sweep"
    _write_sweep_fingerprint(tmp_path, fingerprint)
    ledger = Ledger(tmp_path / LEDGER_FILENAME)
    own_hash = behavior_hash(parse_spec(_candidate_raw()))
    ledger.append(
        "sweep_trial", sweep="another", spec={"ref": "x", "behavior_hash": own_hash}
    )

    _, before = _promote(tmp_path, candidate, relaxed, "--sweep", SWEEP_ID)
    ledger.append(
        "sweep_trial", sweep=SWEEP_ID, spec={"ref": "x", "behavior_hash": own_hash}
    )
    _, after = _promote(tmp_path, candidate, relaxed, "--sweep", SWEEP_ID)

    def searched(out: dict[str, Any]) -> str:
        return {g["name"]: g["status"] for g in out["result"]["gates"]}[
            "candidate_was_searched"
        ]

    assert (searched(before), searched(after)) == ("fail", "pass")


def test_a_candidate_that_behaves_like_the_reference_has_nothing_to_promote(
    tmp_path: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    same = tmp_path / "same.json"
    raw = reference_raw()
    raw["id"] = "renamed"
    same.write_text(json.dumps(raw))

    code, out = _promote(tmp_path, same, relaxed)

    assert (code, out["result"]["code"]) == (2, "nothing_to_promote")
    assert "args" not in own_checks_stub


@pytest.mark.parametrize(
    ("argv", "code", "error"),
    [
        (["--spec", "no/such/spec.json", "--bundle", BUNDLE], 3, "spec_not_found"),
        (["--spec", "{candidate}", "--bundle", "prod:nope"], 4, "bundle_not_found"),
        (
            ["--spec", "{candidate}", "--bundle", BUNDLE, "--sweep", "nope"],
            4,
            "sweep_unreadable",
        ),
        (
            ["--spec", "{candidate}", "--bundle", BUNDLE, "--policy", "{missing}"],
            2,
            "invalid_policy",
        ),
        (
            ["--spec", "{candidate}", "--bundle", BUNDLE, "--reference", "nope/ref"],
            3,
            "spec_not_found",
        ),
    ],
)
def test_input_it_cannot_use_is_refused_before_any_work(
    tmp_path: Path,
    candidate: Path,
    own_checks_stub: dict[str, Any],
    argv: list[str],
    code: int,
    error: str,
) -> None:
    arguments = [
        item.format(candidate=candidate, missing=tmp_path / "missing.json")
        for item in argv
    ]

    status, out = _invoke(tmp_path, "promote", *arguments)

    assert (status, out["result"]["code"]) == (code, error)
    assert "args" not in own_checks_stub


def test_a_sweep_file_that_is_not_an_object_is_unreadable(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    path = tmp_path / "sweep.json"
    path.write_text("[1, 2]")

    code, out = _promote(tmp_path, candidate, relaxed, "--sweep", str(path))

    assert (code, out["result"]["code"]) == (4, "sweep_unreadable")
    assert "is not an object" in out["result"]["message"]


def test_a_broken_look_file_is_unreadable(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    (tmp_path / "holdouts").mkdir()
    (tmp_path / "holdouts" / f"{LINEAGE}.look.json").write_text("{broken")

    code, out = _promote(tmp_path, candidate, relaxed, "--lineage", LINEAGE)

    assert (code, out["result"]["code"]) == (4, "holdout_look_unreadable")


def test_a_damaged_ledger_is_reported_not_papered_over(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    (tmp_path / LEDGER_FILENAME).write_text("not json\n")

    code, out = _promote(tmp_path, candidate, relaxed)

    assert (code, out["result"]["code"]) == (4, "ledger_corrupt")


def test_a_history_with_no_days_proves_nothing(
    tmp_path: Path, candidate: Path, relaxed: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def raises(*args: Any, **kwargs: Any) -> OwnChecks:
        raise NoDaysError("no days in the window")

    monkeypatch.setattr(promotion_commands, "own_checks", raises)

    code, out = _promote(tmp_path, candidate, relaxed)

    assert (code, out["result"]["code"]) == (4, "no_days_in_window")


def test_an_events_fixture_that_does_not_exist_is_refused(
    tmp_path: Path, candidate: Path, relaxed: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        promotion_checks,
        "liveness",
        lambda *args, **kwargs: type("Report", (), {"leaves": []})(),
    )
    monkeypatch.setattr(promotion_checks, "golden_differences", lambda *args: ([], {}))

    code, out = _promote(
        tmp_path, candidate, relaxed, "--events", str(tmp_path / "no_events.json")
    )

    assert (code, out["result"]["code"]) == (2, "invalid_events")


def test_every_decision_leaves_a_trace_in_the_ledger(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    _, out = _promote(tmp_path, candidate, relaxed)

    entries = Ledger(tmp_path / LEDGER_FILENAME).entries("promotion")
    assert len(entries) == 1
    assert entries[0]["promotion"] == out["result"]["promotion_id"]
    assert entries[0]["verdict"] == "insufficient_evidence"
    assert entries[0]["spec"]["ref"] == out["result"]["candidate"]["ref"]
    assert entries[0]["policy"] == out["result"]["policy"]["hash"]
    assert out["result"]["ledger"]["distinct_candidates"] == 0


def test_a_real_sweep_and_a_real_look_feed_a_promotion(
    tmp_path: Path, candidate: Path, relaxed: Path, own_checks_stub: dict[str, Any]
) -> None:
    """The files the lab writes are the files a promotion reads."""
    long_history = "synthetic:regimes?seed=1&days=760"
    space = tmp_path / "space.json"
    space.write_text(
        json.dumps(
            {
                "parameters": [
                    {
                        "pointer": "/overlays[trend_guard]/confirm_days",
                        "values": [1, 2, 3],
                    }
                ],
                "sampling": {"method": "grid"},
            }
        )
    )
    _, swept = _invoke(
        tmp_path,
        "sweep",
        "--spec",
        str(candidate),
        "--reference",
        "reference/dma_fgi",
        "--bundle",
        long_history,
        "--space",
        str(space),
    )
    sweep_id = swept["result"]["sweep_id"]
    _invoke(tmp_path, "holdout", "init", "--lineage", LINEAGE, "--bundle", BUNDLE)
    _invoke(
        tmp_path,
        "holdout",
        "look",
        "--lineage",
        LINEAGE,
        "--spec",
        str(candidate),
        "--bundle",
        long_history,
    )

    _, out = _promote(
        tmp_path, candidate, relaxed, "--sweep", sweep_id, "--lineage", LINEAGE
    )

    gates = {gate["name"]: gate for gate in out["result"]["gates"]}
    for name in (
        "canonical_assumptions",
        "judged_against_reference",
        "candidate_was_searched",
        "folds",
        "holdout_look",
    ):
        assert gates[name]["status"] == "pass", gates[name]
    # The numbers behind the bars are the ones the sweep and the look reported.
    fold_edges = swept["result"]["aggregate"]
    assert gates["fold_win_rate"]["value"] == fold_edges["fold_win_rate"]
    assert gates["mean_oos_edge_pp"]["value"] == fold_edges["mean_oos_edge_pp"]
    assert gates["fold_drawdown"]["value"] == min(
        fold["oos"]["max_drawdown_pp"] for fold in swept["result"]["folds"]
    )
    assert (
        gates["deflated_sharpe"]["value"] == swept["result"]["deflated_sharpe"]["value"]
    )
    assert out["result"]["evidence"]["holdout"]["lineage"] == LINEAGE
    assert out["result"]["evidence"]["sweep"]["sweep_id"] == sweep_id


def test_the_entry_is_dated_with_todays_date_in_utc() -> None:
    assert promotion_commands._today() == datetime.now(UTC).date()


SHORT_SUITE = ["synthetic:regimes?seed=2&days=120", "synthetic:stress?seed=3&days=120"]


@pytest.fixture()
def structural_policy(tmp_path: Path) -> Path:
    """The committed policy, willing to read synthetic data, with a short suite."""
    raw = json.loads(POLICY_PATH.read_text())
    raw["prerequisites"]["real_data_only"] = False
    raw["structural"]["stress_suite"]["bundles"] = SHORT_SUITE
    path = tmp_path / "structural_policy.json"
    path.write_text(json.dumps(raw))
    return path


def _structural_candidate(tmp_path: Path, name: str, edit: Any) -> Path:
    raw = reference_raw()
    raw["id"] = name
    edit(raw)
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(raw))
    return path


def _without_downshift(raw: dict[str, Any]) -> None:
    raw["rules"] = [r for r in raw["rules"] if r["id"] != "fgi_downshift_dca_sell"]


def _tuned_exit(raw: dict[str, Any]) -> None:
    next(r for r in raw["rules"] if r["id"] == "cross_down_exit")["cooldown_days"] = 21


@pytest.fixture()
def structural_stub(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Passing structural evidence; ``calls`` records what the command asked for."""
    calls: dict[str, Any] = {}

    def fake(reference: Any, candidate: Any, **kwargs: Any) -> StructuralEvidence:
        calls["specs"] = (reference.id, candidate.id)
        calls["kwargs"] = kwargs
        suite = kwargs["suite"]
        return StructuralEvidence(
            issues=[],
            eval_config_hash=promotion_commands_canonical(),
            real={"roi_pp": 1.0, "max_drawdown_pp": 0.5},
            stress={
                ref: {
                    "base": {"roi_percent": 1.0, "max_drawdown_percent": -5.0},
                    "candidate": {"roi_percent": 2.0, "max_drawdown_percent": -4.0},
                }
                for ref in suite
            },
        )

    monkeypatch.setattr(promotion_commands, "structural_checks", fake)
    return calls


def test_a_structural_candidate_is_promoted_without_a_sweep_or_a_look(
    tmp_path: Path,
    structural_policy: Path,
    own_checks_stub: dict[str, Any],
    structural_stub: dict[str, Any],
) -> None:
    candidate = _structural_candidate(tmp_path, "no_downshift", _without_downshift)

    code, out = _promote(
        tmp_path, candidate, structural_policy, "--track", "structural"
    )

    result = out["result"]
    assert (code, result["verdict"], result["track"]) == (0, "promotable", "structural")
    assert [gate["name"] for gate in result["gates"]][-5:] == [
        "structural_change",
        "real_roi",
        "real_drawdown",
        "stress_median_roi",
        "stress_median_drawdown",
    ]
    assert {gate["group"] for gate in result["gates"]} == {"prerequisite", "structural"}
    assert result["evidence"]["sweep"] is None
    assert result["evidence"]["holdout"] is None
    assert sorted(result["evidence"]["structural"]["stress_suite"]) == sorted(
        SHORT_SUITE
    )
    assert " on the structural track: " in result["log_entry"]
    entries = Ledger(tmp_path / LEDGER_FILENAME).entries("promotion")
    assert [(entry["track"], entry["verdict"]) for entry in entries] == [
        ("structural", "promotable")
    ]


def test_the_structural_track_runs_the_policys_suite_against_the_real_comparison(
    tmp_path: Path,
    structural_policy: Path,
    own_checks_stub: dict[str, Any],
    structural_stub: dict[str, Any],
) -> None:
    candidate = _structural_candidate(tmp_path, "no_downshift", _without_downshift)

    _, out = _promote(tmp_path, candidate, structural_policy, "--track", "structural")

    assert structural_stub["specs"] == ("dma_fgi", "no_downshift")
    kwargs = structural_stub["kwargs"]
    assert list(kwargs["suite"]) == SHORT_SUITE
    assert kwargs["real"] == out["result"]["comparison"]
    assert kwargs["config"].as_dict() == promotion_commands.EvalConfig().as_dict()


@pytest.mark.parametrize("flag", [["--sweep", SWEEP_ID], ["--lineage", LINEAGE]])
def test_the_structural_track_refuses_search_evidence(
    tmp_path: Path,
    structural_policy: Path,
    own_checks_stub: dict[str, Any],
    flag: list[str],
) -> None:
    candidate = _structural_candidate(tmp_path, "no_downshift", _without_downshift)

    code, out = _promote(
        tmp_path, candidate, structural_policy, "--track", "structural", *flag
    )

    assert (code, out["result"]["code"]) == (2, "not_on_this_track")
    assert flag[0] in out["result"]["message"]
    assert "args" not in own_checks_stub


def test_the_committed_policy_rejects_a_structural_candidate_on_synthetic_data(
    tmp_path: Path, own_checks_stub: dict[str, Any], structural_stub: dict[str, Any]
) -> None:
    candidate = _structural_candidate(tmp_path, "no_downshift", _without_downshift)

    code, out = _invoke(
        tmp_path,
        "promote",
        "--track",
        "structural",
        "--spec",
        str(candidate),
        "--bundle",
        BUNDLE,
    )

    gates = {gate["name"]: gate["status"] for gate in out["result"]["gates"]}
    assert (code, out["result"]["verdict"]) == (1, "rejected")
    assert gates["real_data_only"] == "fail"
    assert list(structural_stub["kwargs"]["suite"]) == list(
        json.loads(POLICY_PATH.read_text())["structural"]["stress_suite"]["bundles"]
    )


def test_a_candidate_that_moves_a_number_fails_the_structural_check(
    tmp_path: Path, structural_policy: Path, own_checks_stub: dict[str, Any]
) -> None:
    candidate = _structural_candidate(tmp_path, "tuned_exit", _tuned_exit)

    code, out = _promote(
        tmp_path, candidate, structural_policy, "--track", "structural"
    )

    gate = next(
        gate for gate in out["result"]["gates"] if gate["name"] == "structural_change"
    )
    assert (code, out["result"]["verdict"], gate["status"]) == (1, "rejected", "fail")
    assert gate["value"] == ["/rules[cross_down_exit]/cooldown_days"]
    assert out["result"]["evidence"]["structural"]["issues"][0]["code"] == (
        "tuned_parameter"
    )


def test_the_structural_gates_read_the_numbers_the_runs_produced(
    tmp_path: Path, structural_policy: Path, own_checks_stub: dict[str, Any]
) -> None:
    candidate = _structural_candidate(tmp_path, "no_downshift", _without_downshift)

    _, out = _promote(tmp_path, candidate, structural_policy, "--track", "structural")

    result = out["result"]
    gates = {gate["name"]: gate for gate in result["gates"]}
    assert gates["real_roi"]["value"] == result["comparison"]["roi_pp"]
    assert gates["real_drawdown"]["value"] == result["comparison"]["max_drawdown_pp"]
    suite = result["evidence"]["structural"]["stress_suite"]
    assert sorted(suite) == sorted(SHORT_SUITE)

    def median_edge(metric: str) -> float:
        def median(side: str) -> float:
            values = sorted(suite[ref][side][metric] for ref in SHORT_SUITE)
            return (values[0] + values[1]) / 2

        return median("candidate") - median("base")

    # The record keeps six decimals.
    assert gates["stress_median_roi"]["value"] == pytest.approx(
        median_edge("roi_percent"), abs=1e-6
    )
    assert gates["stress_median_drawdown"]["value"] == pytest.approx(
        median_edge("max_drawdown_percent"), abs=1e-6
    )

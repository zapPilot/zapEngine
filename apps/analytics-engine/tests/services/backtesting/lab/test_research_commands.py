from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab import research_commands
from src.services.backtesting.lab.bundle import (
    build_manifest,
    synthetic_bundle,
    write_bundle,
)
from src.services.backtesting.lab.cli import main
from src.services.backtesting.lab.holdout import read_pin
from src.services.backtesting.lab.ledger import LEDGER_FILENAME
from tests.services.backtesting.spec.helpers import REFERENCE_REF, reference_raw

PRIMARY = "synthetic:regimes?seed=1&days=300"
STRESS = "synthetic:stress?seed=6&days=400"
LONG = "synthetic:regimes?seed=1&days=760"
SHORT = "synthetic:regimes?seed=1&days=400"
COOLDOWN = "/rules[cross_down_exit]/cooldown_days"
STEP = "/rules[dma_overextension_dca_sell]/sell_step"
KNOBS = (
    "--only",
    "/signals/dma/cross_on_touch",
    "--only",
    "/signals/ratio",
    "--only",
    "/rules[cross_down_exit]",
)


def _invoke(lab: Path, *argv: str) -> tuple[int, dict[str, Any]]:
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        code = main(["--lab-dir", str(lab), *argv])
    return code, json.loads(buffer.getvalue())


def _space(directory: Path, **overrides: Any) -> Path:
    space: dict[str, Any] = {
        "parameters": [
            {"pointer": COOLDOWN, "values": [15, 30, 60]},
            {"pointer": STEP, "values": [0.025, 0.05]},
        ],
        "sampling": {"method": "grid"},
    }
    space.update(overrides)
    path = directory / "space.json"
    path.write_text(json.dumps(space))
    return path


def _store(lab: Path, *, days: int, name: str = "prod") -> Path:
    """Keep a synthetic history in the lab under ``name``, as a recording would be."""
    made = synthetic_bundle(f"synthetic:regimes?seed=1&days={days}")
    manifest = build_manifest(
        name=name,
        source=made.manifest.source,
        prices=made.prices,
        sentiments=made.sentiments,
        start=made.manifest.start,
        end=made.manifest.end,
        requirements=made.manifest.requirements,
    )
    return write_bundle(
        lab / "bundles",
        manifest=manifest,
        prices=made.prices,
        sentiments=made.sentiments,
    )


def _candidate(directory: Path) -> Path:
    """The reference without its exit rule."""
    raw = reference_raw()
    raw["id"] = "no_exit"
    raw["rules"] = [rule for rule in raw["rules"] if rule["id"] != "cross_down_exit"]
    path = directory / "no_exit.json"
    path.write_text(json.dumps(raw))
    return path


# liveness


def test_liveness_names_each_knob_and_fails_the_gate_on_a_dead_one(
    tmp_path: Path,
) -> None:
    code, out = _invoke(
        tmp_path,
        "liveness",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--stress",
        STRESS,
        *KNOBS,
    )

    assert (code, out["command"], out["ok"], out["exit_code"]) == (
        1,
        "liveness",
        False,
        1,
    )
    result = out["result"]
    status = {leaf["pointer"]: leaf["status"] for leaf in result["leaves"]}
    assert status == {
        "/signals/dma/cross_on_touch": "dormant",
        "/signals/ratio/cross_cooldown_days": "dead",
        COOLDOWN: "live",
    }
    assert result["summary"] == {"live": 1, "dormant": 1, "dead": 1, "unprobed": 0}
    assert result["primary"] == [PRIMARY]
    assert result["days"][PRIMARY] > 250 and result["days"][STRESS] > 350
    assert result["spec"]["ref"].startswith("dma_fgi@")
    assert out["warnings"] == ["Dead parameter: /signals/ratio/cross_cooldown_days"]
    [artifact] = out["artifacts"]
    saved = json.loads(Path(artifact).read_text())
    assert Path(artifact).name == "liveness.json"
    assert Path(artifact).parent.name.startswith("liveness-")
    assert saved["leaves"] == result["leaves"]


def test_liveness_passes_when_nothing_probed_is_dead(tmp_path: Path) -> None:
    code, out = _invoke(
        tmp_path,
        "liveness",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--stress",
        STRESS,
        "--only",
        COOLDOWN,
    )

    assert (code, out["ok"], out["warnings"]) == (0, True, [])
    assert out["result"]["summary"]["live"] == 1


def test_liveness_without_stress_uses_six_stress_histories(tmp_path: Path) -> None:
    code, out = _invoke(
        tmp_path,
        "liveness",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--only",
        "/signals/dma/cross_on_touch",
    )

    result = out["result"]
    assert code == 0
    assert result["bundles"] == [PRIMARY, *research_commands.DEFAULT_STRESS]
    assert len(research_commands.DEFAULT_STRESS) == 6
    assert result["leaves"][0]["status"] == "dormant"


def test_a_stress_history_that_is_also_primary_runs_once(tmp_path: Path) -> None:
    _, out = _invoke(
        tmp_path,
        "liveness",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--stress",
        PRIMARY,
        "--only",
        COOLDOWN,
    )

    assert out["result"]["bundles"] == [PRIMARY]


def test_liveness_is_noted_in_the_ledger(tmp_path: Path) -> None:
    _invoke(
        tmp_path,
        "liveness",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--stress",
        STRESS,
        "--only",
        COOLDOWN,
    )

    [entry] = [
        json.loads(line)
        for line in (tmp_path / LEDGER_FILENAME).read_text().splitlines()
    ]
    assert entry["kind"] == "liveness"
    assert entry["summary"]["live"] == 1
    assert entry["bundles"] == [PRIMARY, STRESS]


@pytest.mark.parametrize(
    ("argv", "code", "reason"),
    [
        (("--spec", "reference/nope", "--bundle", PRIMARY), 3, "spec_not_found"),
        (("--spec", REFERENCE_REF, "--bundle", "nope:latest"), 4, "bundle_not_found"),
        (
            ("--spec", REFERENCE_REF, "--bundle", PRIMARY, "--stress", "nope:latest"),
            4,
            "bundle_not_found",
        ),
    ],
)
def test_liveness_reports_a_spec_or_bundle_it_cannot_load(
    tmp_path: Path, argv: tuple[str, ...], code: int, reason: str
) -> None:
    exit_code, out = _invoke(tmp_path, "liveness", *argv)

    assert (exit_code, out["result"]["code"]) == (code, reason)


def test_a_history_with_no_days_in_the_window_proves_nothing(tmp_path: Path) -> None:
    code, out = _invoke(
        tmp_path,
        "liveness",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--start",
        "2031-01-01",
        "--end",
        "2031-02-01",
        "--only",
        COOLDOWN,
    )

    assert (code, out["ok"], out["result"]["code"]) == (4, False, "no_days_in_window")
    assert PRIMARY in out["result"]["message"]
    # Declaring every knob dead on an empty window would be a false verdict.
    assert not (tmp_path / "runs").exists()


# sweep


@pytest.fixture(scope="module")
def swept(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, int, dict[str, Any]]:
    lab = tmp_path_factory.mktemp("swept")
    code, out = _invoke(
        lab,
        "sweep",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        LONG,
        "--space",
        str(_space(lab)),
    )
    return lab, code, out


def test_a_sweep_writes_its_result_and_the_trials_it_ran(
    swept: tuple[Path, int, dict[str, Any]],
) -> None:
    lab, code, out = swept

    assert (code, out["command"], out["ok"]) == (0, "sweep", True)
    result = out["result"]
    assert result["status"] == "ok"
    assert result["trials"]["valid"] == 6
    [artifact] = out["artifacts"]
    assert Path(artifact) == lab / "runs" / f"sweep-{result['sweep_id']}" / "sweep.json"
    assert json.loads(Path(artifact).read_text()) == result
    assert out["warnings"] == result["warnings"]
    assert any("not validated" in warning for warning in out["warnings"])


def test_every_trial_of_a_sweep_is_in_the_ledger(
    swept: tuple[Path, int, dict[str, Any]],
) -> None:
    lab, _, out = swept

    code, summary = _invoke(lab, "ledger", "summary")

    assert code == 0
    assert summary["result"]["kinds"] == {"sweep": 1, "sweep_trial": 6}
    assert summary["result"]["distinct_candidates"] == 6
    assert out["result"]["deflated_sharpe"]["trials"] == 6


def test_a_sweep_takes_the_assumptions(
    swept: tuple[Path, int, dict[str, Any]], tmp_path: Path
) -> None:
    _, _, honest = swept

    code, out = _invoke(
        tmp_path,
        "sweep",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        LONG,
        "--space",
        str(_space(tmp_path)),
        "--fill-lag",
        "0",
        "--slippage",
        "0",
        "--stable-apr",
        "0.05",
        "--capital",
        "5000",
    )

    assert code == 0
    assert (
        out["result"]["fingerprint"]["eval_config_hash"]
        != honest["result"]["fingerprint"]["eval_config_hash"]
    )


def test_too_little_history_exits_4_and_says_why(tmp_path: Path) -> None:
    code, out = _invoke(
        tmp_path,
        "sweep",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        SHORT,
        "--space",
        str(_space(tmp_path)),
    )

    assert (code, out["ok"], out["exit_code"]) == (4, False, 4)
    assert out["result"]["status"] == "insufficient_evidence"
    assert any("walk-forward folds fit" in reason for reason in out["warnings"])
    [artifact] = out["artifacts"]
    assert Path(artifact).name == "sweep.json"
    # Nothing was tried, so the ledger has nothing to count.
    assert not (tmp_path / LEDGER_FILENAME).exists()


def test_a_missing_or_broken_space_file_exits_2(tmp_path: Path) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text("{not json")
    runs = []
    for space in (tmp_path / "missing.json", broken):
        code, out = _invoke(
            tmp_path,
            "sweep",
            "--spec",
            REFERENCE_REF,
            "--bundle",
            LONG,
            "--space",
            str(space),
        )
        runs.append((code, out["result"]["code"]))

    assert runs == [(2, "invalid_search_space")] * 2


def test_a_pointer_that_is_not_tunable_exits_2_naming_the_choices(
    tmp_path: Path,
) -> None:
    space = _space(
        tmp_path, parameters=[{"pointer": "/id", "values": ["a_name", "other"]}]
    )

    code, out = _invoke(
        tmp_path,
        "sweep",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        LONG,
        "--space",
        str(space),
    )

    assert (code, out["result"]["code"]) == (2, "invalid_search_space")
    assert "the tunable pointers are" in out["result"]["message"]


def test_assumptions_the_engine_would_not_accept_exit_2(tmp_path: Path) -> None:
    code, out = _invoke(
        tmp_path,
        "sweep",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        LONG,
        "--space",
        str(_space(tmp_path)),
        "--fill-lag",
        "7",
    )

    assert (code, out["result"]["code"]) == (2, "invalid_assumptions")


@pytest.mark.parametrize(
    ("spec", "bundle", "code", "reason"),
    [
        ("reference/nope", LONG, 3, "spec_not_found"),
        (REFERENCE_REF, "nope:latest", 4, "bundle_not_found"),
    ],
)
def test_a_sweep_needs_a_spec_and_a_bundle(
    tmp_path: Path, spec: str, bundle: str, code: int, reason: str
) -> None:
    exit_code, out = _invoke(
        tmp_path,
        "sweep",
        "--spec",
        spec,
        "--bundle",
        bundle,
        "--space",
        str(_space(tmp_path)),
    )

    assert (exit_code, out["result"]["code"]) == (code, reason)


# holdout


def test_a_pin_records_the_last_day_and_the_bundle(tmp_path: Path) -> None:
    _store(tmp_path, days=300)

    code, out = _invoke(
        tmp_path,
        "holdout",
        "init",
        "--lineage",
        "dca-tuning",
        "--bundle",
        "prod:latest",
    )

    result = out["result"]
    assert (code, out["command"], out["ok"]) == (0, "holdout init", True)
    assert result["lineage"] == "dca-tuning"
    assert result["bundle"]["name"] == "prod"
    assert result["new_days"] == 0 and result["ready"] is False
    assert result["days_remaining"] == 90
    [artifact] = out["artifacts"]
    assert Path(artifact) == tmp_path / "holdouts" / "dca-tuning.json"
    assert (
        read_pin(tmp_path / "holdouts", "dca-tuning").pin_date.isoformat()
        == (result["pin_date"])
    )


def test_a_pin_is_never_moved(tmp_path: Path) -> None:
    _store(tmp_path, days=300)
    args = ("holdout", "init", "--lineage", "dca-tuning", "--bundle", "prod:latest")
    _invoke(tmp_path, *args)

    code, out = _invoke(tmp_path, *args)

    assert (code, out["result"]["code"]) == (1, "holdout_exists")


@pytest.mark.parametrize("name", ["Upper", "has space", "-leading", ""])
def test_a_lineage_name_is_a_plain_slug(tmp_path: Path, name: str) -> None:
    code, out = _invoke(
        tmp_path, "holdout", "init", f"--lineage={name}", "--bundle", PRIMARY
    )

    assert (code, out["result"]["code"]) == (2, "invalid_lineage")


def test_the_status_follows_the_latest_data_of_the_pinned_name(tmp_path: Path) -> None:
    _store(tmp_path, days=300)
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", "prod:latest")

    _, waiting = _invoke(tmp_path, "holdout", "status", "--lineage", "lin")
    _store(tmp_path, days=420)
    code, ready = _invoke(tmp_path, "holdout", "status", "--lineage", "lin")

    assert code == 0
    assert (waiting["result"]["new_days"], waiting["result"]["ready"]) == (0, False)
    assert ready["result"]["new_days"] == 120
    assert (ready["result"]["ready"], ready["result"]["days_remaining"]) == (True, 0)
    assert ready["result"]["looked"] is False


def test_the_status_can_be_given_newer_data(tmp_path: Path) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)

    code, out = _invoke(
        tmp_path, "holdout", "status", "--lineage", "lin", "--bundle", SHORT
    )

    assert code == 0
    assert out["result"]["new_days"] > 90 and out["result"]["ready"] is True


def test_the_status_without_findable_data_cannot_say_how_much_is_new(
    tmp_path: Path,
) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)

    code, out = _invoke(tmp_path, "holdout", "status", "--lineage", "lin")

    assert code == 0
    assert out["result"]["new_days"] is None and out["result"]["ready"] is False
    assert out["result"]["days_remaining"] is None


def test_the_status_of_data_that_was_named_but_is_missing_exits_4(
    tmp_path: Path,
) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)

    code, out = _invoke(
        tmp_path, "holdout", "status", "--lineage", "lin", "--bundle", "nope:latest"
    )

    assert (code, out["result"]["code"]) == (4, "bundle_not_found")


def test_a_lineage_that_was_never_pinned_has_no_status_and_no_look(
    tmp_path: Path,
) -> None:
    status = _invoke(tmp_path, "holdout", "status", "--lineage", "ghost")
    look = _invoke(
        tmp_path,
        "holdout",
        "look",
        "--lineage",
        "ghost",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        SHORT,
    )

    for code, out in (status, look):
        assert (code, out["result"]["code"]) == (5, "holdout_not_initialized")


def test_a_look_before_enough_new_data_arrives_is_refused_and_not_spent(
    tmp_path: Path,
) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)

    code, out = _invoke(
        tmp_path,
        "holdout",
        "look",
        "--lineage",
        "lin",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
    )

    assert (code, out["result"]["code"]) == (5, "holdout_needs_new_data")
    assert "90 more are needed" in out["result"]["message"]
    assert read_pin(tmp_path / "holdouts", "lin").looked is None


def test_one_look_compares_a_candidate_with_the_reference_on_the_new_data(
    tmp_path: Path,
) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)
    candidate = _candidate(tmp_path)

    code, out = _invoke(
        tmp_path,
        "holdout",
        "look",
        "--lineage",
        "lin",
        "--spec",
        str(candidate),
        "--bundle",
        SHORT,
    )

    assert (code, out["command"], out["ok"]) == (0, "holdout look", True)
    result = out["result"]
    pin = read_pin(tmp_path / "holdouts", "lin")
    assert result["lineage"] == "lin"
    assert result["window"]["start"] > pin.pin_date.isoformat()
    assert result["candidate"]["ref"].startswith("no_exit@")
    assert result["reference"]["ref"].startswith("dma_fgi@")
    own, other = result["candidate"], result["reference"]
    assert result["edge"]["roi_pp"] == pytest.approx(
        own["roi_percent"] - other["roi_percent"], abs=1e-5
    )
    assert set(result["report_hashes"]) == {"candidate", "reference"}
    assert "only look" in result["note"]
    assert pin.looked is not None
    assert pin.looked["spec"]["ref"] == result["candidate"]["ref"]
    assert pin.looked["window_start"] == result["window"]["start"]


def test_the_look_belongs_to_the_lineage_not_to_a_candidate(tmp_path: Path) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)
    args = ("holdout", "look", "--lineage", "lin", "--bundle", SHORT)
    _invoke(tmp_path, *args, "--spec", REFERENCE_REF)

    code, out = _invoke(tmp_path, *args, "--spec", str(_candidate(tmp_path)))

    assert (code, out["result"]["code"]) == (5, "holdout_already_looked")
    status = _invoke(tmp_path, "holdout", "status", "--lineage", "lin")[1]["result"]
    assert status["looked"] is True and status["ready"] is False


def test_a_look_is_spent_before_anything_is_computed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)

    def fail(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("the evaluation crashed")

    monkeypatch.setattr(research_commands, "evaluate", fail)

    with pytest.raises(RuntimeError, match="crashed"):
        _invoke(
            tmp_path,
            "holdout",
            "look",
            "--lineage",
            "lin",
            "--spec",
            REFERENCE_REF,
            "--bundle",
            SHORT,
        )

    assert read_pin(tmp_path / "holdouts", "lin").looked is not None


def test_a_look_takes_another_reference_and_the_assumptions(tmp_path: Path) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)
    reference = _candidate(tmp_path)

    code, out = _invoke(
        tmp_path,
        "holdout",
        "look",
        "--lineage",
        "lin",
        "--spec",
        REFERENCE_REF,
        "--reference",
        str(reference),
        "--bundle",
        SHORT,
        "--fill-lag",
        "0",
        "--slippage",
        "0",
    )

    assert code == 0
    assert out["result"]["reference"]["ref"].startswith("no_exit@")


def test_a_look_needs_a_spec_a_reference_and_a_bundle_that_exist(
    tmp_path: Path,
) -> None:
    _invoke(tmp_path, "holdout", "init", "--lineage", "lin", "--bundle", PRIMARY)
    base = ("holdout", "look", "--lineage", "lin")

    bad_spec = _invoke(tmp_path, *base, "--spec", "reference/nope", "--bundle", SHORT)
    bad_reference = _invoke(
        tmp_path,
        *base,
        "--spec",
        REFERENCE_REF,
        "--reference",
        "reference/nope",
        "--bundle",
        SHORT,
    )
    bad_bundle = _invoke(
        tmp_path, *base, "--spec", REFERENCE_REF, "--bundle", "nope:latest"
    )

    assert [
        (code, out["result"]["code"]) for code, out in (bad_spec, bad_reference)
    ] == [(3, "spec_not_found")] * 2
    assert (bad_bundle[0], bad_bundle[1]["result"]["code"]) == (4, "bundle_not_found")
    assert read_pin(tmp_path / "holdouts", "lin").looked is None


# ledger


def test_an_empty_ledger_has_nothing_to_count(tmp_path: Path) -> None:
    code, out = _invoke(tmp_path, "ledger", "summary")

    assert code == 0
    assert out["result"] == {
        "entries": 0,
        "kinds": {},
        "distinct_candidates": 0,
        "first": None,
        "last": None,
    }
    assert _invoke(tmp_path, "ledger", "show")[1]["result"] == {
        "total": 0,
        "entries": [],
    }


def test_every_evaluation_leaves_a_trace(tmp_path: Path) -> None:
    candidate = _candidate(tmp_path)
    _invoke(
        tmp_path,
        "eval",
        "--spec",
        REFERENCE_REF,
        "--bundle",
        PRIMARY,
        "--no-leave-one-out",
    )
    _invoke(tmp_path, "ablate", "--spec", REFERENCE_REF, "--bundle", PRIMARY)
    _invoke(
        tmp_path,
        "diff",
        "--base",
        REFERENCE_REF,
        "--candidate",
        str(candidate),
        "--bundle",
        PRIMARY,
    )

    _, out = _invoke(tmp_path, "ledger", "summary")

    result = out["result"]
    assert result["kinds"] == {"ablate": 1, "compare": 2, "eval": 1}
    assert result["entries"] == 4
    # The reference and the candidate: two different behaviors, however often run.
    assert result["distinct_candidates"] == 2
    assert result["first"] <= result["last"]


def test_the_ledger_shows_the_latest_entries_of_a_kind(tmp_path: Path) -> None:
    for _ in range(2):
        _invoke(
            tmp_path,
            "eval",
            "--spec",
            REFERENCE_REF,
            "--bundle",
            PRIMARY,
            "--no-leave-one-out",
        )
    _invoke(tmp_path, "ablate", "--spec", REFERENCE_REF, "--bundle", PRIMARY)

    _, everything = _invoke(tmp_path, "ledger", "show")
    _, evals = _invoke(tmp_path, "ledger", "show", "--kind", "eval", "--limit", "1")
    _, none = _invoke(tmp_path, "ledger", "show", "--limit", "0")

    assert everything["result"]["total"] == 3
    assert [entry["kind"] for entry in everything["result"]["entries"]] == [
        "eval",
        "eval",
        "ablate",
    ]
    assert evals["result"]["total"] == 2
    [entry] = evals["result"]["entries"]
    assert entry["kind"] == "eval"
    assert entry["spec"]["ref"].startswith("dma_fgi@")
    assert entry["report_hash"].startswith("sha256:")
    assert none["result"] == {"total": 3, "entries": []}


@pytest.mark.parametrize("command", ["summary", "show"])
def test_a_damaged_ledger_is_reported_not_papered_over(
    tmp_path: Path, command: str
) -> None:
    (tmp_path / LEDGER_FILENAME).write_text('{"kind": "eval"}\n{broken\n')

    code, out = _invoke(tmp_path, "ledger", command)

    assert (code, out["result"]["code"]) == (4, "ledger_corrupt")
    assert "ledger.jsonl:2" in out["result"]["message"]

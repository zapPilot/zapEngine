from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab import golden
from src.services.backtesting.lab.cli import main
from src.services.backtesting.spec import load_spec
from tests.services.backtesting.spec.helpers import REFERENCE_REF, reference_raw

FIXTURE = "tests/fixtures/strategy_specs/all_research_rules.json"
ONE_HISTORY = (("regimes", 1),)


def _invoke(*argv: str) -> tuple[int, dict[str, Any]]:
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        code = main(list(argv))
    return code, json.loads(buffer.getvalue())


@pytest.fixture
def quick(monkeypatch: pytest.MonkeyPatch) -> None:
    """One synthetic history instead of six: the mechanics do not need more."""
    monkeypatch.setattr(golden, "SCENARIOS", ONE_HISTORY)


def test_the_committed_golden_is_what_the_specs_do_today() -> None:
    code, out = _invoke("golden", "--check")

    assert (code, out["ok"], out["command"]) == (0, True, "golden")
    assert out["result"] == {
        "checked": list(golden.DEFAULT_SPECS),
        "differences": {},
    }
    assert out["warnings"] == []


def test_the_golden_file_has_a_pin_for_every_history_of_every_default_spec() -> None:
    recorded = golden.read(golden.GOLDEN_PATH)

    assert list(recorded) == list(golden.DEFAULT_SPECS)
    for entry in recorded.values():
        assert list(entry["scenarios"]) == [
            golden.scenario_key(scenario, seed) for scenario, seed in golden.SCENARIOS
        ]
        assert entry["behavior_hash"].startswith("sha256:")


def test_the_fixture_spec_uses_the_kinds_the_reference_does_not() -> None:
    reference = load_spec(REFERENCE_REF)
    fixture = load_spec(str(golden.APP_ROOT / FIXTURE))

    assert fixture.rules[: len(reference.rules)] == reference.rules
    assert {rule.kind for rule in fixture.rules} - {
        rule.kind for rule in reference.rules
    } == {"technical_trim", "technical_add"}
    assert [overlay.kind for overlay in fixture.overlays] == ["spy_latch"]
    assert [guard.kind for guard in fixture.guards] == ["trade_quota"]


def test_a_golden_is_written_then_checked(tmp_path: Path, quick: None) -> None:
    file = tmp_path / "golden.json"

    write_code, written = _invoke(
        "golden", "--file", str(file), "--spec", REFERENCE_REF
    )
    check_code, checked = _invoke("golden", "--check", "--file", str(file))

    assert (write_code, written["result"]["written"]) == (0, [REFERENCE_REF])
    assert written["artifacts"] == [str(file)]
    assert (check_code, checked["result"]) == (
        0,
        {"checked": [REFERENCE_REF], "differences": {}},
    )
    document = json.loads(file.read_text())
    assert (document["format"], document["days"]) == ("golden-traces/1", 400)
    assert file.read_text() == golden.render(golden.read(file))


def test_a_changed_digest_fails_the_gate_and_says_what_moved(
    tmp_path: Path, quick: None
) -> None:
    file = tmp_path / "golden.json"
    _invoke("golden", "--file", str(file), "--spec", REFERENCE_REF)
    document = json.loads(file.read_text())
    scenario = document["specs"][REFERENCE_REF]["scenarios"]["regimes?seed=1"]
    scenario["digest"] = "0" * 64
    scenario["trade_count"] += 1
    file.write_text(json.dumps(document))

    code, out = _invoke("golden", "--check", "--file", str(file))

    assert (code, out["ok"], out["exit_code"]) == (1, False, 1)
    problems = out["result"]["differences"][REFERENCE_REF]
    assert [problem.split(" was ")[0] for problem in problems] == [
        "regimes?seed=1: digest",
        "regimes?seed=1: trade_count",
    ]
    assert out["warnings"] == [f"{REFERENCE_REF}: {problem}" for problem in problems]


def test_a_spec_whose_behavior_changed_fails_before_any_digest_is_compared(
    tmp_path: Path, quick: None
) -> None:
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps(reference_raw()))
    file = tmp_path / "golden.json"
    _invoke("golden", "--file", str(file), "--spec", str(spec))
    raw = reference_raw()
    raw["signals"]["warmup_days"] = 15
    spec.write_text(json.dumps(raw))

    code, out = _invoke("golden", "--check", "--file", str(file))

    assert code == 1
    [problem] = out["result"]["differences"][str(spec)]
    assert "the spec's behavior changed" in problem
    assert "bump its version, then regenerate" in problem


def test_a_history_that_is_not_recorded_or_not_run_is_a_difference(
    tmp_path: Path, quick: None
) -> None:
    file = tmp_path / "golden.json"
    _invoke("golden", "--file", str(file), "--spec", REFERENCE_REF)
    document = json.loads(file.read_text())
    scenarios = document["specs"][REFERENCE_REF]["scenarios"]
    scenarios["stress?seed=9"] = scenarios.pop("regimes?seed=1")
    file.write_text(json.dumps(document))

    _, out = _invoke("golden", "--check", "--file", str(file))

    assert out["result"]["differences"][REFERENCE_REF] == [
        "regimes?seed=1: not recorded",
        "stress?seed=9: recorded but not run",
    ]


def test_a_spec_the_file_does_not_record_fails_the_gate(
    tmp_path: Path, quick: None
) -> None:
    file = tmp_path / "golden.json"
    _invoke("golden", "--file", str(file), "--spec", REFERENCE_REF)

    code, out = _invoke("golden", "--check", "--file", str(file), "--spec", FIXTURE)

    assert (code, out["result"]["code"]) == (1, "golden_not_recorded")
    assert FIXTURE in out["result"]["message"]


@pytest.mark.parametrize(
    "content",
    [
        None,
        "{not json",
        "[]",
        json.dumps({"format": "other/1", "days": 400, "specs": {}}),
        json.dumps({"format": "golden-traces/1", "days": 30, "specs": {}}),
        json.dumps({"format": "golden-traces/1", "days": 400, "specs": []}),
    ],
    ids=[
        "missing",
        "not-json",
        "not-an-object",
        "other-format",
        "other-days",
        "no-specs",
    ],
)
def test_a_missing_or_unusable_golden_file_fails_the_gate(
    tmp_path: Path, content: str | None
) -> None:
    file = tmp_path / "golden.json"
    if content is not None:
        file.write_text(content)

    code, out = _invoke("golden", "--check", "--file", str(file))

    assert (code, out["result"]["code"]) == (1, "golden_unusable")


def test_an_unusable_file_is_not_silently_overwritten(
    tmp_path: Path, quick: None
) -> None:
    file = tmp_path / "golden.json"
    file.write_text("{not json")

    code, out = _invoke("golden", "--file", str(file), "--spec", REFERENCE_REF)

    assert (code, out["result"]["code"]) == (1, "golden_unusable")
    assert file.read_text() == "{not json"


def test_writing_one_spec_keeps_the_others(tmp_path: Path, quick: None) -> None:
    file = tmp_path / "golden.json"
    _invoke("golden", "--file", str(file), "--spec", REFERENCE_REF, "--spec", FIXTURE)
    before = golden.read(file)

    _, out = _invoke("golden", "--file", str(file), "--spec", REFERENCE_REF)

    assert out["result"]["written"] == [REFERENCE_REF]
    assert golden.read(file) == before
    assert list(before) == [REFERENCE_REF, FIXTURE]


def test_a_path_spec_is_read_relative_to_the_app_wherever_the_command_runs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, quick: None
) -> None:
    monkeypatch.chdir(tmp_path)

    code, out = _invoke("golden", "--file", str(tmp_path / "g.json"), "--spec", FIXTURE)

    assert (code, out["result"]["written"]) == (0, [FIXTURE])


def test_an_unknown_spec_exits_3(tmp_path: Path) -> None:
    code, out = _invoke(
        "golden", "--file", str(tmp_path / "g.json"), "--spec", "reference/nope"
    )

    assert (code, out["result"]["code"]) == (3, "spec_not_found")


def test_the_defaults_name_the_reference_and_the_fixture() -> None:
    assert golden.DEFAULT_SPECS == (REFERENCE_REF, FIXTURE)
    assert (golden.APP_ROOT / FIXTURE).is_file()
    assert golden.GOLDEN_PATH == golden.APP_ROOT / (
        "tests/fixtures/strategy_specs/golden_traces.json"
    )


def test_a_trace_summary_is_the_hash_of_the_decisions_and_nothing_numpy() -> None:
    summary = golden.run_scenario(load_spec(REFERENCE_REF), "regimes", 1)

    assert set(summary) == {"trade_count", "final_value", "rule_counts", "digest"}
    assert len(summary["digest"]) == 64
    assert sum(summary["rule_counts"].values()) == golden.DAYS
    assert golden.run_scenario(load_spec(REFERENCE_REF), "regimes", 1) == summary
    assert golden.run_scenario(load_spec(REFERENCE_REF), "regimes", 2) != summary

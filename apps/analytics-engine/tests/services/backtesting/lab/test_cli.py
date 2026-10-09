from __future__ import annotations

import json
import runpy
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab.cli import main
from src.services.backtesting.spec.loader import LOCK_FILENAME, STRATEGIES_DIR
from tests.services.backtesting.spec.helpers import (
    REFERENCE_REF,
    reference_raw,
    with_value,
)


@pytest.fixture
def strategies(tmp_path: Path) -> Path:
    """A copy of the committed strategies directory the commands may change."""
    target = tmp_path / "strategies"
    shutil.copytree(STRATEGIES_DIR, target)
    return target


def _run(
    capsys: pytest.CaptureFixture[str],
    directory: Path,
    *argv: str,
) -> tuple[int, dict[str, Any]]:
    code = main(["--strategies-dir", str(directory), *argv])
    return code, json.loads(capsys.readouterr().out)


def _write_reference(directory: Path, raw: dict[str, Any]) -> None:
    (directory / f"{REFERENCE_REF}.json").write_text(json.dumps(raw))


def test_validate_reports_the_spec_and_that_it_is_locked(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    code, out = _run(capsys, strategies, "spec", "validate", REFERENCE_REF)

    assert code == 0
    assert (out["command"], out["ok"], out["exit_code"]) == ("spec validate", True, 0)
    assert (out["warnings"], out["artifacts"]) == ([], [])
    result = out["result"]
    assert result["id"] == "dma_fgi"
    assert result["locked"] is True
    assert result["behavior_hash"].startswith("sha256:")
    assert result["rules"][0] == "cross_down_exit"


def test_validate_points_at_every_fault(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    raw = with_value(reference_raw(), ("rules", 0, "cooldown_days"), -1)
    _write_reference(strategies, raw)

    code, out = _run(capsys, strategies, "spec", "validate", REFERENCE_REF)

    assert code == 3
    assert (out["ok"], out["exit_code"]) == (False, 3)
    assert out["result"]["code"] == "invalid_spec"
    assert out["result"]["issues"] == [
        {
            "pointer": "/rules/0/cooldown_days",
            "code": "greater_than_equal",
            "message": "Input should be greater than or equal to 0",
        }
    ]


def test_validate_of_a_missing_spec_exits_3(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    code, out = _run(capsys, strategies, "spec", "validate", "reference/nope")

    assert code == 3
    assert out["result"]["code"] == "spec_not_found"


def test_validate_fails_when_a_reference_drifted_from_its_lock(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    _write_reference(
        strategies, with_value(reference_raw(), ("signals", "warmup_days"), 15)
    )

    code, out = _run(capsys, strategies, "spec", "validate", REFERENCE_REF)

    assert code == 1
    assert out["result"]["code"] == "lock_out_of_date"
    assert out["result"]["issues"][0]["code"] == "behavior_changed_without_version_bump"


def test_validate_does_not_lock_specs_outside_the_references(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    idea = strategies / "idea.json"
    idea.write_text(json.dumps(reference_raw()))

    code, out = _run(capsys, strategies, "spec", "validate", str(idea))

    assert code == 0
    assert out["result"]["locked"] is False


def test_hash_prints_the_hash_and_optionally_the_canonical_form(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    code, plain = _run(capsys, strategies, "spec", "hash", REFERENCE_REF)
    _, canonical = _run(
        capsys, strategies, "spec", "hash", REFERENCE_REF, "--canonical"
    )

    assert code == 0
    assert "canonical" not in plain["result"]
    assert canonical["result"]["behavior_hash"] == plain["result"]["behavior_hash"]
    assert (
        json.loads(canonical["result"]["canonical"])["spec_format"] == "strategy-spec/1"
    )


def test_hash_of_an_invalid_spec_exits_3(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    _write_reference(strategies, {"spec_format": "strategy-spec/1"})

    code, out = _run(capsys, strategies, "spec", "hash", REFERENCE_REF)

    assert code == 3
    assert out["result"]["issues"]


def test_lock_is_a_no_op_on_a_locked_spec(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    before = (strategies / LOCK_FILENAME).read_text()

    code, out = _run(capsys, strategies, "spec", "lock", REFERENCE_REF)

    assert code == 0
    assert out["result"]["changed"] is False
    assert out["artifacts"] == []
    assert (strategies / LOCK_FILENAME).read_text() == before


def test_lock_creates_the_file_when_there_is_none(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    (strategies / LOCK_FILENAME).unlink()

    code, out = _run(capsys, strategies, "spec", "lock", REFERENCE_REF)

    assert code == 0
    assert out["result"]["changed"] is True
    assert out["artifacts"] == [str(strategies / LOCK_FILENAME)]
    assert json.loads((strategies / LOCK_FILENAME).read_text())["specs"][
        REFERENCE_REF
    ] == {"version": 1, "behavior_hash": out["result"]["behavior_hash"]}


def test_lock_refuses_a_behavior_change_without_a_version_bump(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    _write_reference(
        strategies, with_value(reference_raw(), ("signals", "warmup_days"), 15)
    )

    code, out = _run(capsys, strategies, "spec", "lock", REFERENCE_REF)

    assert code == 1
    assert out["result"]["code"] == "lock_refused"


def test_lock_follows_a_version_bump(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    raw = with_value(reference_raw(), ("signals", "warmup_days"), 15)
    raw["version"] = 2
    _write_reference(strategies, raw)

    code, out = _run(capsys, strategies, "spec", "lock", REFERENCE_REF)

    assert code == 0
    assert (out["result"]["changed"], out["result"]["version"]) == (True, 2)


def test_lock_only_pins_references(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    idea = strategies / "idea.json"
    idea.write_text(json.dumps(reference_raw()))

    code, out = _run(capsys, strategies, "spec", "lock", str(idea))

    assert code == 2
    assert out["result"]["code"] == "not_lockable"


def test_schema_writes_then_checks(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()

    code, written = _run(capsys, empty, "schema")
    check_code, checked = _run(capsys, empty, "schema", "--check")
    again_code, again = _run(capsys, empty, "schema")

    assert code == 0
    assert written["result"]["written"] == [
        "VOCABULARY.md",
        "strategy-spec.schema.json",
    ]
    assert written["artifacts"] == [
        str(empty / "VOCABULARY.md"),
        str(empty / "strategy-spec.schema.json"),
    ]
    assert (check_code, checked["result"]["stale"]) == (0, [])
    assert (again_code, again["result"]["written"]) == (0, [])
    assert again["artifacts"] == []
    assert again["result"]["unchanged"] == [
        "VOCABULARY.md",
        "strategy-spec.schema.json",
    ]


def test_schema_check_fails_on_a_stale_or_missing_artifact(
    capsys: pytest.CaptureFixture[str],
    strategies: Path,
) -> None:
    (strategies / "VOCABULARY.md").write_text("old")
    (strategies / "strategy-spec.schema.json").unlink()

    code, out = _run(capsys, strategies, "schema", "--check")

    assert code == 1
    assert out["result"]["code"] == "generated_artifacts_out_of_date"
    assert "VOCABULARY.md" in out["result"]["message"]
    assert "strategy-spec.schema.json" in out["result"]["message"]


def test_the_committed_artifacts_pass_the_check(
    capsys: pytest.CaptureFixture[str],
) -> None:
    code, out = _run(capsys, STRATEGIES_DIR, "schema", "--check")

    assert (code, out["ok"], out["exit_code"]) == (0, True, 0)


def test_usage_errors_exit_2() -> None:
    with pytest.raises(SystemExit) as caught:
        main(["spec"])

    assert caught.value.code == 2


def test_python_dash_m_runs_the_cli_on_the_committed_strategies(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(sys, "argv", ["strategy-lab", "schema", "--check"])

    with pytest.raises(SystemExit) as caught:
        runpy.run_module("src.services.backtesting.lab", run_name="__main__")

    assert caught.value.code == 0
    assert json.loads(capsys.readouterr().out)["ok"] is True

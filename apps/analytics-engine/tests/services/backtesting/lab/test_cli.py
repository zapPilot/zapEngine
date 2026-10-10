from __future__ import annotations

import json
import runpy
import shutil
import sys
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab import cli
from src.services.backtesting.lab.cli import main
from src.services.backtesting.lab.record import RecordRefused
from src.services.backtesting.lab.synthetic import synthetic_market
from src.services.backtesting.spec.loader import LOCK_FILENAME, STRATEGIES_DIR
from src.services.exceptions import MarketDataUnavailableError
from tests.services.backtesting.spec.helpers import (
    REFERENCE_REF,
    reference_raw,
    with_value,
)
from tests.services.backtesting.support.synthetic_services import (
    SyntheticMarketServices,
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


def _bundle_run(
    capsys: pytest.CaptureFixture[str],
    lab: Path,
    *argv: str,
) -> tuple[int, dict[str, Any]]:
    code = main(["--lab-dir", str(lab), *argv])
    return code, json.loads(capsys.readouterr().out)


@pytest.fixture
def synthetic_database(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Serve the recorder a synthetic market instead of the production database."""
    market = synthetic_market(seed=3, days=300)
    service = SyntheticMarketServices(market).build_backtesting_service()

    @contextmanager
    def database_service() -> Any:
        yield service

    monkeypatch.setattr(cli, "ensure_read_only", lambda: None)
    monkeypatch.setattr(cli, "database_service", database_service)
    return market


def _record_args(market: Any, *extra: str) -> tuple[str, ...]:
    return (
        "bundle",
        "record",
        "--name",
        "prod",
        "--start",
        market.user_start_date.isoformat(),
        "--end",
        market.prices[-1]["date"].isoformat(),
        *extra,
    )


def test_record_writes_a_bundle_that_coverage_can_read_back(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    synthetic_database: Any,
) -> None:
    code, recorded = _bundle_run(capsys, tmp_path, *_record_args(synthetic_database))
    coverage_code, covered = _bundle_run(
        capsys, tmp_path, "bundle", "coverage", "prod:latest"
    )

    assert (code, recorded["ok"]) == (0, True)
    result = recorded["result"]
    assert result["dry_run"] is False
    assert recorded["artifacts"] == [result["path"]]
    assert Path(result["path"]).is_file()
    assert result["coverage"]["rows"] == result["rows"]
    assert coverage_code == 0
    assert covered["result"]["bundle"]["content_sha256"] == result["content_sha256"]
    assert covered["result"]["coverage"] == result["coverage"]


def test_a_dry_run_reports_without_writing(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    synthetic_database: Any,
) -> None:
    code, out = _bundle_run(
        capsys, tmp_path, *_record_args(synthetic_database, "--dry-run")
    )

    assert code == 0
    assert out["result"]["dry_run"] is True
    assert out["result"]["path"] is None
    assert out["artifacts"] == []
    assert not (tmp_path / "bundles").exists()
    assert out["result"]["coverage"]["complete_window"]


def test_record_never_overwrites(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    synthetic_database: Any,
) -> None:
    _bundle_run(capsys, tmp_path, *_record_args(synthetic_database))

    code, out = _bundle_run(capsys, tmp_path, *_record_args(synthetic_database))

    assert code == 1
    assert out["result"]["code"] == "bundle_exists"


def test_record_is_refused_outside_read_only_mode(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def refuse() -> None:
        raise RecordRefused("DATABASE_READ_ONLY must be true to record a bundle")

    monkeypatch.setattr(cli, "ensure_read_only", refuse)

    code, out = _bundle_run(
        capsys,
        tmp_path,
        "bundle",
        "record",
        "--name",
        "prod",
        "--start",
        "2025-01-01",
    )

    assert code == 1
    assert out["result"]["code"] == "recording_refused"


def test_record_checks_the_name_before_touching_the_database(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def forbidden() -> None:
        raise AssertionError("the database must not be touched")

    monkeypatch.setattr(cli, "ensure_read_only", forbidden)

    code, out = _bundle_run(
        capsys,
        tmp_path,
        "bundle",
        "record",
        "--name",
        "../etc",
        "--start",
        "2025-01-01",
    )

    assert code == 2
    assert out["result"]["code"] == "invalid_bundle_reference"


def test_record_reports_data_the_database_cannot_serve(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Empty:
        def prepare_market_window(self, **_: Any) -> None:
            raise MarketDataUnavailableError(
                "No price data available for BTC", missing_assets=["BTC"]
            )

    @contextmanager
    def database_service() -> Any:
        yield Empty()

    monkeypatch.setattr(cli, "ensure_read_only", lambda: None)
    monkeypatch.setattr(cli, "database_service", database_service)

    code, out = _bundle_run(
        capsys,
        tmp_path,
        "bundle",
        "record",
        "--name",
        "prod",
        "--start",
        "2017-01-01",
    )

    assert code == 4
    assert out["result"]["code"] == "data_unavailable"
    assert "No price data" in out["result"]["message"]


def test_coverage_of_a_synthetic_bundle(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys,
        tmp_path,
        "bundle",
        "coverage",
        "synthetic:stress?seed=2&days=300",
    )

    assert code == 0
    assert out["result"]["bundle"]["source"] == "synthetic"
    assert out["result"]["bundle"]["path"] is None
    assert out["result"]["coverage"]["series"]["btc"]["missing_days"] == 0


def test_coverage_of_a_missing_bundle_exits_4(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(capsys, tmp_path, "bundle", "coverage", "prod:latest")

    assert code == 4
    assert out["result"]["code"] == "bundle_not_found"


def test_coverage_of_a_damaged_bundle_exits_4(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    broken = tmp_path / "broken.jsonl.gz"
    broken.write_bytes(b"not a bundle")

    code, out = _bundle_run(capsys, tmp_path, "bundle", "coverage", str(broken))

    assert code == 4
    assert out["result"]["code"] == "bundle_corrupt"


def test_coverage_of_a_malformed_reference_exits_2(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(capsys, tmp_path, "bundle", "coverage", "prod")

    assert code == 2
    assert out["result"]["code"] == "invalid_bundle_reference"


@pytest.mark.parametrize(
    "argv",
    [
        ["bundle", "record", "--start", "2025-01-01"],
        ["bundle", "record", "--name", "prod", "--start", "not-a-date"],
        ["bundle"],
    ],
)
def test_bundle_usage_errors_exit_2(argv: list[str]) -> None:
    with pytest.raises(SystemExit) as caught:
        main(argv)

    assert caught.value.code == 2


def test_the_default_end_is_yesterday(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, date] = {}

    class Recorder:
        def prepare_market_window(self, **kwargs: Any) -> None:
            seen["end"] = kwargs["end_date"]
            raise MarketDataUnavailableError("stop here", missing_assets=[])

    @contextmanager
    def database_service() -> Any:
        yield Recorder()

    monkeypatch.setattr(cli, "ensure_read_only", lambda: None)
    monkeypatch.setattr(cli, "database_service", database_service)

    _bundle_run(
        capsys,
        tmp_path,
        "bundle",
        "record",
        "--name",
        "prod",
        "--start",
        "2017-01-01",
    )

    assert seen["end"] == datetime.now(UTC).date() - timedelta(days=1)


def _spec_args(*extra: str) -> tuple[str, ...]:
    return (
        "--spec",
        REFERENCE_REF,
        "--bundle",
        "synthetic:regimes?seed=1&days=300",
        *extra,
    )


def test_eval_writes_a_report_and_a_summary(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(capsys, tmp_path, "eval", *_spec_args("--no-leave-one-out"))

    assert (code, out["command"], out["ok"]) == (0, "eval", True)
    result = out["result"]
    report_path, summary_path = (Path(item) for item in out["artifacts"])
    assert report_path.name == "report.json" and summary_path.name == "summary.txt"
    assert report_path.parent.name == result["report_hash"].split(":")[1][:16]
    saved = json.loads(report_path.read_text())
    assert saved["report_hash"] == result["report_hash"]
    assert "trace" in saved and "trace" not in result
    assert summary_path.read_text().splitlines() == result["summary"]
    assert len(result["summary"]) <= 15
    assert result["strategies"]["strategy"]["trade_count"] > 0
    assert result["attribution"]["leave_one_out"] == {}


def test_eval_takes_the_assumptions_and_the_window(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys,
        tmp_path,
        "eval",
        *_spec_args(
            "--no-leave-one-out",
            "--fill-lag",
            "0",
            "--slippage",
            "0",
            "--stable-apr",
            "0.05",
            "--capital",
            "5000",
            "--start",
            "2025-02-01",
            "--end",
            "2025-08-01",
        ),
    )

    assert code == 0
    result = out["result"]
    assert result["assumptions"] == {
        "fill_lag_days": 0,
        "slippage_rate": 0.0,
        "stable_apr": 0.05,
    }
    assert result["total_capital"] == 5000
    assert (result["window"]["start"], result["window"]["end"]) == (
        "2025-02-01",
        "2025-08-01",
    )
    assert result["strategies"]["strategy"]["total_invested"] == 5000


@pytest.mark.parametrize(
    "option",
    [("--slippage", "0.5"), ("--fill-lag", "2"), ("--stable-apr", "-1")],
)
def test_eval_refuses_assumptions_the_engine_would_not_accept(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    option: tuple[str, str],
) -> None:
    code, out = _bundle_run(capsys, tmp_path, "eval", *_spec_args(*option))

    assert code == 2
    assert out["result"]["code"] == "invalid_assumptions"


def test_eval_of_a_missing_spec_exits_3(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys,
        tmp_path,
        "eval",
        "--spec",
        "reference/nope",
        "--bundle",
        "synthetic:regimes",
    )

    assert code == 3
    assert out["result"]["code"] == "spec_not_found"


def test_eval_of_a_missing_bundle_exits_4(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys, tmp_path, "eval", "--spec", REFERENCE_REF, "--bundle", "prod:latest"
    )

    assert code == 4
    assert out["result"]["code"] == "bundle_not_found"


def test_a_broken_hard_invariant_fails_the_gate_but_still_reports(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace

    from src.services.backtesting.lab import evaluation_commands

    body = {
        "fingerprint": {"eval_config_hash": "sha256:" + "b" * 64},
        "invariants": [{"name": "weights_valid", "hard": True, "count": 2}],
    }
    fake = SimpleNamespace(
        body=body,
        report_hash="sha256:" + "a" * 64,
        as_dict=lambda: {**body, "report_hash": "sha256:" + "a" * 64},
        summary_lines=lambda: ["report sha256:" + "a" * 64],
    )
    monkeypatch.setattr(evaluation_commands, "evaluate", lambda *_, **__: fake)

    code, out = _bundle_run(capsys, tmp_path, "eval", *_spec_args())

    assert (code, out["ok"], out["exit_code"]) == (1, False, 1)
    assert out["warnings"] == ["Hard invariant broken: weights_valid"]
    assert out["result"]["report_hash"] == "sha256:" + "a" * 64


def test_ablate_reports_what_each_rule_adds(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(capsys, tmp_path, "ablate", *_spec_args())

    assert code == 0
    result = out["result"]
    assert "rule:cross_down_exit" in result["leave_one_out"]
    assert result["rules"]["cross_down_exit"]["trades"] > 0
    assert result["strategy"]["trade_count"] > 0
    assert set(result["fingerprint"]) >= {"spec", "bundle", "git"}
    assert out["artifacts"] == []


def test_spec_new_starts_a_candidate_that_validates(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys, tmp_path, "spec", "new", "--from", REFERENCE_REF, "--id", "my_candidate"
    )
    candidate = Path(out["result"]["path"])
    validate_code, validated = _bundle_run(
        capsys, tmp_path, "spec", "validate", str(candidate)
    )

    assert code == 0
    assert candidate == tmp_path / "candidates" / "my_candidate.json"
    assert out["artifacts"] == [str(candidate)]
    assert out["result"]["derived_from"]["id"] == "dma_fgi"
    saved = json.loads(candidate.read_text())
    assert (saved["id"], saved["version"]) == ("my_candidate", 1)
    assert "Candidate derived from dma_fgi" in saved["description"]
    assert validate_code == 0
    assert validated["result"]["locked"] is False
    assert (
        validated["result"]["behavior_hash"]
        == out["result"]["derived_from"]["behavior_hash"]
    )


def test_spec_new_never_overwrites(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    arguments = ("spec", "new", "--from", REFERENCE_REF, "--id", "my_candidate")
    _bundle_run(capsys, tmp_path, *arguments)

    code, out = _bundle_run(capsys, tmp_path, *arguments)

    assert code == 1
    assert out["result"]["code"] == "candidate_exists"


def test_spec_new_can_write_elsewhere(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    target = tmp_path / "elsewhere" / "idea.json"

    code, out = _bundle_run(
        capsys,
        tmp_path,
        "spec",
        "new",
        "--from",
        REFERENCE_REF,
        "--id",
        "my_candidate",
        "--out",
        str(target),
    )

    assert code == 0
    assert target.is_file()
    assert out["result"]["path"] == str(target)


def test_spec_new_refuses_a_bad_name_and_a_missing_source(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    bad_code, bad = _bundle_run(
        capsys, tmp_path, "spec", "new", "--from", REFERENCE_REF, "--id", "Bad Name"
    )
    missing_code, missing = _bundle_run(
        capsys, tmp_path, "spec", "new", "--from", "reference/nope", "--id", "fine_name"
    )

    assert bad_code == 3
    assert bad["result"]["issues"][0]["pointer"] == "/id"
    assert missing_code == 3
    assert missing["result"]["code"] == "spec_not_found"


def test_diff_names_the_changes_and_follows_them_on_a_bundle(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    _, created = _bundle_run(
        capsys, tmp_path, "spec", "new", "--from", REFERENCE_REF, "--id", "my_candidate"
    )
    candidate = Path(created["result"]["path"])
    raw = json.loads(candidate.read_text())
    raw["rules"] = [rule for rule in raw["rules"] if rule["id"] != "cross_down_exit"]
    candidate.write_text(json.dumps(raw))

    plain_code, plain = _bundle_run(
        capsys, tmp_path, "diff", "--base", REFERENCE_REF, "--candidate", str(candidate)
    )
    code, out = _bundle_run(
        capsys,
        tmp_path,
        "diff",
        "--base",
        REFERENCE_REF,
        "--candidate",
        str(candidate),
        "--bundle",
        "synthetic:stress?seed=2&days=300",
    )

    assert plain_code == code == 0
    assert plain["result"]["behavior_changed"] is True
    assert plain["result"]["comparison"] is None
    assert [(item["pointer"], item["kind"]) for item in plain["result"]["changes"]] == [
        ("/description", "changed"),
        ("/id", "changed"),
        ("/rules[cross_down_exit]", "removed"),
    ]
    comparison = out["result"]["comparison"]
    assert comparison["first_divergence"]["base"]["rule"] == "cross_down_exit"
    assert comparison["days_differing"] > 0


def test_diff_of_a_spec_with_itself_is_empty(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys, tmp_path, "diff", "--base", REFERENCE_REF, "--candidate", REFERENCE_REF
    )

    assert code == 0
    assert out["result"]["behavior_changed"] is False
    assert out["result"]["changes"] == []


def test_bundle_synth_keeps_a_synthetic_history_and_never_overwrites(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(
        capsys, tmp_path, "bundle", "synth", "--scenario", "stress", "--days", "300"
    )
    again_code, again = _bundle_run(
        capsys, tmp_path, "bundle", "synth", "--scenario", "stress", "--days", "300"
    )
    covered_code, covered = _bundle_run(
        capsys, tmp_path, "bundle", "coverage", "synthetic-stress-1-300:latest"
    )

    assert code == 0
    assert out["result"]["bundle"]["source"] == "synthetic"
    assert Path(out["result"]["bundle"]["path"]).is_file()
    assert out["artifacts"] == [out["result"]["bundle"]["path"]]
    assert (again_code, again["result"]["code"]) == (1, "bundle_exists")
    assert covered_code == 0
    assert (
        covered["result"]["bundle"]["content_sha256"]
        == (out["result"]["bundle"]["content_sha256"])
    )


def test_bundle_synth_refuses_a_history_with_no_days(
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    code, out = _bundle_run(capsys, tmp_path, "bundle", "synth", "--days", "0")

    assert code == 2
    assert out["result"]["code"] == "invalid_bundle_reference"


def test_the_report_hash_does_not_depend_on_the_hash_seed(tmp_path: Path) -> None:
    import os
    import subprocess

    from src.services.backtesting.lab.bundle import APP_ROOT

    hashes = []
    for seed in ("1", "2"):
        done = subprocess.run(
            [
                sys.executable,
                "-m",
                "src.services.backtesting.lab",
                "--lab-dir",
                str(tmp_path / seed),
                "eval",
                *_spec_args("--no-leave-one-out"),
            ],
            cwd=APP_ROOT,
            env={**os.environ, "PYTHONHASHSEED": seed},
            capture_output=True,
            text=True,
            check=True,
        )
        hashes.append(json.loads(done.stdout)["result"]["report_hash"])

    assert hashes[0] == hashes[1]


def test_the_spec_commands_run_while_the_reference_does_not_match_its_lock() -> None:
    """A version bump is locked with `spec lock`, so the lab has to start while
    the reference and its lock disagree; running the reference still refuses."""
    import subprocess

    from src.services.backtesting.lab.bundle import APP_ROOT

    probe = "\n".join(
        [
            "from src.services.backtesting.spec import loader",
            "def drifted(ref, directory=loader.STRATEGIES_DIR):",
            "    raise loader.SpecLockError(f'{ref} does not match its lock')",
            "loader.load_locked_spec = drifted",
            "from src.services.backtesting.lab.cli import main",
            "assert main(['spec', 'hash', 'reference/dma_fgi']) == 0",
            "from src.services.backtesting.strategy_registry import get_strategy_recipe",
            "try:",
            "    get_strategy_recipe('dma_fgi_portfolio_rules')",
            "except loader.SpecLockError:",
            "    print('refused')",
        ]
    )
    done = subprocess.run(
        [sys.executable, "-c", probe],
        cwd=APP_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )

    assert done.stdout.splitlines()[-1] == "refused"

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
    bundles: Path,
    *argv: str,
) -> tuple[int, dict[str, Any]]:
    code = main(["--bundles-dir", str(bundles), *argv])
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
    assert (out["artifacts"], list(tmp_path.iterdir())) == ([], [])
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

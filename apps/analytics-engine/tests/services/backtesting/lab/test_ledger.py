from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from src.services.backtesting.lab.ledger import Ledger, LedgerCorruptError

NOW = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)


def _ledger(tmp_path: Path) -> Ledger:
    return Ledger(tmp_path / "lab" / "ledger.jsonl", clock=lambda: NOW)


def _spec(digest: str) -> dict[str, str]:
    return {"ref": f"x@1#{digest}", "behavior_hash": f"sha256:{digest}"}


def test_an_empty_ledger_has_nothing_to_say(tmp_path: Path) -> None:
    ledger = _ledger(tmp_path)

    assert ledger.entries() == []
    assert ledger.summary() == {
        "entries": 0,
        "kinds": {},
        "distinct_candidates": 0,
        "first": None,
        "last": None,
    }


def test_entries_are_appended_with_a_time_and_a_kind(tmp_path: Path) -> None:
    ledger = _ledger(tmp_path)

    written = ledger.append("eval", spec=_spec("a"), note="first")
    ledger.append("eval", spec=_spec("b"))

    assert written == {
        "at": "2026-10-10T12:00:00+00:00",
        "kind": "eval",
        "spec": _spec("a"),
        "note": "first",
    }
    assert [entry["spec"]["ref"] for entry in ledger.entries()] == ["x@1#a", "x@1#b"]
    assert ledger.path.read_text().count("\n") == 2


def test_entries_can_be_filtered_by_kind(tmp_path: Path) -> None:
    ledger = _ledger(tmp_path)
    ledger.append("eval", spec=_spec("a"))
    ledger.append("liveness", spec=_spec("a"))

    assert [entry["kind"] for entry in ledger.entries("liveness")] == ["liveness"]


def test_the_same_spec_tried_again_is_one_candidate(tmp_path: Path) -> None:
    ledger = _ledger(tmp_path)
    for digest in ("a", "a", "b"):
        ledger.append("eval", spec=_spec(digest))
    ledger.append("holdout_init", lineage="x")
    ledger.append("odd", spec="not-a-dict")
    ledger.append("odd", spec={"ref": "no hash"})

    assert ledger.distinct_candidates() == 2


def test_the_summary_counts_by_kind(tmp_path: Path) -> None:
    ledger = _ledger(tmp_path)
    ledger.append("eval", spec=_spec("a"))
    ledger.append("eval", spec=_spec("b"))
    ledger.append("sweep", spec=_spec("a"))

    summary = ledger.summary()

    assert summary["entries"] == 3
    assert summary["kinds"] == {"eval": 2, "sweep": 1}
    assert summary["distinct_candidates"] == 2
    assert summary["first"] == summary["last"] == "2026-10-10T12:00:00+00:00"


def test_blank_lines_are_ignored(tmp_path: Path) -> None:
    ledger = _ledger(tmp_path)
    ledger.append("eval", spec=_spec("a"))
    with ledger.path.open("a") as handle:
        handle.write("\n   \n")

    assert len(ledger.entries()) == 1


@pytest.mark.parametrize("line", ["not json", "[1, 2]"])
def test_a_damaged_line_is_named(tmp_path: Path, line: str) -> None:
    ledger = _ledger(tmp_path)
    ledger.append("eval", spec=_spec("a"))
    with ledger.path.open("a") as handle:
        handle.write(line + "\n")

    with pytest.raises(LedgerCorruptError, match=r"ledger\.jsonl:2"):
        ledger.entries()


def test_the_default_clock_is_utc_now(tmp_path: Path) -> None:
    ledger = Ledger(tmp_path / "ledger.jsonl")

    entry = ledger.append("eval")

    assert entry["at"].endswith("+00:00")


def test_not_a_number_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        _ledger(tmp_path).append("eval", value=float("nan"))

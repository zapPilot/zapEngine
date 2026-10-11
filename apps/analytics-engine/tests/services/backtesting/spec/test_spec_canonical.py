from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.spec import (
    behavior_hash,
    canonical_json,
    load_spec,
    parse_spec,
)
from src.services.backtesting.spec.canonical import (
    LockEntry,
    lock_issues,
    lock_spec,
    read_lock,
    render_lock,
)
from src.services.backtesting.spec.loader import LOCK_FILENAME, STRATEGIES_DIR
from tests.services.backtesting.spec.helpers import (
    REFERENCE_REF,
    reference_raw,
    rule_index,
    with_fgi_downshift,
    with_value,
)

KEY = REFERENCE_REF


def _hash_of(raw: dict[str, object]) -> str:
    return behavior_hash(parse_spec(raw))


def test_the_reference_is_locked_at_its_current_behavior() -> None:
    entries = read_lock(STRATEGIES_DIR / LOCK_FILENAME)

    assert lock_issues(KEY, load_spec(KEY), entries) == []


def test_the_hash_is_a_sha256_of_the_canonical_form() -> None:
    spec = load_spec(KEY)

    assert behavior_hash(spec).startswith("sha256:")
    assert len(behavior_hash(spec)) == len("sha256:") + 64


def test_naming_and_describing_do_not_change_behavior() -> None:
    raw = reference_raw()
    raw["id"] = "renamed_strategy"
    raw["version"] = 7
    raw["description"] = "Said differently."

    assert _hash_of(raw) == _hash_of(reference_raw())


@pytest.mark.parametrize(
    "mutate",
    [
        lambda raw: with_value(raw, ("signals", "warmup_days"), 15),
        lambda raw: with_value(raw, ("rules", 0, "cooldown_days"), 29),
        lambda raw: with_value(raw, ("rules", 0, "id"), "renamed_rule"),
        lambda raw: with_value(raw, ("rules", 4, "thresholds", "BTC"), 0.21),
        lambda raw: with_value(
            raw, ("rules",), [raw["rules"][1], raw["rules"][0], *raw["rules"][2:]]
        ),
    ],
    ids=["signal", "rule-number", "rule-id", "nested-number", "rule-order"],
)
def test_any_behavior_change_changes_the_hash(mutate: object) -> None:
    assert _hash_of(mutate(reference_raw())) != _hash_of(reference_raw())  # type: ignore[operator]


def test_the_hash_does_not_depend_on_how_numbers_or_sets_are_written() -> None:
    raw = with_fgi_downshift(reference_raw())
    index = rule_index(raw, "dma_overextension_trim")
    raw["rules"][index]["fgi_multipliers"]["fear"] = 1
    downshift = rule_index(raw, "fgi_downshift_trim")
    raw["rules"][downshift]["to_regimes"] = ["extreme_fear", "fear", "neutral"]

    assert _hash_of(raw) == _hash_of(with_fgi_downshift(reference_raw()))


def test_the_canonical_form_is_compact_sorted_and_leaves_out_the_metadata() -> None:
    canonical = canonical_json(load_spec(KEY))
    payload = json.loads(canonical)

    assert " " not in canonical.replace("strategy-spec/1", "")
    assert {"id", "version", "description"}.isdisjoint(payload)
    assert list(payload) == sorted(payload)


def test_lock_entries_round_trip_through_the_file(tmp_path: Path) -> None:
    entries = {
        "reference/b": LockEntry(version=2, behavior_hash="sha256:b"),
        "reference/a": LockEntry(version=1, behavior_hash="sha256:a"),
    }
    path = tmp_path / LOCK_FILENAME
    path.write_text(render_lock(entries))

    assert read_lock(path) == entries
    assert list(json.loads(path.read_text())["specs"]) == [
        "reference/a",
        "reference/b",
    ]
    assert path.read_text().endswith("}\n")


def _locked() -> dict[str, LockEntry]:
    spec = load_spec(KEY)
    return {KEY: LockEntry(spec.version, behavior_hash(spec))}


def _bumped(raw: dict[str, Any]) -> dict[str, Any]:
    raw["version"] += 1
    return raw


def test_an_unlocked_spec_is_reported() -> None:
    issues = lock_issues(KEY, load_spec(KEY), {})

    assert [issue.code for issue in issues] == ["not_locked"]


def test_a_spec_matching_its_lock_is_clean() -> None:
    assert lock_issues(KEY, load_spec(KEY), _locked()) == []


def test_a_version_bump_without_a_behavior_change_is_reported() -> None:
    raw = _bumped(reference_raw())

    issues = lock_issues(KEY, parse_spec(raw), _locked())

    assert [issue.code for issue in issues] == ["version_without_behavior_change"]


def test_a_behavior_change_without_a_version_bump_is_reported() -> None:
    raw = with_value(reference_raw(), ("signals", "warmup_days"), 15)

    issues = lock_issues(KEY, parse_spec(raw), _locked())

    assert [issue.code for issue in issues] == ["behavior_changed_without_version_bump"]


def test_a_bumped_but_unlocked_behavior_change_asks_for_a_lock() -> None:
    raw = _bumped(with_value(reference_raw(), ("signals", "warmup_days"), 15))

    issues = lock_issues(KEY, parse_spec(raw), _locked())

    assert [issue.code for issue in issues] == ["lock_out_of_date"]


def test_locking_adds_or_updates_an_entry() -> None:
    spec = load_spec(KEY)
    bumped = parse_spec(
        _bumped(with_value(reference_raw(), ("signals", "warmup_days"), 15))
    )

    assert lock_spec(KEY, spec, {}) == _locked()
    assert lock_spec(KEY, spec, _locked()) == _locked()
    assert lock_spec(KEY, bumped, _locked())[KEY] == LockEntry(
        bumped.version, behavior_hash(bumped)
    )


def test_locking_refuses_to_hide_a_behavior_change() -> None:
    raw = with_value(reference_raw(), ("signals", "warmup_days"), 15)

    with pytest.raises(ValueError, match="bump the version"):
        lock_spec(KEY, parse_spec(raw), _locked())

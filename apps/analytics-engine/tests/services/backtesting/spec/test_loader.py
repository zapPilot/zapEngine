from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from src.services.backtesting.spec import SpecError, load_spec
from src.services.backtesting.spec.canonical import render_lock
from src.services.backtesting.spec.loader import (
    LOCK_FILENAME,
    STRATEGIES_DIR,
    SpecLockError,
    load_locked_spec,
    lock_key,
    resolve_spec_path,
)
from tests.services.backtesting.spec.helpers import REFERENCE_PATH, REFERENCE_REF


def test_a_reference_resolves_inside_the_strategies_directory() -> None:
    assert resolve_spec_path(REFERENCE_REF) == REFERENCE_PATH
    assert resolve_spec_path(REFERENCE_REF, Path("/elsewhere")) == Path(
        "/elsewhere/reference/dma_fgi.json"
    )


def test_a_json_path_is_used_as_given() -> None:
    assert resolve_spec_path("notes/mine.json") == Path("notes/mine.json")


def test_only_references_have_a_lock_key() -> None:
    assert lock_key(REFERENCE_PATH) == REFERENCE_REF
    assert lock_key(STRATEGIES_DIR / "lab" / "idea.json") is None
    assert lock_key(Path("/somewhere/else.json")) is None


def test_loading_a_reference_by_name() -> None:
    assert load_spec(REFERENCE_REF).id == "dma_fgi"


def test_a_missing_spec_is_a_file_error() -> None:
    with pytest.raises(FileNotFoundError):
        load_spec("reference/nope")


def test_broken_json_is_reported_as_an_issue(tmp_path: Path) -> None:
    path = tmp_path / "broken.json"
    path.write_text("{not json")

    with pytest.raises(SpecError) as caught:
        load_spec(str(path))

    assert [issue.code for issue in caught.value.issues] == ["invalid_json"]


def _strategies_copy(tmp_path: Path) -> Path:
    """A throwaway strategies directory (references and lock) to drift."""
    directory = tmp_path / "strategies"
    shutil.copytree(STRATEGIES_DIR, directory)
    return directory


def test_a_locked_reference_loads_as_the_reference() -> None:
    assert load_locked_spec(REFERENCE_REF) == load_spec(REFERENCE_REF)


def test_only_a_reference_can_be_loaded_as_locked(tmp_path: Path) -> None:
    candidate = tmp_path / "mine.json"
    candidate.write_text(REFERENCE_PATH.read_text())

    with pytest.raises(SpecLockError, match="not a locked reference"):
        load_locked_spec(str(candidate))


def test_a_reference_that_changed_without_a_version_bump_is_refused(
    tmp_path: Path,
) -> None:
    directory = _strategies_copy(tmp_path)
    path = directory / "reference" / "dma_fgi.json"
    raw = json.loads(path.read_text())
    raw["signals"]["warmup_days"] += 1
    path.write_text(json.dumps(raw))

    with pytest.raises(SpecLockError) as caught:
        load_locked_spec(REFERENCE_REF, directory)

    assert f"{REFERENCE_REF} does not match its entry in {LOCK_FILENAME}" in str(
        caught.value
    )
    assert "bump the version" in str(caught.value)


def test_a_reference_missing_from_the_lock_is_refused(tmp_path: Path) -> None:
    directory = _strategies_copy(tmp_path)
    (directory / LOCK_FILENAME).write_text(render_lock({}))

    with pytest.raises(SpecLockError, match="has no entry in the lock file"):
        load_locked_spec(REFERENCE_REF, directory)

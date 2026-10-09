from __future__ import annotations

from pathlib import Path

import pytest

from src.services.backtesting.spec import SpecError, load_spec
from src.services.backtesting.spec.loader import (
    STRATEGIES_DIR,
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

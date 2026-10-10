"""Shared fixtures-as-functions for the strategy spec tests."""

from __future__ import annotations

import copy
import json
from pathlib import Path as FilePath
from typing import Any

from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.spec.validation import (
    SpecError,
    SpecIssue,
    parse_spec,
)

REFERENCE_REF = "reference/dma_fgi"
REFERENCE_PATH = STRATEGIES_DIR / f"{REFERENCE_REF}.json"
# The reference with every knob and kind added after it, pinned by the golden file.
V2_VOCABULARY_PATH = (
    FilePath(__file__).resolve().parents[3]
    / "fixtures/strategy_specs/v2_vocabulary.json"
)
Path = tuple[str | int, ...]


def reference_raw() -> dict[str, Any]:
    """The committed reference spec as plain JSON, safe to mutate."""
    raw: dict[str, Any] = json.loads(REFERENCE_PATH.read_text())
    return copy.deepcopy(raw)


def v2_raw() -> dict[str, Any]:
    """The v2 vocabulary fixture as plain JSON, safe to mutate."""
    raw: dict[str, Any] = json.loads(V2_VOCABULARY_PATH.read_text())
    return copy.deepcopy(raw)


def fgi_downshift_raw() -> dict[str, Any]:
    """The FGI downshift trim as version 1 of the reference stated it.

    Version 2 dropped the rule. The kind stays in the vocabulary, so the tests of
    the kind run the rule version 1 ran, appended last as it was there.
    """
    return {
        "kind": "fgi_downshift_trim",
        "id": "fgi_downshift_dca_sell",
        "cooldown_days": 7,
        "sell_step": 0.05,
        "from_regimes": ["greed", "extreme_greed"],
        "to_regimes": ["neutral", "fear", "extreme_fear"],
        "proceeds": {"to": []},
    }


def with_fgi_downshift(raw: dict[str, Any]) -> dict[str, Any]:
    """``raw`` with version 1's FGI downshift trim appended."""
    raw["rules"].append(fgi_downshift_raw())
    return raw


def with_value(raw: dict[str, Any], path: Path, value: Any) -> dict[str, Any]:
    """``raw`` with the value at ``path`` replaced."""
    target: Any = raw
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    return raw


def without(raw: dict[str, Any], path: Path) -> dict[str, Any]:
    """``raw`` with the key at ``path`` removed."""
    target: Any = raw
    for part in path[:-1]:
        target = target[part]
    del target[path[-1]]
    return raw


def issues_for(raw: dict[str, Any]) -> list[SpecIssue]:
    try:
        parse_spec(raw)
    except SpecError as error:
        return list(error.issues)
    return []


def rule_index(raw: dict[str, Any], kind: str) -> int:
    return next(
        index for index, rule in enumerate(raw["rules"]) if rule["kind"] == kind
    )

"""Shared fixtures-as-functions for the strategy spec tests."""

from __future__ import annotations

import copy
import json
from typing import Any

from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.spec.validation import (
    SpecError,
    SpecIssue,
    parse_spec,
)

REFERENCE_REF = "reference/dma_fgi"
REFERENCE_PATH = STRATEGIES_DIR / f"{REFERENCE_REF}.json"
Path = tuple[str | int, ...]


def reference_raw() -> dict[str, Any]:
    """The committed reference spec as plain JSON, safe to mutate."""
    raw: dict[str, Any] = json.loads(REFERENCE_PATH.read_text())
    return copy.deepcopy(raw)


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

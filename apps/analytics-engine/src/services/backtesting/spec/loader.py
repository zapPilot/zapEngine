"""Finds spec files on disk and loads them."""

from __future__ import annotations

import json
from pathlib import Path

from src.services.backtesting.spec.model import StrategySpec
from src.services.backtesting.spec.validation import SpecError, SpecIssue, parse_spec

STRATEGIES_DIR = Path(__file__).resolve().parents[3] / "config" / "strategies"
LOCK_FILENAME = "LOCK.json"
# Specs under this folder are production references: their behavior is pinned.
LOCKED_PREFIX = "reference/"


def resolve_spec_path(ref: str, directory: Path = STRATEGIES_DIR) -> Path:
    """A spec reference like ``reference/dma_fgi``, or a path to a ``.json`` file."""
    if ref.endswith(".json"):
        return Path(ref)
    return directory / f"{ref}.json"


def lock_key(path: Path, directory: Path = STRATEGIES_DIR) -> str | None:
    """The key a spec file has in the lock file, if it is a locked reference."""
    try:
        relative = path.resolve().relative_to(directory.resolve())
    except ValueError:
        return None
    key = relative.with_suffix("").as_posix()
    return key if key.startswith(LOCKED_PREFIX) else None


def load_spec(ref: str, directory: Path = STRATEGIES_DIR) -> StrategySpec:
    path = resolve_spec_path(ref, directory)
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise SpecError(
            [SpecIssue("", "invalid_json", f"{path.name}: {error}")]
        ) from error
    return parse_spec(raw)


__all__ = [
    "LOCKED_PREFIX",
    "LOCK_FILENAME",
    "STRATEGIES_DIR",
    "load_spec",
    "lock_key",
    "resolve_spec_path",
]

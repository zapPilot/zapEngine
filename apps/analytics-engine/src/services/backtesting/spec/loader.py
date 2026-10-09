"""Finds spec files on disk and loads them."""

from __future__ import annotations

import json
from pathlib import Path

from src.services.backtesting.spec.canonical import lock_issues, read_lock
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


class SpecLockError(ValueError):
    """A production spec that is not what the lock file says it is."""


def load_locked_spec(ref: str, directory: Path = STRATEGIES_DIR) -> StrategySpec:
    """A production reference, checked against its entry in the lock file.

    What a strategy runs in production is a locked reference. A reference whose
    behavior changed without a version bump (or that is missing from the lock) is
    refused here, so the process fails when it starts, not when it first runs.
    """
    path = resolve_spec_path(ref, directory)
    key = lock_key(path, directory)
    if key is None:
        raise SpecLockError(f"'{ref}' is not a locked reference ({LOCKED_PREFIX}*)")
    spec = load_spec(ref, directory)
    issues = lock_issues(key, spec, read_lock(directory / LOCK_FILENAME))
    if issues:
        detail = "; ".join(issue.message for issue in issues)
        raise SpecLockError(
            f"{key} does not match its entry in {LOCK_FILENAME}: {detail}"
        )
    return spec


__all__ = [
    "LOCKED_PREFIX",
    "LOCK_FILENAME",
    "STRATEGIES_DIR",
    "SpecLockError",
    "load_locked_spec",
    "load_spec",
    "lock_key",
    "resolve_spec_path",
]

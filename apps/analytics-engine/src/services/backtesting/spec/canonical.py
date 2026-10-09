"""Canonical form, behavior hash and lock file of a strategy spec.

The behavior hash covers everything that changes what the strategy does and
nothing else: the spec's name, version and description are left out, so
renaming or re-describing a strategy keeps its hash while any change to a rule,
a number or the order of rules changes it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any

from src.services.backtesting.spec.model import StrategySpec
from src.services.backtesting.spec.validation import SpecIssue

LOCK_FORMAT = "strategy-lock/1"
_HASH_EXCLUDED = {"id", "version", "description"}


def canonical_json(spec: StrategySpec) -> str:
    payload = spec.model_dump(mode="json", exclude=_HASH_EXCLUDED)
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def behavior_hash(spec: StrategySpec) -> str:
    return "sha256:" + sha256(canonical_json(spec).encode()).hexdigest()


@dataclass(frozen=True)
class LockEntry:
    version: int
    behavior_hash: str


def read_lock(path: Path) -> dict[str, LockEntry]:
    raw: dict[str, Any] = json.loads(path.read_text())
    return {
        key: LockEntry(
            version=int(entry["version"]),
            behavior_hash=str(entry["behavior_hash"]),
        )
        for key, entry in raw["specs"].items()
    }


def render_lock(entries: dict[str, LockEntry]) -> str:
    payload = {
        "format": LOCK_FORMAT,
        "specs": {
            key: {"version": entry.version, "behavior_hash": entry.behavior_hash}
            for key, entry in sorted(entries.items())
        },
    }
    return json.dumps(payload, indent=2) + "\n"


def lock_issues(
    key: str,
    spec: StrategySpec,
    entries: dict[str, LockEntry],
) -> list[SpecIssue]:
    """How ``spec`` stands against its lock entry; empty when they agree."""
    entry = entries.get(key)
    current = behavior_hash(spec)
    if entry is None:
        return [SpecIssue("", "not_locked", f"{key} has no entry in the lock file")]
    if current == entry.behavior_hash:
        if spec.version == entry.version:
            return []
        return [
            SpecIssue(
                "/version",
                "version_without_behavior_change",
                f"Version is {spec.version} but behavior is unchanged from "
                f"locked version {entry.version}",
            )
        ]
    if spec.version <= entry.version:
        return [
            SpecIssue(
                "/version",
                "behavior_changed_without_version_bump",
                f"Behavior changed from locked version {entry.version}; "
                "bump the version",
            )
        ]
    return [
        SpecIssue(
            "",
            "lock_out_of_date",
            f"Version {spec.version} is not locked yet; run `spec lock`",
        )
    ]


def lock_spec(
    key: str,
    spec: StrategySpec,
    entries: dict[str, LockEntry],
) -> dict[str, LockEntry]:
    """Entries with ``spec`` locked, refusing a change that hides a new behavior."""
    issues = [
        issue
        for issue in lock_issues(key, spec, entries)
        if issue.code not in {"not_locked", "lock_out_of_date"}
    ]
    if issues:
        raise ValueError(issues[0].message)
    return {
        **entries,
        key: LockEntry(version=spec.version, behavior_hash=behavior_hash(spec)),
    }


__all__ = [
    "LOCK_FORMAT",
    "LockEntry",
    "behavior_hash",
    "canonical_json",
    "lock_issues",
    "lock_spec",
    "read_lock",
    "render_lock",
]

"""The ledger: every evaluation the lab has made, one JSON line each.

How many candidates have been tried is not a detail. A strategy picked as the
best of fifty looks better than it is, and the deflated Sharpe ratio corrects for
exactly that count. The ledger is where the count comes from: it is append-only,
lives in the git-ignored ``.lab/`` and records every evaluation, so an attempt
cannot be forgotten by deleting its output. It is local; a promotion record and
the review of its pull request carry the claim beyond the machine.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LEDGER_FILENAME = "ledger.jsonl"


class LedgerCorruptError(ValueError):
    """A line of the ledger is not a JSON object."""


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class Ledger:
    path: Path
    clock: Callable[[], datetime] = field(default=_now, repr=False)

    def append(self, kind: str, **fields: Any) -> dict[str, Any]:
        """Record one entry and return it."""
        entry = {
            "at": self.clock().isoformat(timespec="seconds"),
            "kind": kind,
            **fields,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a") as handle:
            handle.write(json.dumps(entry, sort_keys=True, allow_nan=False) + "\n")
        return entry

    def entries(self, kind: str | None = None) -> list[dict[str, Any]]:
        if not self.path.is_file():
            return []
        entries: list[dict[str, Any]] = []
        for number, line in enumerate(self.path.read_text().splitlines(), start=1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as error:
                raise LedgerCorruptError(f"{self.path}:{number}: {error}") from error
            if not isinstance(entry, dict):
                raise LedgerCorruptError(f"{self.path}:{number}: not an object")
            if kind is None or entry.get("kind") == kind:
                entries.append(entry)
        return entries

    def distinct_candidates(self) -> int:
        """How many different specs (by behavior hash) have been evaluated."""
        return len(
            {
                entry["spec"]["behavior_hash"]
                for entry in self.entries()
                if isinstance(entry.get("spec"), dict)
                and "behavior_hash" in entry["spec"]
            }
        )

    def summary(self) -> dict[str, Any]:
        entries = self.entries()
        kinds: dict[str, int] = {}
        for entry in entries:
            kinds[entry["kind"]] = kinds.get(entry["kind"], 0) + 1
        return {
            "entries": len(entries),
            "kinds": dict(sorted(kinds.items())),
            "distinct_candidates": self.distinct_candidates(),
            "first": entries[0]["at"] if entries else None,
            "last": entries[-1]["at"] if entries else None,
        }


__all__ = ["LEDGER_FILENAME", "Ledger", "LedgerCorruptError"]

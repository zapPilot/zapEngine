"""One look at data nobody tuned on.

Walk-forward folds protect a search from fooling itself, but the folds are still
data the search has seen. A holdout is the only evidence that is not: data that
did not exist when the lineage of candidates was pinned. ``init`` records the
pin (the last day of the data at that moment); ``look`` is allowed once, and only
when at least ``MIN_NEW_DAYS`` of new data have arrived since. A second look, or
an early one, is refused, however the candidate has changed in between: the look
belongs to the lineage, not to a candidate.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

MIN_NEW_DAYS = 90
_LINEAGE = re.compile(r"^[a-z][a-z0-9_-]{0,47}$")


class HoldoutError(Exception):
    """Base of the refusals the holdout gives."""


class HoldoutNotFound(HoldoutError):
    """No such lineage has been initialized."""


class HoldoutExists(HoldoutError):
    """The lineage already has a pin; a pin is never moved."""


class HoldoutAlreadyLooked(HoldoutError):
    """The lineage has had its look."""


class HoldoutNeedsNewData(HoldoutError):
    """Not enough new data since the pin."""


@dataclass(frozen=True)
class Pin:
    lineage: str
    pin_date: date
    bundle: dict[str, Any]
    looked: dict[str, Any] | None = None

    def new_days(self, data_end: date) -> int:
        return max(0, (data_end - self.pin_date).days)

    def status(self, data_end: date | None) -> dict[str, Any]:
        new = None if data_end is None else self.new_days(data_end)
        return {
            "lineage": self.lineage,
            "pin_date": self.pin_date.isoformat(),
            "bundle": self.bundle,
            "looked": self.looked is not None,
            "new_days": new,
            "needed": MIN_NEW_DAYS,
            "ready": self.looked is None and new is not None and new >= MIN_NEW_DAYS,
            "days_remaining": (None if new is None else max(0, MIN_NEW_DAYS - new)),
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "lineage": self.lineage,
            "pin_date": self.pin_date.isoformat(),
            "bundle": self.bundle,
            "looked": self.looked,
        }


def check_lineage(name: str) -> str:
    if not _LINEAGE.match(name):
        raise ValueError(
            f"'{name}' is not a lineage name (lowercase letters, digits, - and _)"
        )
    return name


def _path(directory: Path, lineage: str) -> Path:
    return directory / f"{check_lineage(lineage)}.json"


def init_pin(
    directory: Path,
    lineage: str,
    *,
    pin_date: date,
    bundle: dict[str, Any],
) -> Pin:
    path = _path(directory, lineage)
    if path.exists():
        raise HoldoutExists(f"Lineage '{lineage}' is already pinned at {path}")
    pin = Pin(lineage=lineage, pin_date=pin_date, bundle=bundle)
    directory.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(pin.as_dict(), indent=2, sort_keys=True) + "\n")
    return pin


def read_pin(directory: Path, lineage: str) -> Pin:
    path = _path(directory, lineage)
    if not path.is_file():
        raise HoldoutNotFound(f"Lineage '{lineage}' has no pin; run `holdout init`")
    raw = json.loads(path.read_text())
    return Pin(
        lineage=raw["lineage"],
        pin_date=date.fromisoformat(raw["pin_date"]),
        bundle=raw["bundle"],
        looked=raw.get("looked"),
    )


def consume_look(
    directory: Path,
    pin: Pin,
    *,
    data_end: date,
    record: dict[str, Any],
) -> Pin:
    """Spend the lineage's look. Raises unless it is allowed; writes before returning."""
    if pin.looked is not None:
        raise HoldoutAlreadyLooked(f"Lineage '{pin.lineage}' has already had its look")
    new = pin.new_days(data_end)
    if new < MIN_NEW_DAYS:
        raise HoldoutNeedsNewData(
            f"Only {new} days of data since the pin on {pin.pin_date}; "
            f"{MIN_NEW_DAYS - new} more are needed"
        )
    spent = Pin(pin.lineage, pin.pin_date, pin.bundle, looked=record)
    _path(directory, pin.lineage).write_text(
        json.dumps(spent.as_dict(), indent=2, sort_keys=True) + "\n"
    )
    return spent


__all__ = [
    "HoldoutAlreadyLooked",
    "HoldoutError",
    "HoldoutExists",
    "HoldoutNeedsNewData",
    "HoldoutNotFound",
    "MIN_NEW_DAYS",
    "Pin",
    "check_lineage",
    "consume_look",
    "init_pin",
    "read_pin",
]

"""Anchored walk-forward folds.

Each fold trains on everything from the start of the development window up to a
cut and tests on the next block of days; the next fold moves the cut forward by
one block, so test blocks never overlap and each fold trains on more history
than the one before. The sizes are the ones ``coverage`` recommends from.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from src.services.backtesting.lab.coverage import MIN_IN_SAMPLE_DAYS, OOS_BLOCK_DAYS

# A sweep claims nothing from fewer folds than this.
MIN_FOLDS = 3


@dataclass(frozen=True)
class Fold:
    index: int
    train: tuple[date, date]
    test: tuple[date, date]

    def as_dict(self) -> dict[str, dict[str, str] | int]:
        return {
            "index": self.index,
            "train": {
                "start": self.train[0].isoformat(),
                "end": self.train[1].isoformat(),
            },
            "test": {
                "start": self.test[0].isoformat(),
                "end": self.test[1].isoformat(),
            },
        }


def folds_for(start: date, end: date) -> list[Fold]:
    """The folds a development window ``start..end`` (inclusive) supports."""
    days = (end - start).days + 1
    count = max(0, (days - MIN_IN_SAMPLE_DAYS) // OOS_BLOCK_DAYS)
    folds: list[Fold] = []
    for index in range(count):
        train_end = start + timedelta(
            days=MIN_IN_SAMPLE_DAYS + index * OOS_BLOCK_DAYS - 1
        )
        test_start = train_end + timedelta(days=1)
        test_end = test_start + timedelta(days=OOS_BLOCK_DAYS - 1)
        folds.append(Fold(index + 1, (start, train_end), (test_start, test_end)))
    return folds


__all__ = ["Fold", "MIN_FOLDS", "folds_for"]

from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.lab.coverage import (
    MIN_IN_SAMPLE_DAYS,
    OOS_BLOCK_DAYS,
    CompleteWindow,
    recommend_split,
)
from src.services.backtesting.lab.folds import MIN_FOLDS, folds_for

START = date(2025, 1, 1)


def _end(days: int) -> date:
    return START + timedelta(days=days - 1)


@pytest.mark.parametrize("days", [100, MIN_IN_SAMPLE_DAYS, 359])
def test_a_short_window_has_no_folds(days: int) -> None:
    assert folds_for(START, _end(days)) == []


def test_one_block_after_the_minimum_training_is_one_fold() -> None:
    [fold] = folds_for(START, _end(MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS))

    assert fold.index == 1
    assert fold.train == (START, _end(MIN_IN_SAMPLE_DAYS))
    assert fold.test == (
        _end(MIN_IN_SAMPLE_DAYS) + timedelta(days=1),
        _end(MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS),
    )


def test_each_fold_trains_on_more_and_tests_a_new_block() -> None:
    folds = folds_for(START, _end(MIN_IN_SAMPLE_DAYS + 4 * OOS_BLOCK_DAYS + 10))

    assert len(folds) == 4
    for earlier, later in zip(folds, folds[1:], strict=False):
        assert later.train[0] == earlier.train[0] == START
        assert later.train[1] == earlier.train[1] + timedelta(days=OOS_BLOCK_DAYS)
        assert later.test[0] == earlier.test[1] + timedelta(days=1)
    for fold in folds:
        assert (fold.test[1] - fold.test[0]).days + 1 == OOS_BLOCK_DAYS
        assert fold.test[0] == fold.train[1] + timedelta(days=1)


@pytest.mark.parametrize("days", [200, 359, 360, 449, 450, 540, 719, 720, 900])
def test_the_folds_match_what_coverage_recommends(days: int) -> None:
    window = CompleteWindow(START, _end(days), days)
    recommendation = recommend_split(window)
    development = recommendation.development
    assert development is not None

    assert len(folds_for(*development)) == recommendation.folds


def test_a_fold_serializes() -> None:
    [fold] = folds_for(START, _end(MIN_IN_SAMPLE_DAYS + OOS_BLOCK_DAYS))

    assert fold.as_dict() == {
        "index": 1,
        "train": {"start": "2025-01-01", "end": "2025-09-27"},
        "test": {"start": "2025-09-28", "end": "2025-12-26"},
    }
    assert MIN_FOLDS == 3

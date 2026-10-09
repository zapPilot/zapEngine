from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from src.services.backtesting.lab.holdout import (
    MIN_NEW_DAYS,
    HoldoutAlreadyLooked,
    HoldoutExists,
    HoldoutNeedsNewData,
    HoldoutNotFound,
    check_lineage,
    consume_look,
    init_pin,
    read_pin,
)

PIN = date(2026, 1, 1)
BUNDLE = {"name": "prod", "ref": "prod:2026-01-01-x", "content_sha256": "abc"}


def _pinned(tmp_path: Path):
    return init_pin(tmp_path, "trend_guard", pin_date=PIN, bundle=BUNDLE)


def test_a_pin_is_written_and_read_back(tmp_path: Path) -> None:
    pin = _pinned(tmp_path)

    assert read_pin(tmp_path, "trend_guard") == pin
    saved = json.loads((tmp_path / "trend_guard.json").read_text())
    assert saved == {
        "lineage": "trend_guard",
        "pin_date": "2026-01-01",
        "bundle": BUNDLE,
        "looked": None,
    }


def test_a_pin_is_never_moved(tmp_path: Path) -> None:
    _pinned(tmp_path)

    with pytest.raises(HoldoutExists, match="already pinned"):
        init_pin(
            tmp_path, "trend_guard", pin_date=PIN + timedelta(days=30), bundle=BUNDLE
        )

    assert read_pin(tmp_path, "trend_guard").pin_date == PIN


def test_an_unknown_lineage_has_no_pin(tmp_path: Path) -> None:
    with pytest.raises(HoldoutNotFound, match="holdout init"):
        read_pin(tmp_path, "nothing_here")


@pytest.mark.parametrize("name", ["", "Bad", "../x", "a/b", "1x", "x" * 49])
def test_a_bad_lineage_name_is_refused(name: str, tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="not a lineage name"):
        check_lineage(name)
    with pytest.raises(ValueError):
        read_pin(tmp_path, name)


def test_status_counts_the_new_days(tmp_path: Path) -> None:
    pin = _pinned(tmp_path)

    waiting = pin.status(PIN + timedelta(days=30))
    ready = pin.status(PIN + timedelta(days=MIN_NEW_DAYS))
    unknown = pin.status(None)

    assert (waiting["new_days"], waiting["ready"], waiting["days_remaining"]) == (
        30,
        False,
        60,
    )
    assert (ready["new_days"], ready["ready"], ready["days_remaining"]) == (90, True, 0)
    assert unknown["new_days"] is None and unknown["ready"] is False
    assert unknown["days_remaining"] is None
    assert waiting["needed"] == MIN_NEW_DAYS
    assert waiting["looked"] is False


def test_data_older_than_the_pin_is_zero_new_days(tmp_path: Path) -> None:
    assert _pinned(tmp_path).new_days(PIN - timedelta(days=5)) == 0


def test_the_look_needs_enough_new_data(tmp_path: Path) -> None:
    pin = _pinned(tmp_path)

    with pytest.raises(HoldoutNeedsNewData, match="60 more are needed"):
        consume_look(tmp_path, pin, data_end=PIN + timedelta(days=30), record={})

    assert read_pin(tmp_path, "trend_guard").looked is None


def test_the_look_is_spent_once(tmp_path: Path) -> None:
    pin = _pinned(tmp_path)
    record = {"spec": {"ref": "x@1#a"}}

    spent = consume_look(
        tmp_path, pin, data_end=PIN + timedelta(days=MIN_NEW_DAYS), record=record
    )

    assert spent.looked == record
    assert read_pin(tmp_path, "trend_guard").looked == record
    assert spent.status(PIN + timedelta(days=200))["ready"] is False
    with pytest.raises(HoldoutAlreadyLooked):
        consume_look(
            tmp_path,
            read_pin(tmp_path, "trend_guard"),
            data_end=PIN + timedelta(days=200),
            record={},
        )

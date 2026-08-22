from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest

from scripts.landing.market_signals import (
    normalize_meta_timestamp,
    validate_dashboard_payload,
    write_payload,
)


def _payload() -> dict[str, Any]:
    ids = ("btc", "eth", "spy", "eth_btc", "fgi", "macro_fear_greed")
    return {
        "series": {series_id: {} for series_id in ids},
        "snapshots": [
            {
                "snapshot_date": "2026-08-20",
                "values": {series_id: {"value": 1} for series_id in ids},
            }
        ],
        "meta": {"count": 1, "timestamp": "2026-08-21T12:34:56Z"},
    }


def test_validate_dashboard_payload_accepts_complete_payload() -> None:
    validate_dashboard_payload(_payload())


def test_validate_dashboard_payload_rejects_missing_series() -> None:
    payload = _payload()
    del payload["series"]["spy"]

    with pytest.raises(ValueError, match="spy"):
        validate_dashboard_payload(payload)


def test_validate_dashboard_payload_rejects_empty_snapshots() -> None:
    payload = _payload()
    payload["snapshots"] = []

    with pytest.raises(ValueError, match="must not be empty"):
        validate_dashboard_payload(payload)


def test_validate_dashboard_payload_rejects_wrong_count() -> None:
    payload = _payload()
    payload["meta"]["count"] = 2

    with pytest.raises(ValueError, match="does not match"):
        validate_dashboard_payload(payload)


def test_normalize_meta_timestamp_is_idempotent() -> None:
    payload = _payload()
    once = normalize_meta_timestamp(payload)
    twice = normalize_meta_timestamp(payload)

    assert once == twice
    assert twice["meta"]["timestamp"] == "2026-08-20T00:00:00Z"


def test_write_payload_round_trips(tmp_path: Path) -> None:
    payload = _payload()
    out = tmp_path / "market-signals.json"

    write_payload(payload, out)

    assert json.loads(out.read_text(encoding="utf-8")) == payload
    assert out.read_text(encoding="utf-8").endswith("\n")


def test_write_payload_requires_existing_parent(tmp_path: Path) -> None:
    payload = deepcopy(_payload())

    with pytest.raises(FileNotFoundError):
        write_payload(payload, tmp_path / "missing" / "market-signals.json")

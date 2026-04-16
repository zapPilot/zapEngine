"""Unit tests for strict DMA-first cross verification script."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from scripts.backtesting.compare_payload import VerificationError
from scripts.backtesting.compare_verify import verify


def _strategy_state(
    *,
    cross_event: str | None,
    reason: str,
    immediate: bool,
    event: str | None,
    spot: float,
    stable: float,
) -> dict[str, Any]:
    return {
        "portfolio": {
            "spot_usd": spot,
            "stable_usd": stable,
            "total_value": spot + stable,
            "allocation": {
                "spot": 0.0 if spot + stable == 0 else spot / (spot + stable),
                "stable": 1.0 if spot + stable == 0 else stable / (spot + stable),
            },
        },
        "signal": {
            "id": "dma_gated_fgi",
            "regime": "neutral",
            "raw_value": 50.0,
            "confidence": 1.0,
            "details": {
                "dma": {
                    "dma_200": 100.0,
                    "distance": 0.01,
                    "zone": "above",
                    "cross_event": cross_event,
                }
            },
        },
        "decision": {
            "action": "sell" if cross_event == "cross_down" else "buy",
            "reason": reason,
            "rule_group": "cross",
            "target_allocation": {
                "spot": 0.0 if cross_event == "cross_down" else 1.0,
                "stable": 1.0 if cross_event == "cross_down" else 0.0,
            },
            "target_asset_allocation": {
                "btc": 0.0 if cross_event == "cross_down" else 1.0,
                "eth": 0.0,
                "stable": 1.0 if cross_event == "cross_down" else 0.0,
                "alt": 0.0,
            },
            "immediate": immediate,
        },
        "execution": {
            "event": event,
            "transfers": [],
            "blocked_reason": None,
            "step_count": 1,
            "steps_remaining": 0,
            "interval_days": 1,
            "diagnostics": {"plugins": {}},
        },
    }


def _timeline_point(
    date_value: str, strategies: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    return {
        "market": {
            "date": date_value,
            "token_price": {"btc": 100000.0},
            "sentiment": 50,
            "sentiment_label": "neutral",
        },
        "strategies": strategies,
    }


def _write_payload(tmp_path: Path, timeline: list[dict[str, Any]]) -> str:
    path = tmp_path / "backtest.json"
    path.write_text(json.dumps({"timeline": timeline}))
    return str(path)


def test_verify_passes_for_cross_down_and_cross_up(tmp_path: Path) -> None:
    path = _write_payload(
        tmp_path,
        [
            _timeline_point(
                "2025-03-09",
                {
                    "dma_case": _strategy_state(
                        cross_event="cross_down",
                        reason="dma_cross_down",
                        immediate=True,
                        event="rebalance",
                        spot=0.0,
                        stable=10_000.0,
                    )
                },
            ),
            _timeline_point(
                "2025-06-01",
                {
                    "dma_case": _strategy_state(
                        cross_event="cross_up",
                        reason="dma_cross_up",
                        immediate=True,
                        event="rebalance",
                        spot=10_000.0,
                        stable=0.0,
                    )
                },
            ),
        ],
    )

    report = verify(path, required_cross_down_dates=("2025-03-09",))
    assert report.strategy_id == "dma_case"
    assert [check.cross_event for check in report.cross_checks] == [
        "cross_down",
        "cross_up",
    ]


def test_verify_fails_when_required_cross_down_date_missing(tmp_path: Path) -> None:
    path = _write_payload(
        tmp_path,
        [
            _timeline_point(
                "2025-06-01",
                {
                    "dma_case": _strategy_state(
                        cross_event="cross_up",
                        reason="dma_cross_up",
                        immediate=True,
                        event="rebalance",
                        spot=10_000.0,
                        stable=0.0,
                    )
                },
            )
        ],
    )

    with pytest.raises(VerificationError, match="Required cross_down date 2025-03-09"):
        verify(path, required_cross_down_dates=("2025-03-09",))


def test_verify_fails_when_cross_does_not_execute(tmp_path: Path) -> None:
    path = _write_payload(
        tmp_path,
        [
            _timeline_point(
                "2025-03-09",
                {
                    "dma_case": _strategy_state(
                        cross_event="cross_down",
                        reason="dma_cross_down",
                        immediate=False,
                        event=None,
                        spot=25.0,
                        stable=9975.0,
                    )
                },
            )
        ],
    )

    with pytest.raises(VerificationError, match="cross_down failed validation"):
        verify(path)

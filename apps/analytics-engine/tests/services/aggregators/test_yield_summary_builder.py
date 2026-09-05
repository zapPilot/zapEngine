"""Tests for multi-window protocol yield summary construction."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.aggregators.yield_summary_builder import build_yield_summary


def _delta(
    day: date,
    value: float,
    protocol: str = "Morpho",
    chain: str = "ethereum",
    *,
    current_amounts: dict[str, object] | None = None,
    name_item: str | None = None,
) -> dict[str, object]:
    return {
        "snapshot_at": day.isoformat(),
        "protocol_name": protocol,
        "chain": chain,
        "token_yield_usd": value,
        "current_amounts": current_amounts or {},
        "name_item": name_item,
    }


def test_iqr_removes_deposit_spike_from_run_rate() -> None:
    start = date(2026, 7, 1)
    deltas = [_delta(start + timedelta(days=index), 2.0) for index in range(29)]
    deltas.append(_delta(start + timedelta(days=29), 1_000.0))

    window = build_yield_summary("user", deltas, ("30d",), "iqr").windows["30d"]

    assert window.average_daily_yield_usd == pytest.approx(2.0)
    assert window.statistics.outliers_removed == 1
    assert window.protocol_breakdown[0].window.negative_days == 0


def test_negative_strategy_streak_is_preserved() -> None:
    start = date(2026, 8, 1)
    deltas = [
        _delta(start + timedelta(days=index), -float(index + 1), "GMX V2", "arb")
        for index in range(7)
    ]

    window = build_yield_summary("user", deltas, ("7d",), "iqr").windows["7d"]

    assert window.statistics.outliers_removed == 0
    assert window.protocol_breakdown[0].window.negative_days == 7
    assert window.average_daily_yield_usd == pytest.approx(-4.0)


def test_fewer_than_four_points_are_not_filtered() -> None:
    end = date(2026, 8, 20)
    deltas = [_delta(end - timedelta(days=2), 1), _delta(end, 100)]

    window = build_yield_summary("user", deltas, ("7d",), "iqr").windows["7d"]

    assert window.statistics.outliers_removed == 0
    assert window.statistics.filtered_days == 2


def test_windows_anchor_to_latest_delta_date() -> None:
    end = date(2020, 3, 20)
    deltas = [_delta(end - timedelta(days=index), 1) for index in range(40)]

    summary = build_yield_summary("user", deltas, ("7d", "30d"), "none")

    assert summary.windows["7d"].period.end_date == end.isoformat()
    assert summary.windows["7d"].statistics.total_days == 7
    assert summary.windows["30d"].statistics.total_days == 30


def test_empty_deltas_return_valid_zero_windows() -> None:
    window = build_yield_summary("user", [], ("30d",), "iqr").windows["30d"]

    assert window.average_daily_yield_usd == 0
    assert window.statistics.total_days == 0
    assert window.protocol_breakdown == []


def test_protocols_are_filtered_independently() -> None:
    start = date(2026, 7, 1)
    deltas = []
    for index in range(10):
        day = start + timedelta(days=index)
        deltas.append(_delta(day, 500 if index == 9 else 5, "GMX V2", "arb"))
        deltas.append(_delta(day, float(index + 1), "Morpho", "ethereum"))

    window = build_yield_summary("user", deltas, ("30d",), "iqr").windows["30d"]
    morpho = next(
        item for item in window.protocol_breakdown if item.protocol == "Morpho"
    )

    assert window.statistics.outliers_removed == 1
    assert morpho.window.data_points == 10
    assert morpho.window.total_yield_usd == pytest.approx(55)


def test_protocol_breakdown_carries_window_position_metadata() -> None:
    end = date(2026, 8, 20)
    deltas = [
        _delta(
            end - timedelta(days=1),
            1,
            current_amounts={"USDC": {"amount": 100}, "WETH": {"amount": 0.1}},
            name_item="Lending",
        ),
        _delta(
            end,
            2,
            current_amounts={"USDC": {"amount": 101}},
            name_item="Lending",
        ),
    ]

    window = build_yield_summary("user", deltas, ("7d",), "none").windows["7d"]
    row = window.protocol_breakdown[0]

    assert row.token_symbols == ["USDC", "WETH"]
    assert row.position_types == ["Lending"]


def test_position_metadata_is_scoped_to_each_window() -> None:
    end = date(2026, 8, 20)
    deltas = [
        _delta(
            end - timedelta(days=20),
            1,
            current_amounts={"DAI": {"amount": 50}},
            name_item="Staked",
        ),
        _delta(
            end,
            2,
            current_amounts={"USDC": {"amount": 101}},
            name_item="Lending",
        ),
    ]

    summary = build_yield_summary("user", deltas, ("7d", "30d"), "none")

    recent = summary.windows["7d"].protocol_breakdown[0]
    assert recent.token_symbols == ["USDC"]
    assert recent.position_types == ["Lending"]

    full = summary.windows["30d"].protocol_breakdown[0]
    assert full.token_symbols == ["DAI", "USDC"]
    assert full.position_types == ["Lending", "Staked"]

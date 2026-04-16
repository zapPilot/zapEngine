from __future__ import annotations

import pytest

from src.services.backtesting.strategies.dma_buy_sideways_gate import (
    DmaBuySidewaysGate,
)


def test_sideways_confirms_only_when_window_range_is_narrow() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.15, -0.16, -0.14, -0.15, -0.16):
        gate.observe_dma_distance(value)

    snapshot = gate.snapshot(buy_strength=0.2)
    assert snapshot.buy_sideways_confirmed is True
    assert snapshot.buy_sideways_range == pytest.approx(0.02)


def test_sideways_not_confirmed_when_range_is_too_wide() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.15, -0.05, -0.14, -0.04, -0.13):
        gate.observe_dma_distance(value)

    snapshot = gate.snapshot(buy_strength=0.2)
    assert snapshot.buy_sideways_confirmed is False
    assert snapshot.buy_sideways_range is not None
    assert snapshot.buy_sideways_range > 0.04


def test_sideways_confirms_at_exact_threshold() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.20, -0.18, -0.16, -0.20, -0.16):
        gate.observe_dma_distance(value)

    snapshot = gate.snapshot(buy_strength=0.3)
    assert snapshot.buy_sideways_confirmed is True
    assert snapshot.buy_sideways_range == pytest.approx(0.04)


def test_sideways_not_confirmed_before_full_history_window() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.15, -0.16, -0.14, -0.15):
        gate.observe_dma_distance(value)

    snapshot = gate.snapshot(buy_strength=0.2)
    assert snapshot.buy_sideways_confirmed is False
    assert snapshot.buy_sideways_range is None


def test_consumed_episode_requires_breakout_then_reconfirm() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.15, -0.16, -0.14, -0.15, -0.16):
        gate.observe_dma_distance(value)

    first = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.2)
    assert first.allowed is True
    assert first.snapshot.buy_leg_index == 1
    assert first.snapshot.buy_leg_cap_pct == 0.05

    gate.record_buy_execution(500.0)
    blocked = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.2)
    assert blocked.allowed is False
    assert blocked.snapshot.buy_gate_block_reason == "breakout_not_seen"

    for value in (-0.15, -0.05, -0.14, -0.04, -0.13):
        gate.observe_dma_distance(value)

    neutral_snapshot = gate.snapshot(buy_strength=0.2)
    assert neutral_snapshot.buy_episode_state == "idle"
    assert neutral_snapshot.buy_leg_index is None

    for value in (-0.25, -0.24, -0.23, -0.25, -0.24):
        gate.observe_dma_distance(value)

    second = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.6)
    assert second.allowed is True
    assert second.snapshot.buy_leg_index == 2
    assert second.snapshot.buy_leg_cap_pct == 0.10


def test_cross_style_reset_clears_ladder_progress() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.15, -0.16, -0.14, -0.15, -0.16):
        gate.observe_dma_distance(value)

    first = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.2)
    gate.record_buy_execution(500.0)
    assert first.snapshot.buy_leg_index == 1

    gate.reset()

    for value in (-0.25, -0.24, -0.23, -0.25, -0.24):
        gate.observe_dma_distance(value)

    after_reset = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.6)
    assert after_reset.snapshot.buy_leg_index == 1
    assert after_reset.snapshot.buy_leg_cap_pct == 0.05


def test_record_zero_buy_execution_does_not_consume_episode() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for value in (-0.15, -0.16, -0.14, -0.15, -0.16):
        gate.observe_dma_distance(value)

    first = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.2)
    assert first.allowed is True
    gate.record_buy_execution(0.0)

    snapshot = gate.snapshot(buy_strength=0.2)
    assert snapshot.buy_episode_state == "armed"
    assert snapshot.buy_leg_index == 1
    assert snapshot.buy_leg_spent_usd == 0.0


def test_third_leg_uses_twenty_percent_cap() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    for leg, sideways_values in (
        (1, (-0.15, -0.16, -0.14, -0.15, -0.16)),
        (2, (-0.25, -0.24, -0.23, -0.25, -0.24)),
        (3, (-0.35, -0.34, -0.33, -0.35, -0.34)),
    ):
        for value in sideways_values:
            gate.observe_dma_distance(value)
        decision = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=0.8)
        assert decision.allowed is True
        assert decision.snapshot.buy_leg_index == leg
        if leg == 1:
            assert decision.snapshot.buy_leg_cap_pct == pytest.approx(0.05)
            gate.record_buy_execution(500.0)
        elif leg == 2:
            assert decision.snapshot.buy_leg_cap_pct == pytest.approx(0.10)
            gate.record_buy_execution(1_000.0)
        else:
            assert decision.snapshot.buy_leg_cap_pct == pytest.approx(0.20)
            assert decision.snapshot.buy_leg_cap_usd == pytest.approx(2_000.0)
            gate.record_buy_execution(2_000.0)

        if leg < 3:
            for breakout in (-0.15, -0.05, -0.14, -0.04, -0.13):
                gate.observe_dma_distance(breakout)


def test_fourth_leg_has_no_fixed_cap() -> None:
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    leg_sequences = (
        (-0.15, -0.16, -0.14, -0.15, -0.16),
        (-0.25, -0.24, -0.23, -0.25, -0.24),
        (-0.35, -0.34, -0.33, -0.35, -0.34),
        (-0.45, -0.44, -0.43, -0.45, -0.44),
    )
    spend_amounts = (500.0, 1_000.0, 2_000.0, 2_500.0)
    for idx, (sequence, spend) in enumerate(
        zip(leg_sequences, spend_amounts, strict=True)
    ):
        for value in sequence:
            gate.observe_dma_distance(value)
        decision = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=1.0)
        assert decision.allowed is True
        assert decision.snapshot.buy_leg_index == idx + 1
        if idx < 3:
            assert decision.snapshot.buy_leg_cap_pct is not None
        else:
            assert decision.snapshot.buy_leg_cap_pct is None
            assert decision.snapshot.buy_leg_cap_usd is None
        gate.record_buy_execution(spend)
        if idx < 3:
            for breakout in (-0.15, -0.05, -0.14, -0.04, -0.13):
                gate.observe_dma_distance(breakout)


def test_observe_armed_episode_clears_when_range_exceeds_threshold() -> None:
    """Lines 79-80: armed episode is cleared when sideways range > threshold."""
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)

    # Fill window with narrow sideways range to confirm sideways
    for value in (-0.15, -0.16, -0.14, -0.15, -0.16):
        gate.observe_dma_distance(value)

    # Arm the gate
    decision = gate.prepare_buy_execution(nav_usd=10_000.0, buy_strength=1.0)
    assert decision.allowed is True
    assert decision.snapshot.buy_episode_state == "armed"

    # Now inject a wide range (breakout) to clear the armed episode
    for value in (-0.15, -0.05, -0.14, -0.04, -0.13):
        gate.observe_dma_distance(value)

    snapshot = gate.snapshot(buy_strength=0.5)
    # After clearing, the episode should be reset (idle)
    assert snapshot.buy_episode_state == "idle"


def test_cap_buy_amount_returns_zero_for_non_positive_amount() -> None:
    """Line 154: cap_buy_amount returns 0.0 when planned_buy_usd <= 0."""
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)
    assert gate.cap_buy_amount(0.0) == 0.0
    assert gate.cap_buy_amount(-10.0) == 0.0


def test_cap_buy_amount_returns_full_amount_when_no_cap_set() -> None:
    """Line 156: cap_buy_amount returns full amount when _active_leg_cap_usd is None."""
    gate = DmaBuySidewaysGate(window_days=5, sideways_range_threshold=0.04)
    # No episode armed → _active_leg_cap_usd is None
    result = gate.cap_buy_amount(500.0)
    assert result == pytest.approx(500.0)

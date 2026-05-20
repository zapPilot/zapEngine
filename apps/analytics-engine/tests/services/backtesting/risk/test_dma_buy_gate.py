"""Tests for DMA buy-gate risk guard."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    DIAG_SIGNALS_CONSULTED,
    PortfolioRuleConfig,
)
from src.services.backtesting.risk.dma_buy_gate import DmaBuyGateGuard
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def _buy_intent() -> AllocationIntent:
    return AllocationIntent(
        action="buy",
        target_allocation={
            "btc": 0.05,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.95,
            "alt": 0.0,
        },
        allocation_name="test_dca_buy",
        immediate=False,
        reason="test_dca_buy",
        rule_group="dma_fgi",
        decision_score=1.0,
        diagnostics={"matched_rule_name": "test_dca_buy"},
    )


def _hold_intent() -> AllocationIntent:
    return AllocationIntent(
        action="hold",
        target_allocation={"stable": 1.0},
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
        diagnostics={"matched_rule_name": "regime_no_signal_hold"},
    )


def _buy_snapshot(*, offset: int = 0, dma_distance: float = -0.15):
    return snapshot(
        assets={
            "SPY": state(symbol="SPY", dma_distance=0.05),
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=dma_distance,
                fgi_regime="extreme_fear",
            ),
            "ETH": state(symbol="ETH", dma_distance=0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        cycle_open={"BTC": True},
        current_date=date(2025, 1, 1) + timedelta(days=offset),
    )


def test_dma_buy_gate_blocks_dca_buy_until_sideways_confirmed() -> None:
    guard = DmaBuyGateGuard()
    snap = _buy_snapshot()
    guard.observe(snap, config=PortfolioRuleConfig())

    intent = guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig())

    assert intent is not None
    assert intent.action == "hold"
    assert intent.reason == "dma_buy_gate_blocked"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "dma_buy_gate"
    assert intent.diagnostics["buy_gate_block_reason"] == "sideways_not_confirmed"


def test_dma_buy_gate_allows_dca_after_sideways_confirmation() -> None:
    guard = DmaBuyGateGuard()
    config = PortfolioRuleConfig()

    for idx, distance in enumerate((-0.150, -0.151, -0.149, -0.150, -0.151)):
        guard.observe(_buy_snapshot(offset=idx, dma_distance=distance), config=config)

    snap = _buy_snapshot(offset=5, dma_distance=-0.150)
    guard.observe(snap, config=config)

    assert guard.allow(_buy_intent(), snap, config=config) is None


def test_dma_buy_gate_does_not_block_when_no_dca_buy_candidate_exists() -> None:
    guard = DmaBuyGateGuard()
    snap = snapshot(
        assets={"BTC": state(symbol="BTC", fgi_regime="neutral")},
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        cycle_open={"BTC": True},
        current_date=date(2025, 1, 1),
    )
    guard.observe(snap, config=PortfolioRuleConfig())

    assert guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig()) is None


def test_dma_buy_gate_can_replace_hold_when_priority_pass_calls_it() -> None:
    guard = DmaBuyGateGuard()
    snap = _buy_snapshot()
    guard.observe(snap, config=PortfolioRuleConfig())

    intent = guard.allow(_hold_intent(), snap, config=PortfolioRuleConfig())

    assert intent is not None
    assert intent.action == "hold"
    assert intent.reason == "dma_buy_gate_blocked"


def test_dma_buy_gate_resets_after_dma_cross_event() -> None:
    guard = DmaBuyGateGuard()
    config = PortfolioRuleConfig()

    for idx, distance in enumerate((-0.150, -0.151, -0.149, -0.150, -0.151)):
        guard.observe(_buy_snapshot(offset=idx, dma_distance=distance), config=config)
    confirmed = _buy_snapshot(offset=5, dma_distance=-0.150)
    guard.observe(confirmed, config=config)
    assert guard.allow(_buy_intent(), confirmed, config=config) is None

    crossed = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.15,
                actionable_cross_event="cross_down",
                fgi_regime="extreme_fear",
            )
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        cycle_open={"BTC": True},
        current_date=date(2025, 1, 7),
    )
    guard.observe(crossed, config=config)

    assert guard.allow(_buy_intent(), crossed, config=config) is not None


def test_dma_buy_gate_reset_clears_consumed_episode() -> None:
    guard = DmaBuyGateGuard()
    config = PortfolioRuleConfig()
    for idx, distance in enumerate((-0.150, -0.151, -0.149, -0.150, -0.151)):
        guard.observe(_buy_snapshot(offset=idx, dma_distance=distance), config=config)
    snap = _buy_snapshot(offset=5, dma_distance=-0.150)
    guard.observe(snap, config=config)
    guard.record_intent(_buy_intent())

    blocked = guard.allow(_buy_intent(), snap, config=config)
    assert blocked is not None
    assert blocked.diagnostics is not None
    assert blocked.diagnostics["buy_gate_block_reason"] == "breakout_not_seen"

    guard.reset()
    guard.observe(_buy_snapshot(offset=6, dma_distance=-0.150), config=config)
    reset_block = guard.allow(_buy_intent(), snap, config=config)
    assert reset_block is not None
    assert reset_block.diagnostics is not None
    assert reset_block.diagnostics["buy_gate_block_reason"] == "sideways_not_confirmed"


def test_dma_buy_gate_does_not_block_without_stable_supply() -> None:
    guard = DmaBuyGateGuard()
    snap = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.15,
                fgi_regime="extreme_fear",
            )
        },
        current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
        cycle_open={"BTC": True},
        current_date=date(2025, 1, 1),
    )

    assert guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig()) is None


def test_dma_buy_gate_observe_ignores_empty_snapshot_and_reports_zero_strength() -> (
    None
):
    guard = DmaBuyGateGuard()
    snap = snapshot(assets={})

    guard.observe(snap, config=PortfolioRuleConfig())

    blocked = guard._blocking_snapshot(snap)
    assert blocked.buy_strength == pytest.approx(0.0)


def test_dma_buy_gate_block_diagnostic_can_include_signals_consulted() -> None:
    guard = DmaBuyGateGuard()
    snap = _buy_snapshot()
    guard.observe(snap, config=PortfolioRuleConfig(emit_signals_consulted=True))

    intent = guard.allow(
        _buy_intent(),
        snap,
        config=PortfolioRuleConfig(emit_signals_consulted=True),
    )

    assert intent is not None
    assert intent.diagnostics is not None
    assert intent.diagnostics[DIAG_SIGNALS_CONSULTED]["btc.fgi"] == "extreme_fear"

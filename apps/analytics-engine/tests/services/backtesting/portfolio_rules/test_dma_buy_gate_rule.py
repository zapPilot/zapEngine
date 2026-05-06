"""Tests for the portfolio-rule DMA buy gate."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.dma_buy_gate_rule import DmaBuyGateRule
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


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


def test_dma_buy_gate_blocks_extreme_fear_dca_until_sideways_confirmed() -> None:
    rule = DmaBuyGateRule()
    snap = _buy_snapshot()
    rule.observe(snap, config=PortfolioRuleConfig())

    assert rule.matches(snap, config=PortfolioRuleConfig()) is True
    intent = rule.build_intent(snap, config=PortfolioRuleConfig())

    assert intent.action == "hold"
    assert intent.reason == "dma_buy_gate_blocked"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "dma_buy_gate"
    assert intent.diagnostics["buy_gate_block_reason"] == "sideways_not_confirmed"


def test_dma_buy_gate_allows_dca_after_sideways_confirmation() -> None:
    rule = DmaBuyGateRule()
    config = PortfolioRuleConfig()

    for idx, distance in enumerate((-0.150, -0.151, -0.149, -0.150, -0.151)):
        rule.observe(_buy_snapshot(offset=idx, dma_distance=distance), config=config)

    snap = _buy_snapshot(offset=5, dma_distance=-0.150)
    rule.observe(snap, config=config)

    assert rule.matches(snap, config=config) is False


def test_dma_buy_gate_does_not_block_when_no_dca_buy_candidate_exists() -> None:
    rule = DmaBuyGateRule()
    snap = snapshot(
        assets={"BTC": state(symbol="BTC", fgi_regime="neutral")},
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        cycle_open={"BTC": True},
        current_date=date(2025, 1, 1),
    )
    rule.observe(snap, config=PortfolioRuleConfig())

    assert rule.matches(snap, config=PortfolioRuleConfig()) is False


def test_dma_buy_gate_resets_after_dma_cross_event() -> None:
    rule = DmaBuyGateRule()
    config = PortfolioRuleConfig()

    for idx, distance in enumerate((-0.150, -0.151, -0.149, -0.150, -0.151)):
        rule.observe(_buy_snapshot(offset=idx, dma_distance=distance), config=config)
    confirmed = _buy_snapshot(offset=5, dma_distance=-0.150)
    rule.observe(confirmed, config=config)
    assert rule.matches(confirmed, config=config) is False

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
    rule.observe(crossed, config=config)

    assert rule.matches(crossed, config=config) is True

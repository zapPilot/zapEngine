"""Tests for portfolio-rule sizing strategies."""

from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot
from src.services.backtesting.sizing import (
    FlatSizing,
    HeadroomSizing,
    RelativeSizing,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_flat_sizing_returns_base_step() -> None:
    snap = snapshot(assets={"BTC": state(symbol="BTC", fgi_value=10.0)})

    assert FlatSizing().adjust_step(0.05, snapshot=snap, asset="BTC") == pytest.approx(
        0.05
    )


def _holding(**weights: float) -> PortfolioSnapshot:
    current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    current.update(weights)
    return snapshot(current=current)


def test_relative_sizing_sells_a_share_of_the_position_not_of_the_portfolio() -> None:
    sizing = RelativeSizing(floor_weight=0.0)

    step = sizing.adjust_step(
        0.25, snapshot=_holding(btc=0.40, stable=0.60), asset="BTC"
    )

    assert step == pytest.approx(0.10)


def test_relative_sizing_never_cuts_into_the_floor() -> None:
    sizing = RelativeSizing(floor_weight=0.35)

    step = sizing.adjust_step(
        0.50, snapshot=_holding(btc=0.40, stable=0.60), asset="BTC"
    )

    assert step == pytest.approx(0.05)


def test_relative_sizing_sells_nothing_at_or_under_the_floor() -> None:
    sizing = RelativeSizing(floor_weight=0.40)

    assert sizing.adjust_step(
        0.50, snapshot=_holding(btc=0.40, stable=0.60), asset="BTC"
    ) == pytest.approx(0.0)
    assert sizing.adjust_step(
        0.50, snapshot=_holding(btc=0.10, stable=0.90), asset="BTC"
    ) == pytest.approx(0.0)


def test_relative_sizing_reads_the_weight_of_the_asset_asked_about() -> None:
    sizing = RelativeSizing(floor_weight=0.0)
    snap = _holding(btc=0.40, eth=0.20, stable=0.40)

    assert sizing.adjust_step(0.5, snapshot=snap, asset="ETH") == pytest.approx(0.10)
    assert sizing.adjust_step(0.5, snapshot=snap, asset="SPY") == pytest.approx(0.0)


def test_headroom_sizing_buys_no_more_than_the_step() -> None:
    sizing = HeadroomSizing(max_weight=0.50)

    step = sizing.adjust_step(
        0.10, snapshot=_holding(btc=0.20, stable=0.80), asset="BTC"
    )

    assert step == pytest.approx(0.10)


def test_headroom_sizing_stops_at_the_weight_cap() -> None:
    sizing = HeadroomSizing(max_weight=0.50)

    assert sizing.adjust_step(
        0.10, snapshot=_holding(btc=0.45, stable=0.55), asset="BTC"
    ) == pytest.approx(0.05)
    assert sizing.adjust_step(
        0.10, snapshot=_holding(btc=0.60, stable=0.40), asset="BTC"
    ) == pytest.approx(0.0)

"""Tests for portfolio-rule sizing strategies."""

from __future__ import annotations

import pytest

from src.services.backtesting.sizing import (
    FlatSizing,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_flat_sizing_returns_base_step() -> None:
    snap = snapshot(assets={"BTC": state(symbol="BTC", fgi_value=10.0)})

    assert FlatSizing().adjust_step(0.05, snapshot=snap, asset="BTC") == pytest.approx(
        0.05
    )

"""Tests for portfolio-rule sizing strategies."""

from __future__ import annotations

import pytest

from src.services.backtesting.sizing import (
    FgiExponentialSizing,
    FlatSizing,
    fgi_exponential_intensity,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_flat_sizing_returns_base_step() -> None:
    snap = snapshot(assets={"BTC": state(symbol="BTC", fgi_value=10.0)})

    assert FlatSizing().adjust_step(0.05, snapshot=snap, asset="BTC") == pytest.approx(
        0.05
    )


def test_fgi_exponential_intensity_uses_same_convex_curve_as_pacing() -> None:
    assert fgi_exponential_intensity(50.0, k=3.0) == pytest.approx(0.0)
    assert fgi_exponential_intensity(0.0, k=3.0) == pytest.approx(1.0)


def test_fgi_exponential_sizing_expands_steps_at_extreme_fgi() -> None:
    snap = snapshot(assets={"BTC": state(symbol="BTC", fgi_value=0.0)})
    sizing = FgiExponentialSizing(k=3.0, max_multiplier=1.5)

    assert sizing.adjust_step(0.05, snapshot=snap, asset="BTC") == pytest.approx(0.075)

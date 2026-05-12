"""Tests for FGI slope computation in the DMA signal runtime."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.runtime import (
    DmaGatedFgiSignalRuntime,
)


def _context(
    *,
    price: float = 50_000.0,
    dma_200: float = 48_000.0,
    fgi: float | None = 30.0,
    day: date = date(2025, 6, 1),
) -> SignalContext:
    sentiment: dict[str, object] | None = None
    if fgi is not None:
        sentiment = {"value": fgi}
    return SignalContext(
        date=day,
        price=price,
        sentiment=sentiment,
        price_history=[price] * 10,
        portfolio_value=10_000.0,
        extra_data={"dma_200": dma_200},
    )


class TestFgiSlopeComputation:
    def test_first_observation_slope_is_zero(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        result = runtime.observe(_context(fgi=30.0))
        assert result.fgi_slope == 0.0

    def test_second_observation_slope_nonzero(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=30.0, day=date(2025, 6, 1)))
        result = runtime.observe(_context(fgi=70.0, day=date(2025, 6, 2)))
        assert result.fgi_slope != 0.0

    def test_slope_direction_positive(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=30.0, day=date(2025, 6, 1)))
        result = runtime.observe(_context(fgi=70.0, day=date(2025, 6, 2)))
        assert result.fgi_slope > 0.0

    def test_slope_direction_negative(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=70.0, day=date(2025, 6, 1)))
        result = runtime.observe(_context(fgi=30.0, day=date(2025, 6, 2)))
        assert result.fgi_slope < 0.0

    def test_constant_fgi_slope_zero_after_warmup(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        for offset in range(5):
            result = runtime.observe(_context(fgi=50.0, day=date(2025, 6, 1 + offset)))
        assert abs(result.fgi_slope) < 1e-10

    def test_none_fgi_slope_zero(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=30.0, day=date(2025, 6, 1)))
        result = runtime.observe(_context(fgi=None, day=date(2025, 6, 2)))
        assert result.fgi_slope == 0.0

    def test_none_fgi_preserves_ema_state(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=30.0, day=date(2025, 6, 1)))
        runtime.observe(_context(fgi=None, day=date(2025, 6, 2)))
        result = runtime.observe(_context(fgi=70.0, day=date(2025, 6, 3)))
        assert result.fgi_slope != 0.0


class TestFgiSlopeReset:
    def test_reset_clears_ema(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=30.0, day=date(2025, 6, 1)))
        runtime.observe(_context(fgi=70.0, day=date(2025, 6, 2)))

        runtime.reset()

        result = runtime.observe(_context(fgi=50.0, day=date(2025, 6, 3)))
        assert result.fgi_slope == 0.0

    def test_reset_allows_fresh_start(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=30.0, day=date(2025, 6, 1)))
        runtime.reset()
        debug_state = runtime.debug_state()
        assert debug_state.fgi_ema_prev is None
        assert debug_state.fgi_ema_current is None


class TestFgiSlopeEmaValues:
    def test_ema_alpha_is_half(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()

        runtime.observe(_context(fgi=50.0, day=date(2025, 6, 1)))
        assert runtime.debug_state().fgi_ema_current == pytest.approx(0.0)

        runtime.observe(_context(fgi=100.0, day=date(2025, 6, 2)))
        debug_state = runtime.debug_state()
        assert debug_state.fgi_ema_current == pytest.approx(0.5)
        assert debug_state.fgi_ema_prev == pytest.approx(0.0)

    def test_slope_equals_ema_diff(self) -> None:
        runtime = DmaGatedFgiSignalRuntime()
        runtime.observe(_context(fgi=50.0, day=date(2025, 6, 1)))
        result = runtime.observe(_context(fgi=100.0, day=date(2025, 6, 2)))

        assert result.fgi_slope == pytest.approx(0.5)

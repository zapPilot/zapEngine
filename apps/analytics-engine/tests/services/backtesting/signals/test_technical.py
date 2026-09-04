from __future__ import annotations

import pytest

from src.services.backtesting.signals.technical import (
    build_technical_signal_snapshot,
    detect_rsi_divergence,
)


def test_build_technical_signal_snapshot_computes_close_price_indicators() -> None:
    prices = [100.0 + index for index in range(100)]

    snapshot = build_technical_signal_snapshot(prices)

    assert snapshot.rsi_14 == pytest.approx(100.0)
    assert snapshot.rsi_slope_5d == pytest.approx(0.0)
    assert snapshot.momentum_30d == pytest.approx(prices[-1] / prices[-31] - 1.0)
    assert snapshot.momentum_90d == pytest.approx(prices[-1] / prices[-91] - 1.0)
    assert snapshot.realized_volatility_20d is not None
    assert snapshot.realized_volatility_20d >= 0.0
    assert snapshot.macd_12_26 is not None
    assert snapshot.macd_signal_9 is not None
    assert snapshot.macd_histogram is not None
    assert snapshot.bollinger_zscore_20 is not None
    assert snapshot.bollinger_zscore_20 > 0.0
    assert snapshot.breakout_20d is True
    assert snapshot.breakdown_20d is False


def test_build_technical_signal_snapshot_detects_20d_breakdown() -> None:
    prices = [200.0 - index for index in range(40)]

    snapshot = build_technical_signal_snapshot(prices)

    assert snapshot.breakout_20d is False
    assert snapshot.breakdown_20d is True


def test_build_technical_signal_snapshot_handles_insufficient_history() -> None:
    snapshot = build_technical_signal_snapshot([100.0, 101.0, 102.0])

    assert snapshot.rsi_14 is None
    assert snapshot.rsi_slope_5d is None
    assert snapshot.realized_volatility_20d is None
    assert snapshot.momentum_30d is None
    assert snapshot.momentum_90d is None
    assert snapshot.macd_12_26 is None
    assert snapshot.macd_signal_9 is None
    assert snapshot.macd_histogram is None
    assert snapshot.bollinger_zscore_20 is None
    assert snapshot.bearish_rsi_divergence is False
    assert snapshot.bullish_rsi_divergence is False
    assert snapshot.macd_bearish_cross is False
    assert snapshot.macd_bullish_cross is False
    assert snapshot.breakout_20d is False
    assert snapshot.breakdown_20d is False


def test_detect_rsi_divergence_detects_bearish_trailing_window_proxy() -> None:
    prices = [100.0] * 28
    rsi_values: list[float | None] = [50.0] * 28
    prices[13] = 110.0
    rsi_values[13] = 75.0
    prices[27] = 112.0
    rsi_values[27] = 65.0

    bearish, bullish = detect_rsi_divergence(prices, rsi_values)

    assert bearish is True
    assert bullish is False


def test_detect_rsi_divergence_detects_bullish_trailing_window_proxy() -> None:
    prices = [100.0] * 28
    rsi_values: list[float | None] = [50.0] * 28
    prices[13] = 90.0
    rsi_values[13] = 25.0
    prices[27] = 88.0
    rsi_values[27] = 35.0

    bearish, bullish = detect_rsi_divergence(prices, rsi_values)

    assert bearish is False
    assert bullish is True

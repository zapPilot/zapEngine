from __future__ import annotations

import math

import pytest

from src.services.backtesting.signals.technical import (
    TECHNICAL_LOOKBACK_BARS,
    TechnicalSignalSnapshot,
    build_technical_signal_snapshot,
    detect_rsi_divergence,
)


def _wave(count: int, *, base: float, amplitude: float) -> list[float]:
    return [
        base + amplitude * math.sin(index / 7.0) + index * 0.05
        for index in range(count)
    ]


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


def test_build_technical_signal_snapshot_rejects_unusable_prices() -> None:
    empty = TechnicalSignalSnapshot()
    usable = _wave(60, base=100.0, amplitude=6.0)

    assert build_technical_signal_snapshot([*usable, "102.0"]) == empty
    assert build_technical_signal_snapshot([*usable, 0.0]) == empty
    assert build_technical_signal_snapshot([*usable, -5.0]) == empty
    assert build_technical_signal_snapshot([*usable, math.nan]) == empty
    assert build_technical_signal_snapshot(usable) != empty


def test_snapshot_depends_only_on_the_trailing_lookback_window() -> None:
    trailing = _wave(TECHNICAL_LOOKBACK_BARS, base=100.0, amplitude=8.0)
    short_run = [*_wave(40, base=300.0, amplitude=2.0), *trailing]
    long_run = [*_wave(400, base=20.0, amplitude=5.0), *trailing]

    snapshot = build_technical_signal_snapshot(short_run)

    assert snapshot == build_technical_signal_snapshot(long_run)
    assert snapshot.rsi_14 is not None
    assert snapshot.momentum_90d is not None
    assert snapshot.macd_12_26 is not None


def test_macd_cross_flags_fire_once_per_trend_turn() -> None:
    rising = [100.0 + index for index in range(60)]
    falling = [*rising, *[rising[-1] - index * 2.0 for index in range(1, 41)]]
    recovering = [*falling, *[falling[-1] + index * 2.0 for index in range(1, 61)]]

    snapshots = [
        build_technical_signal_snapshot(recovering[:length])
        for length in range(35, len(recovering) + 1)
    ]
    bearish_turns = [index for index, s in enumerate(snapshots) if s.macd_bearish_cross]
    bullish_turns = [index for index, s in enumerate(snapshots) if s.macd_bullish_cross]

    assert len(bearish_turns) == 1
    assert len(bullish_turns) == 1
    assert bearish_turns[0] < bullish_turns[0]

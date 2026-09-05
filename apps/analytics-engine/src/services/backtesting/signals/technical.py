"""Causal technical indicators derived from trailing price history.

These helpers intentionally consume only the price history already present in the
current StrategyContext. The backtest engine appends the current day's price
before strategy evaluation, so every value here is available as-of the decision
date and does not require future bars.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass

# Every indicator here reads at most 91 trailing closes, and the recursive ones
# (Wilder RSI, MACD EMAs) shed their seed within roughly ten times their slowest
# period: over this window a 700-bar history and a 260-bar one agree to under
# 1e-6 on a 0-100 RSI and 1e-8 relative on MACD. Capping the window keeps a given
# day's values independent of how far back the backtest happened to start, keeps
# the per-day cost constant instead of growing with the run length, and stops one
# unusable close from blanking every later day.
TECHNICAL_LOOKBACK_BARS = 260


@dataclass(frozen=True, slots=True)
class TechnicalSignalSnapshot:
    """Small, typed research surface for reusable close-price signals."""

    rsi_14: float | None = None
    rsi_slope_5d: float | None = None
    realized_volatility_20d: float | None = None
    momentum_30d: float | None = None
    momentum_90d: float | None = None
    macd_12_26: float | None = None
    macd_signal_9: float | None = None
    macd_histogram: float | None = None
    bollinger_zscore_20: float | None = None
    bearish_rsi_divergence: bool = False
    bullish_rsi_divergence: bool = False
    macd_bearish_cross: bool = False
    macd_bullish_cross: bool = False
    breakout_20d: bool = False
    breakdown_20d: bool = False


def build_technical_signal_snapshot(
    price_history: Sequence[float],
) -> TechnicalSignalSnapshot:
    """Build technical indicators from an as-of-date trailing close history."""

    prices = _normalize_prices(price_history[-TECHNICAL_LOOKBACK_BARS:])
    if not prices:
        return TechnicalSignalSnapshot()

    rsi_values = _rsi_series(prices, period=14)
    bearish_divergence, bullish_divergence = detect_rsi_divergence(
        prices,
        rsi_values,
    )
    (
        macd_value,
        macd_signal,
        macd_histogram,
        macd_bearish_cross,
        macd_bullish_cross,
    ) = _macd_snapshot(prices)
    breakout_20d, breakdown_20d = _channel_breaks(prices, window=20)
    return TechnicalSignalSnapshot(
        rsi_14=rsi_values[-1],
        rsi_slope_5d=_rsi_slope(rsi_values, lag=5),
        realized_volatility_20d=_realized_volatility(prices, window=20),
        momentum_30d=_momentum(prices, lookback=30),
        momentum_90d=_momentum(prices, lookback=90),
        macd_12_26=macd_value,
        macd_signal_9=macd_signal,
        macd_histogram=macd_histogram,
        bollinger_zscore_20=_bollinger_zscore(prices, window=20),
        bearish_rsi_divergence=bearish_divergence,
        bullish_rsi_divergence=bullish_divergence,
        macd_bearish_cross=macd_bearish_cross,
        macd_bullish_cross=macd_bullish_cross,
        breakout_20d=breakout_20d,
        breakdown_20d=breakdown_20d,
    )


def detect_rsi_divergence(
    prices: Sequence[float],
    rsi_values: Sequence[float | None],
    *,
    segment_days: int = 14,
    min_price_change: float = 0.01,
    min_rsi_change: float = 3.0,
) -> tuple[bool, bool]:
    """Detect a causal trailing-window RSI divergence proxy.

    The lookback is split into an older and a newer segment. We compare the
    price extrema in those two already-observed segments and the RSI recorded at
    each extremum. This is intentionally not a centered pivot detector: centered
    pivots require future bars and would introduce look-ahead bias.
    """

    resolved_segment_days = max(2, int(segment_days))
    usable = min(len(prices), len(rsi_values))
    if usable < resolved_segment_days * 2:
        return False, False

    start = usable - resolved_segment_days * 2
    midpoint = start + resolved_segment_days
    older_indices = range(start, midpoint)
    newer_indices = range(midpoint, usable)

    older_high = max(older_indices, key=lambda index: float(prices[index]))
    newer_high = max(newer_indices, key=lambda index: float(prices[index]))
    older_low = min(older_indices, key=lambda index: float(prices[index]))
    newer_low = min(newer_indices, key=lambda index: float(prices[index]))

    older_high_rsi = rsi_values[older_high]
    newer_high_rsi = rsi_values[newer_high]
    older_low_rsi = rsi_values[older_low]
    newer_low_rsi = rsi_values[newer_low]

    bearish = (
        older_high_rsi is not None
        and newer_high_rsi is not None
        and float(prices[newer_high])
        >= float(prices[older_high]) * (1.0 + min_price_change)
        and newer_high_rsi <= older_high_rsi - min_rsi_change
    )
    bullish = (
        older_low_rsi is not None
        and newer_low_rsi is not None
        and float(prices[newer_low])
        <= float(prices[older_low]) * (1.0 - min_price_change)
        and newer_low_rsi >= older_low_rsi + min_rsi_change
    )
    return bearish, bullish


def _normalize_prices(price_history: Sequence[float]) -> list[float]:
    prices: list[float] = []
    for value in price_history:
        if not isinstance(value, int | float):
            return []
        numeric = float(value)
        if not math.isfinite(numeric) or numeric <= 0.0:
            return []
        prices.append(numeric)
    return prices


def _rsi_series(prices: Sequence[float], *, period: int) -> list[float | None]:
    resolved_period = max(1, int(period))
    values: list[float | None] = [None] * len(prices)
    if len(prices) <= resolved_period:
        return values

    changes = [
        float(prices[index]) - float(prices[index - 1])
        for index in range(1, len(prices))
    ]
    gains = [max(change, 0.0) for change in changes]
    losses = [max(-change, 0.0) for change in changes]

    average_gain = sum(gains[:resolved_period]) / resolved_period
    average_loss = sum(losses[:resolved_period]) / resolved_period
    values[resolved_period] = _rsi_from_averages(average_gain, average_loss)

    for price_index in range(resolved_period + 1, len(prices)):
        change_index = price_index - 1
        average_gain = (
            average_gain * (resolved_period - 1) + gains[change_index]
        ) / resolved_period
        average_loss = (
            average_loss * (resolved_period - 1) + losses[change_index]
        ) / resolved_period
        values[price_index] = _rsi_from_averages(average_gain, average_loss)
    return values


def _rsi_from_averages(average_gain: float, average_loss: float) -> float:
    if average_gain <= 0.0 and average_loss <= 0.0:
        return 50.0
    if average_loss <= 0.0:
        return 100.0
    relative_strength = average_gain / average_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


def _rsi_slope(
    rsi_values: Sequence[float | None],
    *,
    lag: int,
) -> float | None:
    resolved_lag = max(1, int(lag))
    if len(rsi_values) <= resolved_lag:
        return None
    current = rsi_values[-1]
    previous = rsi_values[-1 - resolved_lag]
    if current is None or previous is None:
        return None
    return float(current) - float(previous)


def _momentum(prices: Sequence[float], *, lookback: int) -> float | None:
    resolved_lookback = max(1, int(lookback))
    if len(prices) <= resolved_lookback:
        return None
    return float(prices[-1]) / float(prices[-1 - resolved_lookback]) - 1.0


def _realized_volatility(
    prices: Sequence[float],
    *,
    window: int,
) -> float | None:
    resolved_window = max(2, int(window))
    if len(prices) <= resolved_window:
        return None
    trailing = prices[-(resolved_window + 1) :]
    log_returns = [
        math.log(float(trailing[index]) / float(trailing[index - 1]))
        for index in range(1, len(trailing))
    ]
    return statistics.pstdev(log_returns) * math.sqrt(365.0)


def _ema_series(values: Sequence[float], *, period: int) -> list[float]:
    resolved_period = max(1, int(period))
    alpha = 2.0 / (resolved_period + 1.0)
    ema_values = [float(values[0])]
    for value in values[1:]:
        ema_values.append(alpha * float(value) + (1.0 - alpha) * ema_values[-1])
    return ema_values


def _macd_snapshot(
    prices: Sequence[float],
) -> tuple[float | None, float | None, float | None, bool, bool]:
    # Require enough observed closes for the conventional 26-period slow EMA
    # and 9-period signal line before exposing MACD as research state.
    if len(prices) < 35:
        return None, None, None, False, False
    fast = _ema_series(prices, period=12)
    slow = _ema_series(prices, period=26)
    macd_series = [fast[index] - slow[index] for index in range(len(prices))]
    signal_series = _ema_series(macd_series, period=9)
    histogram = [
        macd_series[index] - signal_series[index] for index in range(len(prices))
    ]
    current_histogram = histogram[-1]
    previous_histogram = histogram[-2]
    return (
        macd_series[-1],
        signal_series[-1],
        current_histogram,
        previous_histogram >= 0.0 and current_histogram < 0.0,
        previous_histogram <= 0.0 and current_histogram > 0.0,
    )


def _bollinger_zscore(prices: Sequence[float], *, window: int) -> float | None:
    resolved_window = max(2, int(window))
    if len(prices) < resolved_window:
        return None
    trailing = [float(value) for value in prices[-resolved_window:]]
    mean = statistics.fmean(trailing)
    deviation = statistics.pstdev(trailing)
    if deviation <= 0.0:
        return 0.0
    return (trailing[-1] - mean) / deviation


def _channel_breaks(prices: Sequence[float], *, window: int) -> tuple[bool, bool]:
    resolved_window = max(2, int(window))
    if len(prices) <= resolved_window:
        return False, False
    previous_window = [float(value) for value in prices[-(resolved_window + 1) : -1]]
    current = float(prices[-1])
    return current > max(previous_window), current < min(previous_window)


__all__ = [
    "TECHNICAL_LOOKBACK_BARS",
    "TechnicalSignalSnapshot",
    "build_technical_signal_snapshot",
    "detect_rsi_divergence",
]

"""Deterministic synthetic market histories for the backtest engine.

Everything is driven by ``random.Random(seed)`` and plain ``+ - * /``
arithmetic: no ``exp``/``log``/``pow`` and no numpy, so one seed yields
bit-identical rows on every platform. That is what lets a golden test hash
engine output without worrying about libm differences between a laptop and CI.

Rows have exactly the shape ``BacktestDataProvider`` hands the engine, so a
synthetic history can be fed straight to ``run_compare_v3_on_data``. Synthetic
data exercises code paths and pins behavior; it is never evidence about how a
strategy performs on real markets.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
    ETH_DMA_200_FEATURE,
    ETH_USD_PRICE_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
)

Scenario = Literal["regimes", "stress"]
SCENARIOS: tuple[Scenario, ...] = ("regimes", "stress")

DMA_WINDOW = 200
# Rows before ``user_start_date`` that the engine consumes as signal warmup.
WARMUP_ROWS = 14
DEFAULT_START = date(2025, 1, 1)

_INITIAL_PRICES = {"btc": 40_000.0, "eth": 2_500.0, "spy": 450.0}
_MIN_DAILY_RETURN = -0.5
_ETH_BETA = 1.1
_ETH_IDIOSYNCRATIC_VOLATILITY = 0.012
_MOMENTUM_WINDOW = 30
_FGI_BOUNDS = (2.0, 98.0)
_CRYPTO_FGI_SENSITIVITY = 120.0
_MACRO_FGI_SENSITIVITY = 400.0
_FGI_NOISE = 3.0
_WEEKDAYS = 5


@dataclass(frozen=True)
class _Regime:
    drift: float
    volatility: float
    min_days: int
    max_days: int


_BTC_REGIMES: tuple[_Regime, ...] = (
    _Regime(drift=0.0035, volatility=0.022, min_days=40, max_days=110),
    _Regime(drift=0.0, volatility=0.028, min_days=30, max_days=80),
    _Regime(drift=-0.004, volatility=0.030, min_days=30, max_days=90),
)
_ETH_ALPHA_REGIMES: tuple[_Regime, ...] = (
    _Regime(drift=0.003, volatility=0.0, min_days=40, max_days=120),
    _Regime(drift=0.0, volatility=0.0, min_days=40, max_days=120),
    _Regime(drift=-0.003, volatility=0.0, min_days=40, max_days=120),
)
_SPY_REGIMES: tuple[_Regime, ...] = (
    _Regime(drift=0.0006, volatility=0.008, min_days=60, max_days=160),
    _Regime(drift=0.0, volatility=0.010, min_days=30, max_days=90),
    _Regime(drift=-0.0010, volatility=0.014, min_days=30, max_days=80),
)


@dataclass(frozen=True)
class _Overlay:
    """Extra daily return added over user days ``[start, end)`` in stress runs."""

    asset: Literal["btc", "eth", "spy"]
    start: int
    end: int
    extra_return: float


# Scripted shocks. Each is a blow-off or collapse long enough to push an asset
# well away from its 200-day average, which is what trims, crosses, FGI
# downshifts and ETH/BTC ratio deviations need in order to fire.
_STRESS_OVERLAYS: tuple[_Overlay, ...] = (
    _Overlay("btc", 60, 90, 0.011),
    _Overlay("btc", 90, 112, -0.022),
    _Overlay("eth", 150, 235, 0.008),
    _Overlay("eth", 285, 360, -0.008),
    _Overlay("spy", 120, 150, 0.004),
    _Overlay("spy", 150, 175, -0.008),
)
# Stress extras on the derived features rather than on prices.
_STRESS_DMA_TOUCH_DAY = 45
_STRESS_ETH_DMA_GAP = (20, 28)


@dataclass(frozen=True)
class SyntheticMarket:
    """A synthetic history in engine-input shape plus the window's first day."""

    seed: int
    scenario: Scenario
    prices: list[dict[str, Any]]
    sentiments: dict[date, dict[str, Any]]
    user_start_date: date


def synthetic_market(
    *,
    seed: int,
    days: int = 400,
    scenario: Scenario = "regimes",
    start: date = DEFAULT_START,
) -> SyntheticMarket:
    """Build ``WARMUP_ROWS + days`` rows of BTC/ETH/SPY history.

    ``start`` is the first user day; the warmup rows precede it. The 200-day
    averages are computed over an extra pre-roll that is not returned, so every
    returned row carries valid DMAs.
    """
    if days < 1:
        raise ValueError("days must be >= 1")
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario '{scenario}'")
    rng = random.Random(seed)
    pre_roll = DMA_WINDOW
    total = pre_roll + WARMUP_ROWS + days
    first_row_date = start - timedelta(days=WARMUP_ROWS + pre_roll)
    dates = [first_row_date + timedelta(days=offset) for offset in range(total)]
    first_user_row = pre_roll + WARMUP_ROWS

    btc_returns = _btc_returns(rng, total)
    eth_returns = _eth_returns(rng, btc_returns, total)
    spy_returns = _spy_returns(rng, dates)
    if scenario == "stress":
        overlays = {
            "btc": btc_returns,
            "eth": eth_returns,
            "spy": spy_returns,
        }
        _apply_overlays(overlays, first_user_row=first_user_row, dates=dates)

    btc = _price_path(_INITIAL_PRICES["btc"], btc_returns)
    eth = _price_path(_INITIAL_PRICES["eth"], eth_returns)
    spy = _price_path(_INITIAL_PRICES["spy"], spy_returns)
    ratio = [
        eth_price / btc_price for eth_price, btc_price in zip(eth, btc, strict=True)
    ]
    btc_dma = _rolling_mean(btc, DMA_WINDOW)
    eth_dma = _rolling_mean(eth, DMA_WINDOW)
    spy_dma = _rolling_mean(spy, DMA_WINDOW)
    ratio_dma = _rolling_mean(ratio, DMA_WINDOW)
    crypto_fgi = _fgi_values(rng, btc, sensitivity=_CRYPTO_FGI_SENSITIVITY)
    macro_fgi = _fgi_values(rng, spy, sensitivity=_MACRO_FGI_SENSITIVITY)

    prices: list[dict[str, Any]] = []
    sentiments: dict[date, dict[str, Any]] = {}
    for index in range(pre_roll, total):
        row_date = dates[index]
        extra_data: dict[str, Any] = {
            DMA_200_FEATURE: btc_dma[index],
            ETH_USD_PRICE_FEATURE: eth[index],
            ETH_DMA_200_FEATURE: eth_dma[index],
            ETH_BTC_RATIO_FEATURE: ratio[index],
            ETH_BTC_RATIO_DMA_200_FEATURE: ratio_dma[index],
            ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE: ratio[index] > ratio_dma[index],
            SPY_PRICE_FEATURE: spy[index],
            SPY_DMA_200_FEATURE: spy_dma[index],
            MACRO_FEAR_GREED_FEATURE: _macro_snapshot(row_date, score=macro_fgi[index]),
        }
        if scenario == "stress":
            _apply_stress_features(
                extra_data,
                btc_price=btc[index],
                user_day=index - first_user_row,
            )
        prices.append(
            {
                "date": row_date,
                "price": btc[index],
                "prices": {"btc": btc[index], "eth": eth[index], "spy": spy[index]},
                "extra_data": extra_data,
            }
        )
        sentiments[row_date] = _sentiment_entry(row_date, value=crypto_fgi[index])
    return SyntheticMarket(
        seed=seed,
        scenario=scenario,
        prices=prices,
        sentiments=sentiments,
        user_start_date=start,
    )


def _noise(rng: random.Random) -> float:
    """Approximately standard normal: 12 uniforms sum to mean 6, variance 1."""
    return sum(rng.random() for _ in range(12)) - 6.0


def _schedule(
    rng: random.Random,
    total: int,
    regimes: Sequence[_Regime],
) -> list[_Regime]:
    """Concatenate randomly chosen regimes until ``total`` days are covered."""
    daily: list[_Regime] = []
    while len(daily) < total:
        regime = regimes[rng.randrange(len(regimes))]
        length = rng.randint(regime.min_days, regime.max_days)
        daily.extend([regime] * length)
    return daily[:total]


def _btc_returns(rng: random.Random, total: int) -> list[float]:
    return [
        max(regime.drift + regime.volatility * _noise(rng), _MIN_DAILY_RETURN)
        for regime in _schedule(rng, total, _BTC_REGIMES)
    ]


def _eth_returns(
    rng: random.Random,
    btc_returns: Sequence[float],
    total: int,
) -> list[float]:
    alpha = _schedule(rng, total, _ETH_ALPHA_REGIMES)
    return [
        max(
            _ETH_BETA * btc_return
            + regime.drift
            + _ETH_IDIOSYNCRATIC_VOLATILITY * _noise(rng),
            _MIN_DAILY_RETURN,
        )
        for btc_return, regime in zip(btc_returns, alpha, strict=True)
    ]


def _spy_returns(rng: random.Random, dates: Sequence[date]) -> list[float]:
    """SPY only moves on weekdays; weekends carry the previous close."""
    schedule = _schedule(rng, len(dates), _SPY_REGIMES)
    returns: list[float] = []
    for row_date, regime in zip(dates, schedule, strict=True):
        if row_date.weekday() >= _WEEKDAYS:
            returns.append(0.0)
            continue
        returns.append(
            max(regime.drift + regime.volatility * _noise(rng), _MIN_DAILY_RETURN)
        )
    return returns


def _apply_overlays(
    returns_by_asset: dict[str, list[float]],
    *,
    first_user_row: int,
    dates: Sequence[date],
) -> None:
    for overlay in _STRESS_OVERLAYS:
        series = returns_by_asset[overlay.asset]
        for user_day in range(overlay.start, overlay.end):
            row = first_user_row + user_day
            if row >= len(series):
                break
            if overlay.asset == "spy" and dates[row].weekday() >= _WEEKDAYS:
                continue
            series[row] = max(series[row] + overlay.extra_return, _MIN_DAILY_RETURN)


def _price_path(initial: float, returns: Sequence[float]) -> list[float]:
    prices: list[float] = []
    price = initial
    for daily_return in returns:
        price *= 1.0 + daily_return
        prices.append(price)
    return prices


def _rolling_mean(values: Sequence[float], window: int) -> list[float]:
    means: list[float] = []
    running = 0.0
    for index, value in enumerate(values):
        running += value
        if index >= window:
            running -= values[index - window]
        means.append(running / min(index + 1, window))
    return means


def _fgi_values(
    rng: random.Random,
    prices: Sequence[float],
    *,
    sensitivity: float,
) -> list[float]:
    low, high = _FGI_BOUNDS
    values: list[float] = []
    for index, price in enumerate(prices):
        reference = prices[max(index - _MOMENTUM_WINDOW, 0)]
        momentum = price / reference - 1.0
        raw = 50.0 + sensitivity * momentum + _FGI_NOISE * _noise(rng)
        values.append(min(max(raw, low), high))
    return values


def _fgi_label(value: float) -> str:
    if value < 25.0:
        return "extreme_fear"
    if value < 47.0:
        return "fear"
    if value <= 53.0:
        return "neutral"
    if value < 75.0:
        return "greed"
    return "extreme_greed"


def _sentiment_entry(row_date: date, *, value: float) -> dict[str, Any]:
    score = int(round(value))
    return {
        "date": row_date,
        "value": score,
        "label": _fgi_label(float(score)),
        "timestamp": datetime(
            row_date.year, row_date.month, row_date.day, 12, 0, tzinfo=UTC
        ),
    }


def _macro_snapshot(row_date: date, *, score: float) -> dict[str, Any]:
    rounded = round(score, 1)
    return {
        "score": rounded,
        "label": _fgi_label(rounded),
        "source": "synthetic",
        "updated_at": row_date.isoformat(),
    }


def _apply_stress_features(
    extra_data: dict[str, Any],
    *,
    btc_price: float,
    user_day: int,
) -> None:
    if user_day == _STRESS_DMA_TOUCH_DAY:
        extra_data[DMA_200_FEATURE] = btc_price
    gap_start, gap_end = _STRESS_ETH_DMA_GAP
    if gap_start <= user_day < gap_end:
        del extra_data[ETH_DMA_200_FEATURE]


__all__ = [
    "DEFAULT_START",
    "DMA_WINDOW",
    "SCENARIOS",
    "Scenario",
    "SyntheticMarket",
    "WARMUP_ROWS",
    "synthetic_market",
]

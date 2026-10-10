"""Synthetic market histories shaped around each hierarchical validation event.

Each history is a 46-day flat market (everything 10% above its DMA, neutral
sentiment) with the few days around the event bent to produce it: a cross, a
ratio move, a fear spike. They are small enough to read, and shared by the
validation test, the live-versus-model parity tests and the strategy lab, which
runs a candidate spec through the same events before it may be promoted.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from src.services.backtesting.validation.event_runner import ValidationEvent


def strategy_timeline(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    """One strategy's days of a compare response, shaped for ``evaluate_event``."""
    return [
        {
            "date": point["market"]["date"],
            "market": point["market"],
            **point["strategies"][key],
        }
        for point in payload["timeline"]
    ]


def synthetic_event_history(
    event: ValidationEvent,
) -> tuple[list[dict[str, Any]], dict[date, dict[str, Any]], date, date]:
    event_date = date.fromisoformat(event.event_date)
    start = event_date - timedelta(days=45)
    end = event_date
    dates = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    rows = {
        current: {
            "date": current,
            "price": 110.0,
            "prices": {"btc": 110.0, "eth": 110.0, "spy": 110.0},
            "extra_data": _extra_data(
                btc_dma=100.0,
                eth_price=110.0,
                eth_dma=100.0,
                spy_price=110.0,
                spy_dma=100.0,
                ratio=1.0,
                ratio_dma=1.0,
                macro_label="neutral",
            ),
        }
        for current in dates
    }
    sentiments = {
        current: {"label": "neutral", "value": 50, "timestamp": current.isoformat()}
        for current in dates
    }
    _shape_event_market(event=event, rows=rows, dates=dates)
    return [rows[current] for current in dates], sentiments, start, end


def _shape_event_market(
    *,
    event: ValidationEvent,
    rows: dict[date, dict[str, Any]],
    dates: list[date],
) -> None:
    event_date = date.fromisoformat(event.event_date)
    previous_date = event_date - timedelta(days=1)
    if event.event_type == "crypto_cross_down":
        _shape_crypto_cross_down(rows, event_date, event.reference_asset or "BTC")
    elif event.event_type == "crypto_cross_up":
        _shape_crypto_cross_up(rows, dates, event_date, event.reference_asset or "BTC")
    elif event.event_type == "spy_cross_down":
        _set_spy_zone(rows, previous_date, above=True)
        _set_spy_zone(rows, event_date, above=False)
    elif event.event_type == "spy_cross_up":
        _shape_spy_cross_up(rows, dates, event_date)
    elif event.event_type == "eth_btc_ratio_cross_up":
        _shape_ratio_cross(rows, dates, event_date, previous_ratio=0.8, event_ratio=1.2)
    elif event.event_type == "eth_btc_ratio_cross_down":
        _shape_ratio_cross(rows, dates, event_date, previous_ratio=1.2, event_ratio=0.8)
    elif event.id == "cooldown_period_2025_03_24":
        _shape_cooldown_event(rows, dates, event_date)


def _shape_crypto_cross_down(
    rows: dict[date, dict[str, Any]],
    event_date: date,
    symbol: str,
) -> None:
    previous_date = event_date - timedelta(days=1)
    if symbol.upper() == "ETH":
        _set_ratio(rows, previous_date, ratio=0.8)
        _set_ratio(rows, event_date, ratio=0.8)
    _set_crypto_zone(rows, previous_date, symbol, above=True)
    _set_crypto_zone(rows, event_date, symbol, above=False)


def _shape_crypto_cross_up(
    rows: dict[date, dict[str, Any]],
    dates: list[date],
    event_date: date,
    symbol: str,
) -> None:
    for current in dates:
        _set_crypto_zone(rows, current, "BTC", above=False)
        _set_crypto_zone(rows, current, "ETH", above=False)
        _set_spy_zone(rows, current, above=False)
    if symbol.upper() == "ETH":
        _set_ratio(rows, event_date - timedelta(days=1), ratio=0.8)
        _set_ratio(rows, event_date, ratio=0.8)
    _set_crypto_zone(rows, event_date, symbol, above=True)


def _shape_spy_cross_up(
    rows: dict[date, dict[str, Any]],
    dates: list[date],
    event_date: date,
) -> None:
    for current in dates:
        _set_crypto_zone(rows, current, "BTC", above=False)
        _set_crypto_zone(rows, current, "ETH", above=False)
        _set_spy_zone(rows, current, above=False)
    _set_spy_zone(rows, event_date, above=True)


def _shape_ratio_cross(
    rows: dict[date, dict[str, Any]],
    dates: list[date],
    event_date: date,
    *,
    previous_ratio: float,
    event_ratio: float,
) -> None:
    for current in dates:
        _set_ratio(rows, current, ratio=previous_ratio)
    _set_ratio(rows, event_date, ratio=event_ratio)


def _shape_cooldown_event(
    rows: dict[date, dict[str, Any]],
    dates: list[date],
    event_date: date,
) -> None:
    cross_down_date = event_date - timedelta(days=10)
    for current in dates:
        below = cross_down_date <= current < event_date
        _set_crypto_zone(rows, current, "BTC", above=not below)
        _set_crypto_zone(rows, current, "ETH", above=not below)
        _set_spy_zone(rows, current, above=not below)


def _extra_data(
    *,
    btc_dma: float,
    eth_price: float,
    eth_dma: float,
    spy_price: float,
    spy_dma: float,
    ratio: float,
    ratio_dma: float,
    macro_label: str,
) -> dict[str, Any]:
    return {
        "dma_200": btc_dma,
        "eth_price_usd": eth_price,
        "eth_dma_200": eth_dma,
        "spy_price": spy_price,
        "spy_dma_200": spy_dma,
        "eth_btc_ratio": ratio,
        "eth_btc_ratio_dma_200": ratio_dma,
        "macro_fear_greed": _macro(macro_label),
    }


def _macro(label: str) -> dict[str, Any]:
    score = {"extreme_fear": 10, "fear": 25, "neutral": 50, "greed": 75}.get(label, 50)
    return {
        "score": score,
        "label": label,
        "source": "synthetic_validation_fixture",
        "updated_at": "2025-01-01T00:00:00Z",
        "raw_rating": label,
    }


def _set_crypto_zone(
    rows: dict[date, dict[str, Any]],
    target_date: date,
    symbol: str,
    *,
    above: bool,
) -> None:
    price = 110.0 if above else 90.0
    if symbol.upper() == "ETH":
        rows[target_date]["extra_data"]["eth_price_usd"] = price
        rows[target_date]["prices"]["eth"] = price
    else:
        rows[target_date]["price"] = price
        rows[target_date]["prices"]["btc"] = price


def _set_spy_zone(
    rows: dict[date, dict[str, Any]],
    target_date: date,
    *,
    above: bool,
) -> None:
    rows[target_date]["extra_data"]["spy_price"] = 110.0 if above else 90.0
    rows[target_date]["prices"]["spy"] = 110.0 if above else 90.0


def _set_ratio(
    rows: dict[date, dict[str, Any]],
    target_date: date,
    *,
    ratio: float,
) -> None:
    rows[target_date]["price"] = 100.0
    rows[target_date]["prices"]["btc"] = 100.0
    rows[target_date]["prices"]["eth"] = 100.0 * ratio
    rows[target_date]["extra_data"]["eth_price_usd"] = 100.0 * ratio
    rows[target_date]["extra_data"]["eth_btc_ratio"] = ratio
    rows[target_date]["extra_data"]["eth_btc_ratio_dma_200"] = 1.0

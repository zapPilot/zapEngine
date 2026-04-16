from __future__ import annotations

from datetime import date, timedelta

from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3

DEFAULT_START = date(2025, 1, 1)
DEFAULT_END = date(2025, 1, 5)


def dma_public_params(
    *,
    cross_cooldown_days: int = 30,
    cross_on_touch: bool = True,
) -> dict[str, object]:
    return {
        "signal": {
            "cross_cooldown_days": cross_cooldown_days,
            "cross_on_touch": cross_on_touch,
        }
    }


def price_row(
    snapshot_date: date,
    *,
    price: float = 100.0,
    dma_200: float | None = None,
) -> dict[str, object]:
    row: dict[str, object] = {"date": snapshot_date, "price": price}
    if dma_200 is not None:
        row["extra_data"] = {"dma_200": dma_200}
    return row


def price_series(
    start: date = DEFAULT_START,
    days: int = 5,
    *,
    price_start: float = 100.0,
    dma_start: float = 95.0,
    dma_offsets: set[int] | None = None,
) -> list[dict[str, object]]:
    usable_dma_offsets = dma_offsets if dma_offsets is not None else set(range(days))
    return [
        price_row(
            start + timedelta(days=offset),
            price=price_start + offset,
            dma_200=dma_start + offset if offset in usable_dma_offsets else None,
        )
        for offset in range(days)
    ]


def sentiment_map(
    *,
    start: date = DEFAULT_START,
    days: int = 5,
    start_offset: int = 0,
    label: str = "neutral",
    value: int = 50,
) -> dict[date, dict[str, object]]:
    return {
        start + timedelta(days=offset): {
            "label": label,
            "value": value + offset,
        }
        for offset in range(start_offset, days)
    }


def compare_request(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    days: int | None = None,
    token_symbol: str = "BTC",
    total_capital: float = 10_000.0,
    configs: list[BacktestCompareConfigV3] | None = None,
) -> BacktestCompareRequestV3:
    payload: dict[str, object] = {
        "token_symbol": token_symbol,
        "total_capital": total_capital,
        "configs": configs
        or [
            BacktestCompareConfigV3(
                config_id="dma_runtime",
                strategy_id="dma_gated_fgi",
                params=dma_public_params(),
            )
        ],
    }
    if start_date is None and end_date is None and days is None:
        payload["start_date"] = DEFAULT_START
        payload["end_date"] = DEFAULT_END
    elif start_date is not None:
        payload["start_date"] = start_date
    if end_date is not None:
        payload["end_date"] = end_date
    if days is not None:
        payload["days"] = days
    return BacktestCompareRequestV3(**payload)

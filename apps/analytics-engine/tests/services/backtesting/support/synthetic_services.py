"""Fake market services that serve one synthetic market to BacktestingService.

They mimic only the calls the backtest data layer makes, so the whole
fetch -> window -> compare path runs without a database.
"""

from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace
from typing import Any

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
    ETH_DMA_200_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.lab.synthetic import SyntheticMarket
from src.services.strategy.backtesting_service import BacktestingService


def _as_datetime(value: datetime | str) -> datetime:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def _in_range(row_date: date, start: date | None, end: date | None) -> bool:
    return (start is None or row_date >= start) and (end is None or row_date <= end)


class SyntheticMarketServices:
    """Token, stock, macro-FGI and sentiment fakes over a ``SyntheticMarket``."""

    def __init__(self, market: SyntheticMarket) -> None:
        self.market = market
        self.token_price_service = SimpleNamespace(
            get_price_history=self._get_price_history,
            get_dma_history=self._get_dma_history,
            get_pair_ratio_dma_history=self._get_pair_ratio_dma_history,
        )
        self.stock_price_service = SimpleNamespace(
            get_dma_history=self._get_stock_dma_history
        )
        self.macro_fear_greed_service = SimpleNamespace(
            get_daily_macro_fear_greed=self._get_macro_fear_greed
        )
        self.sentiment_service = SimpleNamespace(
            get_sentiment_history=self._get_sentiment_history
        )

    def build_backtesting_service(self) -> BacktestingService:
        return BacktestingService(
            token_price_service=self.token_price_service,  # type: ignore[arg-type]
            sentiment_service=self.sentiment_service,  # type: ignore[arg-type]
            stock_price_service=self.stock_price_service,  # type: ignore[arg-type]
            macro_fear_greed_service=self.macro_fear_greed_service,  # type: ignore[arg-type]
        )

    def _get_price_history(
        self,
        *,
        days: int,
        token_symbol: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[SimpleNamespace]:
        del days
        key = token_symbol.lower()
        return [
            SimpleNamespace(date=row["date"].isoformat(), price_usd=row["prices"][key])
            for row in self.market.prices
            if _in_range(row["date"], start_date, end_date)
        ]

    def _get_dma_history(
        self,
        *,
        start_date: date | None,
        end_date: date | None,
        token_symbol: str,
    ) -> dict[date, float]:
        feature = DMA_200_FEATURE if token_symbol == "BTC" else ETH_DMA_200_FEATURE
        return {
            row["date"]: row["extra_data"][feature]
            for row in self.market.prices
            if _in_range(row["date"], start_date, end_date)
            and feature in row["extra_data"]
        }

    def _get_pair_ratio_dma_history(
        self,
        *,
        start_date: date | None,
        end_date: date | None,
        base_token_symbol: str,
        quote_token_symbol: str,
    ) -> dict[date, dict[str, Any]]:
        assert (base_token_symbol, quote_token_symbol) == ("ETH", "BTC")
        return {
            row["date"]: {
                "ratio": row["extra_data"][ETH_BTC_RATIO_FEATURE],
                "dma_200": row["extra_data"][ETH_BTC_RATIO_DMA_200_FEATURE],
                "is_above_dma": row["extra_data"].get(
                    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
                    row["extra_data"][ETH_BTC_RATIO_FEATURE]
                    > row["extra_data"][ETH_BTC_RATIO_DMA_200_FEATURE],
                ),
            }
            for row in self.market.prices
            if _in_range(row["date"], start_date, end_date)
        }

    def _get_stock_dma_history(
        self,
        *,
        start_date: date | None,
        end_date: date | None,
        symbol: str,
    ) -> dict[date, dict[str, float]]:
        assert symbol == "SPY"
        return {
            row["date"]: {
                "price_usd": row["prices"]["spy"],
                "dma_200": row["extra_data"][SPY_DMA_200_FEATURE],
            }
            for row in self.market.prices
            if _in_range(row["date"], start_date, end_date)
        }

    def _get_macro_fear_greed(
        self,
        *,
        start_date: date | None,
        end_date: date | None,
    ) -> dict[date, dict[str, Any]]:
        return {
            row["date"]: row["extra_data"][MACRO_FEAR_GREED_FEATURE]
            for row in self.market.prices
            if _in_range(row["date"], start_date, end_date)
        }

    def _get_sentiment_history(
        self,
        hours: int,
        *,
        start_time: date | None = None,
        end_time: date | None = None,
    ) -> list[SimpleNamespace]:
        del hours
        return [
            SimpleNamespace(
                value=entry["value"],
                status=str(entry["label"]).replace("_", " ").title(),
                # Validation-event fixtures carry ISO strings, generated markets
                # carry datetimes.
                timestamp=_as_datetime(entry["timestamp"]),
            )
            for entry_date, entry in self.market.sentiments.items()
            if _in_range(entry_date, start_time, end_time)
        ]

"""
Market Dashboard Service

Assembles the self-describing market dashboard payload: a `series` registry
plus a chronological list of `MarketSnapshot`s whose `values` map carries a
uniform `SeriesPoint` keyed by the same series id used in the registry.

Adding a new data source: register a descriptor in `_SERIES_REGISTRY`, fetch
its data, and populate `values[<id>]` per snapshot. The router and frontend
need no shape changes.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from src.models.market_dashboard import (
    DashboardMeta,
    Indicator,
    MarketDashboardResponse,
    MarketSnapshot,
    SeriesDescriptor,
    SeriesFrequency,
    SeriesKind,
    SeriesPoint,
)
from src.models.regime_tracking import RegimeId

logger = logging.getLogger(__name__)


# Static series registry. Adding a new series here + populating its values
# in `get_market_dashboard` is the only change needed to surface a new
# data source on the dashboard.
_SERIES_REGISTRY: dict[str, SeriesDescriptor] = {
    "btc": SeriesDescriptor(
        kind=SeriesKind.asset,
        unit="usd",
        label="BTC",
        frequency=SeriesFrequency.daily,
        color_hint="#FFFFFF",
        scale=None,
    ),
    "spy": SeriesDescriptor(
        kind=SeriesKind.asset,
        unit="usd",
        label="S&P 500 (SPY)",
        frequency=SeriesFrequency.weekdays,
        color_hint="#3B82F6",
        scale=None,
    ),
    "eth_btc": SeriesDescriptor(
        kind=SeriesKind.ratio,
        unit="ratio",
        label="ETH/BTC",
        frequency=SeriesFrequency.daily,
        color_hint="#34D399",
        scale=None,
    ),
    "fgi": SeriesDescriptor(
        kind=SeriesKind.gauge,
        unit="score",
        label="Fear & Greed",
        frequency=SeriesFrequency.daily,
        color_hint="#10B981",
        scale=(0.0, 100.0),
    ),
    "macro_fear_greed": SeriesDescriptor(
        kind=SeriesKind.gauge,
        unit="score",
        label="Macro Fear & Greed",
        frequency=SeriesFrequency.daily,
        color_hint="#14B8A6",
        scale=(0.0, 100.0),
    ),
}

_PRIMARY_SERIES = "btc"


class MarketDashboardService:
    """Service for aggregating market data for dashboard visualization."""

    def __init__(
        self,
        token_price_service: Any,
        sentiment_service: Any,
        stock_price_service: Any,
        macro_fear_greed_service: Any | None = None,
    ) -> None:
        """
        Args:
            token_price_service: Cryptocurrency price data (BTC and pair ratios)
            sentiment_service: Fear & Greed Index sentiment
            stock_price_service: S&P 500 (SPY) price data
            macro_fear_greed_service: CNN macro Fear & Greed data
        """
        self.token_price_service = token_price_service
        self.sentiment_service = sentiment_service
        self.stock_price_service = stock_price_service
        self.macro_fear_greed_service = macro_fear_greed_service

    @staticmethod
    def _map_sentiment_to_regime(value: int) -> RegimeId:
        """Map sentiment value (0-100) to market regime."""
        if value <= 25:
            return RegimeId.ef
        if value <= 45:
            return RegimeId.f
        if value <= 54:
            return RegimeId.n
        if value <= 75:
            return RegimeId.g
        return RegimeId.eg

    def get_market_dashboard(self, days: int = 365) -> MarketDashboardResponse:
        """Retrieve and combine market data for the specified period."""
        end_date = datetime.now(UTC).date()
        start_date = end_date - timedelta(days=days)

        logger.info(f"Building market dashboard from {start_date} to {end_date}")

        btc_prices = self.token_price_service.get_price_history(
            days=days, token_symbol="BTC"
        )
        btc_dma_map = self.token_price_service.get_dma_history(
            start_date=start_date, end_date=end_date, token_symbol="BTC"
        )
        eth_btc_ratio_map = self.token_price_service.get_pair_ratio_dma_history(
            start_date=start_date,
            end_date=end_date,
            base_token_symbol="ETH",
            quote_token_symbol="BTC",
        )
        sentiment_rows = self.sentiment_service.get_daily_sentiment_aggregates(
            start_date=start_date, end_date=end_date
        )
        spy_dma_rows = self.stock_price_service.get_dma_history(
            start_date=start_date, end_date=end_date
        )
        macro_fear_greed_map = self._get_macro_fear_greed_history(
            start_date=start_date,
            end_date=end_date,
        )

        sentiment_map: dict[date, float] = {}
        for row in sentiment_rows:
            s_date = row["snapshot_date"]
            if isinstance(s_date, str):
                s_date = date.fromisoformat(s_date)
            sentiment_map[s_date] = float(row["avg_sentiment"])

        # SPY trades weekdays only; BTC is daily. Forward-fill SPY across the
        # BTC timeline so the merged series stays aligned without recharts
        # having to span gaps with `connectNulls`.
        price_dates: list[date] = []
        for p in btc_prices:
            p_date = date.fromisoformat(p.date) if isinstance(p.date, str) else p.date
            price_dates.append(p_date)

        spy_filled: dict[date, dict[str, Any]] = dict(spy_dma_rows)
        if spy_dma_rows:
            last: dict[str, Any] | None = None
            for d in sorted(price_dates):
                if d in spy_filled:
                    last = spy_filled[d]
                elif last is not None:
                    spy_filled[d] = last

        macro_fear_greed_filled = self._forward_fill_macro_fear_greed(
            macro_fear_greed_map,
            price_dates,
        )

        snapshots: list[MarketSnapshot] = []
        for p, p_date in zip(btc_prices, price_dates, strict=True):
            values: dict[str, SeriesPoint] = {}

            btc_indicators: dict[str, Indicator] = {}
            btc_dma = btc_dma_map.get(p_date)
            if btc_dma is not None:
                btc_indicators["dma_200"] = Indicator(
                    value=btc_dma, is_above=p.price_usd > btc_dma
                )
            values["btc"] = SeriesPoint(value=p.price_usd, indicators=btc_indicators)

            spy_point = spy_filled.get(p_date)
            if spy_point is not None:
                spy_indicators: dict[str, Indicator] = {}
                spy_dma = spy_point.get("dma_200")
                if spy_dma is not None:
                    spy_indicators["dma_200"] = Indicator(
                        value=float(spy_dma),
                        is_above=bool(spy_point.get("is_above_dma"))
                        if spy_point.get("is_above_dma") is not None
                        else None,
                    )
                values["spy"] = SeriesPoint(
                    value=float(spy_point["price_usd"]),
                    indicators=spy_indicators,
                )

            ratio_point = eth_btc_ratio_map.get(p_date)
            if ratio_point is not None:
                ratio_indicators: dict[str, Indicator] = {}
                ratio_dma = ratio_point.get("dma_200")
                if ratio_dma is not None:
                    ratio_indicators["dma_200"] = Indicator(
                        value=float(ratio_dma),
                        is_above=bool(ratio_point.get("is_above_dma"))
                        if ratio_point.get("is_above_dma") is not None
                        else None,
                    )
                values["eth_btc"] = SeriesPoint(
                    value=float(ratio_point["ratio"]),
                    indicators=ratio_indicators,
                )

            sentiment_val = sentiment_map.get(p_date)
            if sentiment_val is not None:
                sentiment_int = int(round(sentiment_val))
                regime = self._map_sentiment_to_regime(sentiment_int)
                values["fgi"] = SeriesPoint(
                    value=float(sentiment_int),
                    tags={"regime": regime.value},
                )

            macro_fear_greed = macro_fear_greed_filled.get(p_date)
            if macro_fear_greed is not None:
                label = str(macro_fear_greed.get("label", ""))
                raw_rating = macro_fear_greed.get("raw_rating")
                tags = {
                    "label": str(raw_rating) if raw_rating is not None else label,
                    "regime": label,
                    "source": str(macro_fear_greed.get("source", "")),
                }
                values["macro_fear_greed"] = SeriesPoint(
                    value=float(macro_fear_greed["score"]),
                    tags=tags,
                )

            snapshots.append(MarketSnapshot(snapshot_date=p_date, values=values))

        return MarketDashboardResponse(
            series=_SERIES_REGISTRY,
            snapshots=snapshots,
            meta=DashboardMeta(
                primary_series=_PRIMARY_SERIES,
                days_requested=days,
                count=len(snapshots),
                timestamp=datetime.now(UTC),
            ),
        )

    def _get_macro_fear_greed_history(
        self,
        *,
        start_date: date,
        end_date: date,
    ) -> dict[date, dict[str, Any]]:
        if self.macro_fear_greed_service is None:
            return {}
        try:
            return dict(
                self.macro_fear_greed_service.get_daily_macro_fear_greed(
                    start_date=start_date,
                    end_date=end_date,
                )
            )
        except Exception as error:
            logger.warning("Failed to fetch macro Fear & Greed data: %s", error)
            return {}

    @staticmethod
    def _forward_fill_macro_fear_greed(
        sparse: dict[date, dict[str, Any]],
        price_dates: list[date],
    ) -> dict[date, dict[str, Any]]:
        if not sparse or not price_dates:
            return {}

        sorted_macro_dates = sorted(sparse)
        filled: dict[date, dict[str, Any]] = {}
        last_value: dict[str, Any] | None = None
        macro_idx = 0

        for current_date in sorted(price_dates):
            while (
                macro_idx < len(sorted_macro_dates)
                and sorted_macro_dates[macro_idx] <= current_date
            ):
                last_value = sparse[sorted_macro_dates[macro_idx]]
                macro_idx += 1
            if last_value is not None:
                filled[current_date] = last_value

        return filled

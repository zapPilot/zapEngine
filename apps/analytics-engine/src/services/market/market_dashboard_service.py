"""
Market Dashboard Service

Aggregates BTC price, 200 DMA, and Fear & Greed Index sentiment data
into a unified chronological series for market analysis.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from src.models.market_dashboard import (
    EthBtcRelativeStrengthPoint,
    MarketDashboardPoint,
    MarketDashboardResponse,
    Sp500Point,
)
from src.models.regime_tracking import RegimeId

logger = logging.getLogger(__name__)


class MarketDashboardService:
    """
    Service for aggregating market data for dashboard visualization.
    """

    def __init__(
        self,
        token_price_service: Any,
        sentiment_service: Any,
        stock_price_service: Any | None = None,
    ) -> None:
        """
        Initialize with required data services.

        Args:
            token_price_service: Service for cryptocurrency price data (BTC, etc.)
            sentiment_service: Service for Fear & Greed Index sentiment
            stock_price_service: Service for S&P500 (SPY) price data (optional)
        """
        self.token_price_service = token_price_service
        self.sentiment_service = sentiment_service
        self.stock_price_service = stock_price_service

    @staticmethod
    def _map_sentiment_to_regime(value: int) -> RegimeId:
        """
        Map sentiment value (0-100) to market regime.
        """
        if value <= 25:
            return RegimeId.ef
        if value <= 45:
            return RegimeId.f
        if value <= 54:
            return RegimeId.n
        if value <= 75:
            return RegimeId.g
        return RegimeId.eg

    def get_market_dashboard(
        self, days: int = 365, token_symbol: str = "BTC"
    ) -> MarketDashboardResponse:
        """
        Retrieve and combine market data for the specified period.
        """
        end_date = datetime.now(UTC).date()
        start_date = end_date - timedelta(days=days)

        logger.info(
            f"Building market dashboard for {token_symbol} from {start_date} to {end_date}"
        )

        # 1. Fetch data in parallel (conceptually)
        prices = self.token_price_service.get_price_history(
            days=days, token_symbol=token_symbol
        )
        dma_map = self.token_price_service.get_dma_history(
            start_date=start_date, end_date=end_date, token_symbol=token_symbol
        )
        ratio_map = self.token_price_service.get_pair_ratio_dma_history(
            start_date=start_date,
            end_date=end_date,
            base_token_symbol="ETH",
            quote_token_symbol="BTC",
        )
        sentiment_rows = self.sentiment_service.get_daily_sentiment_aggregates(
            start_date=start_date, end_date=end_date
        )

        # 1b. Fetch SPY data if stock_price_service is available
        sp500_map: dict[date, Sp500Point] = {}
        if self.stock_price_service is not None:
            sp500_rows = self.stock_price_service.get_dma_history(
                start_date=start_date, end_date=end_date
            )
            for s_date, sp500_point in sp500_rows.items():
                sp500_map[s_date] = Sp500Point(
                    price_usd=sp500_point["price_usd"],
                    dma_200=sp500_point["dma_200"],
                    is_above_dma=sp500_point["is_above_dma"],
                )

            # 1c. Forward-fill SPY data for dates without market data (weekends/holidays)
            price_dates = set()
            for p in prices:
                p_date = (
                    date.fromisoformat(p.date) if isinstance(p.date, str) else p.date
                )
                price_dates.add(p_date)

            if sp500_map:
                sorted_dates = sorted(price_dates)
                last_sp500: Sp500Point | None = None
                for pd in sorted_dates:
                    if pd in sp500_map:
                        last_sp500 = sp500_map[pd]
                    elif last_sp500 is not None:
                        sp500_map[pd] = last_sp500

        # 2. Convert sentiment to a map for easy lookup
        # sentiment_rows has 'snapshot_date' and 'avg_sentiment'
        sentiment_map = {}
        for row in sentiment_rows:
            s_date = row["snapshot_date"]
            if isinstance(s_date, str):
                s_date = date.fromisoformat(s_date)
            sentiment_map[s_date] = float(row["avg_sentiment"])

        # 3. Merge data using price series as the primary timeline
        snapshots: list[MarketDashboardPoint] = []
        for p in prices:
            p_date = date.fromisoformat(p.date) if isinstance(p.date, str) else p.date

            dma_val = dma_map.get(p_date)
            ratio_point = ratio_map.get(p_date)
            sentiment_val = sentiment_map.get(p_date)
            sp500_point = sp500_map.get(p_date)

            regime = None
            if sentiment_val is not None:
                regime = self._map_sentiment_to_regime(int(round(sentiment_val)))

            relative_strength = None
            if ratio_point is not None:
                relative_strength = EthBtcRelativeStrengthPoint(
                    ratio=ratio_point["ratio"],
                    dma_200=ratio_point["dma_200"],
                    is_above_dma=ratio_point["is_above_dma"],
                )

            snapshots.append(
                MarketDashboardPoint(
                    snapshot_date=p_date,
                    price_usd=p.price_usd,
                    dma_200=dma_val,
                    sentiment_value=int(round(sentiment_val))
                    if sentiment_val is not None
                    else None,
                    regime=regime,
                    eth_btc_relative_strength=relative_strength,
                    sp500=sp500_point,
                )
            )

        return MarketDashboardResponse(
            snapshots=snapshots,
            count=len(snapshots),
            token_symbol=token_symbol,
            days_requested=days,
            timestamp=datetime.now(UTC),
        )

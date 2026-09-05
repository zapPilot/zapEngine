"""
Yield Return Service - Production-ready yield analytics.

Provides day-by-day Yield Return calculations backed by the legacy debug helper
logic, wrapped in a dedicated service that fits the specialized architecture.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.filter_utils import normalize_filter
from src.models.yield_returns import (
    DailyYieldReturn,
    MultiWindowYieldSummaryResponse,
    PeriodInfo,
    TokenYieldBreakdown,
    YieldReturnsResponse,
    YieldReturnSummary,
)
from src.services.aggregators.yield_return_aggregator import YieldReturnAggregator
from src.services.aggregators.yield_summary_builder import build_yield_summary
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.eth_staking_income import (
    EthStakingExposure,
    aggregate_benchmark_lst_exposure,
    with_eth_staking_income,
)
from src.services.lido_staking_apr_provider import LidoStakingAprProvider
from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


class StakingAprProvider(Protocol):
    async def get_benchmark_apr(self) -> float | None: ...


class YieldReturnService(BaseAnalyticsService):
    """Service responsible for Yield Return computations."""

    def __init__(
        self,
        db: Session,
        query_service: QueryService,
        context: PortfolioAnalyticsContext,
        staking_apr_provider: StakingAprProvider | None = None,
    ) -> None:
        super().__init__(db, query_service, context)
        self._logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self._staking_apr_provider = staking_apr_provider or LidoStakingAprProvider()

    async def get_daily_yield_returns(
        self,
        user_id: UUID,
        *,
        wallet_address: str | None = None,
        days: int = 30,
        min_threshold: float = 0.0,
        protocols: list[str] | None = None,
        chains: list[str] | None = None,
    ) -> YieldReturnsResponse:
        """Return daily yield data for the requested filters."""
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        cache_key = self._cache_key(
            "daily_yield_returns",
            user_id,
            wallet_key,
            days,
            f"threshold:{self._normalize_float(min_threshold)}",
            f"protocols:{normalize_filter(protocols)}",
            f"chains:{normalize_filter(chains)}",
        )

        async def compute() -> YieldReturnsResponse:
            self._logger.info(
                "Calculating yield returns for user %s (days=%d, threshold=%.2f, wallet=%s)",
                user_id,
                days,
                min_threshold,
                wallet_address or "bundle",
            )

            start_date, end_date, filtered = await self._fetch_yield_deltas(
                user_id, days, wallet_address, min_threshold
            )
            daily_returns = self._build_daily_returns(filtered, protocols, chains)

            self._logger.info(
                "Calculated %d daily returns from %d filtered deltas",
                len(daily_returns),
                len(filtered),
            )

            period_info = PeriodInfo(
                start_date=start_date.isoformat(),
                end_date=end_date.isoformat(),
                days=days,
            )
            summary = self._build_summary(daily_returns)

            return YieldReturnsResponse(
                user_id=str(user_id),
                period=period_info,
                daily_returns=daily_returns,
                summary=summary,
            )

        return await self._with_async_cache(cache_key, compute, ttl_hours=ttl_hours)

    async def get_yield_summary(
        self,
        user_id: UUID,
        *,
        windows: tuple[str, ...] = ("7d", "30d", "90d"),
        outlier_strategy: str = "iqr",
        min_threshold: float = 0.0,
        wallet_address: str | None = None,
    ) -> MultiWindowYieldSummaryResponse:
        """Return observed protocol carry plus current synthetic ETH staking carry."""
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        cache_key = self._cache_key(
            "yield_summary",
            user_id,
            wallet_key,
            ",".join(windows),
            outlier_strategy,
            f"threshold:{self._normalize_float(min_threshold)}",
        )

        async def compute_observed() -> MultiWindowYieldSummaryResponse:
            _start, _end, deltas = await self._fetch_yield_deltas(
                user_id,
                max(int(window.removesuffix("d")) for window in windows) + 1,
                wallet_address,
                min_threshold,
            )
            return build_yield_summary(str(user_id), deltas, windows, outlier_strategy)

        observed_summary = await self._with_async_cache(
            cache_key, compute_observed, ttl_hours=ttl_hours
        )
        return await self._with_current_eth_staking_income(
            observed_summary,
            user_id=user_id,
            wallet_address=wallet_address,
            wallet_key=wallet_key,
            ttl_hours=ttl_hours,
        )

    async def _with_current_eth_staking_income(
        self,
        observed_summary: MultiWindowYieldSummaryResponse,
        *,
        user_id: UUID,
        wallet_address: str | None,
        wallet_key: str,
        ttl_hours: int,
    ) -> MultiWindowYieldSummaryResponse:
        """Append ETH staking run-rate without allowing it to break observed yield."""
        exposure_cache_key = self._cache_key("eth_lst_exposure", user_id, wallet_key)

        def compute_exposure() -> EthStakingExposure:
            rows = self._execute_query(
                QUERY_NAMES.ETH_LST_LATEST_EXPOSURE,
                {
                    "user_id": str(user_id),
                    "wallet_address": wallet_address,
                },
            )
            return aggregate_benchmark_lst_exposure(rows)

        try:
            exposure = self._with_cache(
                exposure_cache_key,
                compute_exposure,
                ttl_hours=ttl_hours,
            )
            if exposure.total_usd <= 0.0:
                return observed_summary

            benchmark_apr = await self._staking_apr_provider.get_benchmark_apr()
            if benchmark_apr is None:
                self._logger.info(
                    "Skipping ETH staking income for user %s: no valid Lido APR",
                    user_id,
                )
                return observed_summary

            return with_eth_staking_income(
                observed_summary,
                exposure,
                benchmark_apr,
            )
        except Exception as error:
            self._logger.warning(
                "ETH staking income attribution unavailable for user %s: %s",
                user_id,
                error,
            )
            return observed_summary

    async def _fetch_yield_deltas(
        self,
        user_id: UUID,
        days: int,
        wallet_address: str | None,
        min_threshold: float,
    ) -> tuple[datetime, datetime, list[dict[str, Any]]]:
        """Fetch snapshots and calculate significant token/USD balance deltas."""
        start_date, end_date = self.context.calculate_date_range(days)
        rows = await self.query_service.fetch_time_range_query(
            db=self.db,
            query_name=QUERY_NAMES.PORTFOLIO_YIELD_SNAPSHOTS,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            wallet_address=wallet_address,
        )
        self._logger.info("Fetched %d snapshots from database", len(rows))
        token_agg, usd_agg = YieldReturnAggregator.aggregate_snapshots(user_id, rows)
        token_deltas = YieldReturnAggregator.calculate_snapshot_deltas(token_agg)
        usd_deltas = YieldReturnAggregator.calculate_usd_balance_deltas(usd_agg)
        filtered = YieldReturnAggregator.filter_significant_deltas(
            token_deltas + usd_deltas, min_threshold
        )
        return start_date, end_date, filtered

    @staticmethod
    def _normalize_float(value: float) -> str:
        return f"{value:.6f}"

    def _build_daily_returns(
        self,
        deltas: list[dict[str, Any]],
        protocols: list[str] | None,
        chains: list[str] | None,
    ) -> list[DailyYieldReturn]:
        """Convert delta rows into Pydantic models with optional filtering."""
        if not deltas:
            return []

        allowed_protocols = set(protocols) if protocols else None
        allowed_chains = set(chains) if chains else None

        daily_returns: list[DailyYieldReturn] = []
        for delta in deltas:
            if allowed_protocols and delta["protocol_name"] not in allowed_protocols:
                continue
            if allowed_chains and delta["chain"] not in allowed_chains:
                continue

            tokens = self._build_token_breakdown(
                delta["current_amounts"], delta["previous_amounts"]
            )
            daily_returns.append(
                DailyYieldReturn(
                    date=delta["snapshot_at"],
                    protocol_name=delta["protocol_name"],
                    chain=delta["chain"],
                    position_type=delta.get("name_item"),
                    yield_return_usd=delta["token_yield_usd"],
                    tokens=tokens,
                )
            )

        daily_returns.sort(key=lambda item: (item.date, item.protocol_name, item.chain))
        return daily_returns

    @staticmethod
    def _build_token_breakdown(
        current_amounts: dict[str, dict[str, float]],
        previous_amounts: dict[str, dict[str, float]],
    ) -> list[TokenYieldBreakdown]:
        """Generate token-level amount and price attribution."""
        breakdown: list[TokenYieldBreakdown] = []
        all_symbols = sorted(set(current_amounts.keys()) | set(previous_amounts.keys()))

        for symbol in all_symbols:
            current = current_amounts.get(symbol, {})
            previous = previous_amounts.get(symbol, {})
            current_amount = float(current.get("amount", 0.0))
            current_price = float(current.get("price", previous.get("price", 0.0)))
            previous_amount = float(previous.get("amount", 0.0))
            previous_price = float(previous.get("price", current_price))
            amount_diff = current_amount - previous_amount
            yield_return_usd = amount_diff * current_price
            # Upstream stores a missing DeBank price as 0.0, which is
            # indistinguishable from a worthless token. Attributing a price
            # effect against an unpriced side would invent a market move worth
            # the whole position, so leave it for the caller's residual.
            market_return_usd = (
                previous_amount * (current_price - previous_price)
                if current_price > 0.0 and previous_price > 0.0
                else 0.0
            )
            breakdown.append(
                TokenYieldBreakdown(
                    symbol=symbol,
                    amount_change=amount_diff,
                    current_price=current_price,
                    yield_return_usd=yield_return_usd,
                    market_return_usd=market_return_usd,
                )
            )

        return breakdown

    @staticmethod
    def _build_summary(daily_returns: list[DailyYieldReturn]) -> YieldReturnSummary:
        """Summarize Yield Return statistics for the response."""
        if not daily_returns:
            return YieldReturnSummary(
                total_yield_return_usd=0.0,
                average_daily_return=0.0,
                positive_days=0,
                negative_days=0,
                top_protocol=None,
                top_chain=None,
            )

        total_return = sum(entry.yield_return_usd for entry in daily_returns)
        average_return = total_return / len(daily_returns)
        positive_days = sum(1 for entry in daily_returns if entry.yield_return_usd > 0)
        negative_days = sum(1 for entry in daily_returns if entry.yield_return_usd < 0)

        protocol_totals: dict[str, float] = defaultdict(float)
        chain_totals: dict[str, float] = defaultdict(float)
        for entry in daily_returns:
            protocol_totals[entry.protocol_name] += entry.yield_return_usd
            chain_totals[entry.chain] += entry.yield_return_usd

        top_protocol = max(protocol_totals.items(), key=lambda kv: abs(kv[1]))[0]
        top_chain = max(chain_totals.items(), key=lambda kv: abs(kv[1]))[0]

        return YieldReturnSummary(
            total_yield_return_usd=total_return,
            average_daily_return=average_return,
            positive_days=positive_days,
            negative_days=negative_days,
            top_protocol=top_protocol,
            top_chain=top_chain,
        )

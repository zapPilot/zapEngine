"""
Yield Return Service - Production-ready yield analytics.

Provides day-by-day Yield Return calculations backed by the legacy debug helper
logic, wrapped in a dedicated service that fits the specialized architecture.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Generic, Protocol, TypeVar
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from src.core.cache_service import SINGLE_FLIGHT_WAIT_SECONDS
from src.core.config import settings
from src.core.filter_utils import normalize_filter
from src.models.yield_returns import (
    DailyWalletReturn,
    DailyYieldReturn,
    MultiWindowYieldSummaryResponse,
    PeriodInfo,
    YieldReturnsResponse,
    YieldReturnSummary,
)
from src.services.aggregators.delta_outliers import (
    OutlierKey,
    flag_outlier_deltas,
    outlier_key,
)
from src.services.aggregators.token_attribution import build_token_breakdown
from src.services.aggregators.wallet_attribution_aggregator import (
    WalletTokenHolding,
    aggregate_wallet_snapshots,
    build_wallet_returns,
    calculate_wallet_deltas,
)
from src.services.aggregators.yield_return_aggregator import YieldReturnAggregator
from src.services.aggregators.yield_summary_builder import (
    WINDOW_DAYS,
    build_yield_summary,
)
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.analytics.eth_staking_income import (
    EthStakingExposure,
    aggregate_benchmark_lst_exposure,
    with_eth_staking_income,
)
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.shared.base_analytics_service import BaseAnalyticsService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService

# One scan wide enough for every window the home screen asks for: the summary
# already reads max(window)+1 days, so the shared base never costs more than
# the most expensive request did on its own.
YIELD_BASE_WINDOW_DAYS = max(WINDOW_DAYS.values()) + 1

WindowPayloadT = TypeVar("WindowPayloadT")

WalletDays = dict[str, dict[str, WalletTokenHolding]]


class StakingAprProvider(Protocol):
    async def get_benchmark_apr(self) -> float | None: ...


@dataclass(frozen=True)
class CachedWindow(Generic[WindowPayloadT]):
    """Aggregated snapshot data with the window it was measured over."""

    start_date: datetime
    end_date: datetime
    payload: WindowPayloadT


@dataclass(frozen=True)
class PositionAggregates:
    """Per-day position buckets, cached before deltas are taken.

    Raw snapshot rows for 91 days reach tens of megabytes; the cache deep-copies
    every value it hands out, so the aggregated buckets are what get stored.
    Deltas stay outside the cache because they must be recomputed per window -
    slicing them instead would keep a predecessor the narrow window never saw.
    """

    token_snapshots: list[dict[str, Any]]
    usd_snapshots: list[dict[str, Any]]

    def since(self, day: str) -> PositionAggregates:
        """Drop buckets before ``day`` (a ``YYYY-MM-DD`` string)."""
        return PositionAggregates(
            token_snapshots=[
                bucket
                for bucket in self.token_snapshots
                if bucket["snapshot_at"] >= day
            ],
            usd_snapshots=[
                bucket for bucket in self.usd_snapshots if bucket["snapshot_at"] >= day
            ],
        )


def _wallet_days_since(by_day: WalletDays, day: str) -> WalletDays:
    """Drop wallet-token days before ``day`` (a ``YYYY-MM-DD`` string)."""
    return {
        bucket_day: holdings
        for bucket_day, holdings in by_day.items()
        if bucket_day >= day
    }


class YieldReturnService(BaseAnalyticsService):
    """Service responsible for Yield Return computations.

    Every database call here runs through ``run_in_threadpool``: the routes are
    ``async def``, so a synchronous ``Session.execute`` would otherwise hold the
    event loop for the full 3-77s of a yield query and stall every other
    response, ``/healthz`` included. The offloaded calls stay strictly
    sequential because ``self.db`` is a single Session shared by this request;
    two threads must never touch it at once.

    Daily returns and the multi-window summary read one cached
    ``YIELD_BASE_WINDOW_DAYS`` scan per canonical snapshot and slice it to the
    requested window, so a cold home load pays for that scan once rather than
    once per endpoint and once per range the user switches to.
    """

    # v3 caches aggregated windows keyed on the canonical snapshot date; v2
    # entries hold a different payload type under a differently shaped key.
    CACHE_VERSION = "v3"

    def __init__(
        self,
        db: Session,
        query_service: QueryService,
        context: PortfolioAnalyticsContext,
        staking_apr_provider: StakingAprProvider,
        canonical_snapshot_service: CanonicalSnapshotService,
    ) -> None:
        super().__init__(db, query_service, context)
        self._logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self._staking_apr_provider = staking_apr_provider
        self._canonical_snapshot_service = canonical_snapshot_service

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
        snapshot_date = await self._resolve_snapshot_anchor(user_id, wallet_address)
        cache_key = self._cache_key(
            "daily_yield_returns",
            user_id,
            wallet_key,
            days,
            f"threshold:{self._normalize_float(min_threshold)}",
            f"protocols:{normalize_filter(protocols)}",
            f"chains:{normalize_filter(chains)}",
            self._anchor_key_part(snapshot_date),
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
                user_id, days, wallet_address, min_threshold, snapshot_date
            )
            # Fenced over the whole requested window before any protocol/chain
            # filter, so narrowing the response never moves another series'
            # deposit threshold.
            outlier_keys = flag_outlier_deltas(filtered)
            daily_returns = self._build_daily_returns(
                filtered, protocols, chains, outlier_keys
            )
            wallet_returns = await self._fetch_wallet_returns(
                user_id, wallet_address, days, snapshot_date
            )

            self._logger.info(
                "Calculated %d daily returns from %d filtered deltas "
                "(%d flagged) plus %d wallet days",
                len(daily_returns),
                len(filtered),
                len(outlier_keys),
                len(wallet_returns),
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
                wallet_returns=wallet_returns,
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
        snapshot_date = await self._resolve_snapshot_anchor(user_id, wallet_address)
        cache_key = self._cache_key(
            "yield_summary",
            user_id,
            wallet_key,
            ",".join(windows),
            outlier_strategy,
            f"threshold:{self._normalize_float(min_threshold)}",
            self._anchor_key_part(snapshot_date),
        )

        async def compute_observed() -> MultiWindowYieldSummaryResponse:
            _start, _end, deltas = await self._fetch_yield_deltas(
                user_id,
                max(int(window.removesuffix("d")) for window in windows) + 1,
                wallet_address,
                min_threshold,
                snapshot_date,
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
            exposure = await run_in_threadpool(
                self._with_cache,
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
        except (SQLAlchemyError, RuntimeError) as error:
            self._logger.exception(
                "ETH staking income attribution unavailable for user %s: %s",
                user_id,
                error,
            )
            return observed_summary

    async def _resolve_snapshot_anchor(
        self, user_id: UUID, wallet_address: str | None
    ) -> date | None:
        """Resolve the canonical snapshot date every cache key is pinned to.

        Offloaded like every other DB hop: the 5-minute cache in front of it
        misses often enough that an inline call would run SQL on the loop.
        """
        return await run_in_threadpool(
            self._canonical_snapshot_service.get_snapshot_date,
            user_id,
            wallet_address,
        )

    @staticmethod
    def _anchor_key_part(snapshot_date: date | None) -> str:
        """Render the snapshot anchor so a new ETL run moves every key."""
        if snapshot_date is None:
            return "snapshot:none"
        return f"snapshot:{snapshot_date.isoformat()}"

    def _analysis_window(
        self, days: int, snapshot_date: date | None
    ) -> tuple[datetime, datetime]:
        """Return the half-open window analysed for one request.

        Anchoring on the canonical snapshot keeps every window midnight-aligned,
        so a narrow slice of the shared base scan covers exactly the same whole
        days a dedicated query would have. Without a snapshot the user has no
        position rows at all, so the wall-clock window is as good as any.
        """
        if snapshot_date is None:
            return self.context.calculate_date_range(days)
        end_date = datetime.combine(
            snapshot_date + timedelta(days=1), time.min, tzinfo=UTC
        )
        return end_date - timedelta(days=days), end_date

    @staticmethod
    def _base_window_wait_timeout() -> float:
        """Seconds a follower waits for the shared base scan.

        The 60s default is shorter than a cold 91-day scan, which would make
        every concurrent home request run its own copy of the one query this
        cache exists to collapse.
        """
        if settings.db_statement_timeout_ms <= 0:
            return SINGLE_FLIGHT_WAIT_SECONDS
        return settings.db_statement_timeout_ms / 1000 + 5

    async def _load_window(
        self,
        *,
        namespace: str,
        query_name: str,
        user_id: UUID,
        wallet_address: str | None,
        days: int,
        snapshot_date: date | None,
        aggregate: Callable[[list[dict[str, Any]]], WindowPayloadT],
        narrow: Callable[[WindowPayloadT, str], WindowPayloadT],
    ) -> CachedWindow[WindowPayloadT]:
        """Read one aggregated window, reusing the cached base scan when possible."""
        wallet_key, ttl_hours = self._wallet_cache_config(wallet_address)
        use_base = settings.analytics_cache_enabled and days <= YIELD_BASE_WINDOW_DAYS
        fetch_days = YIELD_BASE_WINDOW_DAYS if use_base else days

        def fetch() -> CachedWindow[WindowPayloadT]:
            start_date, end_date = self._analysis_window(fetch_days, snapshot_date)
            rows = self.query_service.fetch_time_range_query(
                db=self.db,
                query_name=query_name,
                user_id=user_id,
                start_date=start_date,
                end_date=end_date,
                wallet_address=wallet_address,
            )
            self._logger.info(
                "Fetched %d rows for %s over %d days", len(rows), namespace, fetch_days
            )
            return CachedWindow(start_date, end_date, aggregate(rows))

        if not use_base:
            return await run_in_threadpool(fetch)

        base = await run_in_threadpool(
            self._with_cache,
            self._cache_key(
                namespace,
                user_id,
                wallet_key,
                YIELD_BASE_WINDOW_DAYS,
                self._anchor_key_part(snapshot_date),
            ),
            fetch,
            ttl_hours=ttl_hours,
            wait_timeout=self._base_window_wait_timeout(),
        )
        start_date = base.end_date - timedelta(days=days)
        return CachedWindow(
            start_date,
            base.end_date,
            narrow(base.payload, start_date.date().isoformat()),
        )

    async def _fetch_yield_deltas(
        self,
        user_id: UUID,
        days: int,
        wallet_address: str | None,
        min_threshold: float,
        snapshot_date: date | None,
    ) -> tuple[datetime, datetime, list[dict[str, Any]]]:
        """Fetch snapshots and calculate significant token/USD balance deltas."""

        def aggregate(rows: list[dict[str, Any]]) -> PositionAggregates:
            token_agg, usd_agg = YieldReturnAggregator.aggregate_snapshots(
                user_id, rows
            )
            return PositionAggregates(token_agg, usd_agg)

        window = await self._load_window(
            namespace="position_aggregates",
            query_name=QUERY_NAMES.PORTFOLIO_YIELD_SNAPSHOTS,
            user_id=user_id,
            wallet_address=wallet_address,
            days=days,
            snapshot_date=snapshot_date,
            aggregate=aggregate,
            narrow=PositionAggregates.since,
        )
        # Deltas are derived after the slice: the first day of a narrow window
        # must not inherit a predecessor that only the base window saw.
        deltas = YieldReturnAggregator.calculate_snapshot_deltas(
            window.payload.token_snapshots
        ) + YieldReturnAggregator.calculate_usd_balance_deltas(
            window.payload.usd_snapshots
        )
        filtered = YieldReturnAggregator.filter_significant_deltas(
            deltas, min_threshold
        )
        return window.start_date, window.end_date, filtered

    async def _fetch_wallet_returns(
        self,
        user_id: UUID,
        wallet_address: str | None,
        days: int,
        snapshot_date: date | None,
    ) -> list[DailyWalletReturn]:
        """Attribute idle wallet balances over the position window.

        Shares the position path's anchor and window so the two attributions
        always describe the same days. A failure here is not swallowed: without
        wallet coverage every wallet price move would silently reappear as an
        unexplained residual, which is worse than the frontend hiding the
        breakdown entirely.
        """
        window = await self._load_window(
            namespace="wallet_token_days",
            query_name=QUERY_NAMES.WALLET_TOKEN_ATTRIBUTION_SNAPSHOTS,
            user_id=user_id,
            wallet_address=wallet_address,
            days=days,
            snapshot_date=snapshot_date,
            aggregate=aggregate_wallet_snapshots,
            narrow=_wallet_days_since,
        )
        return build_wallet_returns(calculate_wallet_deltas(window.payload))

    @staticmethod
    def _normalize_float(value: float) -> str:
        return f"{value:.6f}"

    def _build_daily_returns(
        self,
        deltas: list[dict[str, Any]],
        protocols: list[str] | None,
        chains: list[str] | None,
        outlier_keys: set[OutlierKey],
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

            tokens = build_token_breakdown(
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
                    outlier=outlier_key(delta) in outlier_keys,
                )
            )

        daily_returns.sort(key=lambda item: (item.date, item.protocol_name, item.chain))
        return daily_returns

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

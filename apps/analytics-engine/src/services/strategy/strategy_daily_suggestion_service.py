"""Daily suggestion service: follow the backtest model, project the user onto it.

There is no live-only strategy path. The suggestion is the last bar of the same
rolling-window backtest the published snapshot is measured on, so the strategy a
user is told to follow is the one whose track record is shown. The user's own
holdings only decide how far they are from that bar's target.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, cast
from uuid import UUID

from src.core.cache_service import analytics_cache, build_service_cache_key
from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    BucketType,
    ExecutionStatus,
    SpotAssetType,
    TransferRecord,
)
from src.models.strategy import (
    DailySuggestionActionState,
    DailySuggestionContextState,
    DailySuggestionModelState,
    DailySuggestionPortfolioState,
    DailySuggestionResponse,
    DailySuggestionStrategyContextState,
    DailySuggestionTargetState,
)
from src.models.strategy_config import SavedStrategyConfig
from src.services.backtesting.asset_allocation_serialization import (
    serialize_asset_allocation,
)
from src.services.backtesting.capabilities import PortfolioBuckets
from src.services.backtesting.execution.rebalance_calculator import (
    plan_transfers_to_target,
)
from src.services.backtesting.strategy_registry import (
    ResolvedSavedStrategyConfig,
    resolve_saved_strategy_config,
)
from src.services.strategy.backtesting_protocol import (
    BacktestingServiceProtocol,
    ModelReplay,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore

if TYPE_CHECKING:
    from src.services.backtesting.execution.portfolio import Portfolio
    from src.services.portfolio.canonical_snapshot_service import (
        CanonicalSnapshotService,
    )
    from src.services.portfolio.landing_page_service import LandingPageService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _UserPortfolio:
    buckets: PortfolioBuckets
    total_assets_usd: float
    total_debt_usd: float
    total_net_usd: float


def _utc_now() -> datetime:
    return datetime.now(UTC)


class StrategyDailySuggestionService:
    # Bump to invalidate cached suggestions after a logic change.
    CACHE_VERSION = "v3"
    # There is no server-side ETL completion signal, so freshness rests on the
    # canonical snapshot date and the model's end date in the key plus this
    # short window.
    CACHE_TTL = timedelta(minutes=10)

    landing_page_service: LandingPageService
    backtesting_service: BacktestingServiceProtocol
    canonical_snapshot_service: CanonicalSnapshotService | None
    strategy_config_store: StrategyConfigStore

    def __init__(
        self,
        landing_page_service: LandingPageService,
        backtesting_service: BacktestingServiceProtocol,
        canonical_snapshot_service: CanonicalSnapshotService | None = None,
        strategy_config_store: StrategyConfigStore | None = None,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self.landing_page_service = landing_page_service
        self.backtesting_service = backtesting_service
        self.canonical_snapshot_service = canonical_snapshot_service
        self.strategy_config_store = strategy_config_store or StrategyConfigStore()
        self._clock = clock

    def get_daily_suggestion(
        self,
        user_id: UUID,
        config_id: str | None = None,
    ) -> DailySuggestionResponse:
        saved_config = self.strategy_config_store.resolve_config(config_id)
        resolved_config = resolve_saved_strategy_config(saved_config)
        if not resolved_config.supports_daily_suggestion:
            raise ValueError(
                f"Strategy '{resolved_config.strategy_id}' does not support /daily-suggestion"
            )
        # UTC yesterday, like the daily backtest refresh: today's data has not
        # landed yet, and a model decision for a day is acted on the next day.
        model_end = self._clock().astimezone(UTC).date() - timedelta(days=1)

        cache_key = build_service_cache_key(
            self.__class__.__name__,
            self.CACHE_VERSION,
            str(user_id),
            # Key on the resolved id: the backend default arrives both as None
            # and under its own id, and both must share one entry.
            saved_config.config_id,
            model_end.isoformat(),
            self._snapshot_anchor(user_id),
        )
        return analytics_cache.get_or_compute(
            cache_key,
            lambda: self._compute_daily_suggestion(
                user_id=user_id,
                saved_config=saved_config,
                resolved_config=resolved_config,
                model_end=model_end,
            ),
            ttl=self.CACHE_TTL,
        )

    def _snapshot_anchor(self, user_id: UUID) -> str:
        """Pin the cache entry to the canonical snapshot it was computed from."""
        if self.canonical_snapshot_service is None:
            return "no-snapshot-anchor"
        return str(self.canonical_snapshot_service.get_snapshot_date(user_id))

    def _compute_daily_suggestion(
        self,
        *,
        user_id: UUID,
        saved_config: SavedStrategyConfig,
        resolved_config: ResolvedSavedStrategyConfig,
        model_end: date,
    ) -> DailySuggestionResponse:
        replay = self.backtesting_service.replay_model(
            saved_config.config_id,
            model_end,
        )
        user = self._load_user_portfolio(user_id, resolved_config=resolved_config)
        return self._build_response(
            saved_config=saved_config,
            resolved_config=resolved_config,
            replay=replay,
            user=user,
        )

    def _load_user_portfolio(
        self,
        user_id: UUID,
        *,
        resolved_config: ResolvedSavedStrategyConfig,
    ) -> _UserPortfolio:
        landing_page = self.landing_page_service.get_landing_page_data(user_id)
        return _UserPortfolio(
            buckets=resolved_config.portfolio_bucket_mapper(landing_page),
            total_assets_usd=landing_page.total_assets_usd,
            total_debt_usd=landing_page.total_debt_usd,
            total_net_usd=landing_page.total_net_usd,
        )

    def _build_response(
        self,
        *,
        saved_config: SavedStrategyConfig,
        resolved_config: ResolvedSavedStrategyConfig,
        replay: ModelReplay,
        user: _UserPortfolio,
    ) -> DailySuggestionResponse:
        model_state = replay.state
        if model_state.signal is None:
            raise ValueError("Daily suggestion serialization missing signal state")
        primary_asset = resolved_config.primary_asset
        price_map = replay.market.token_price
        runtime_portfolio = user.buckets.to_portfolio(
            price_map[primary_asset.lower()],
            price_map=price_map,
            spot_asset=primary_asset,
            runtime_mode=resolved_config.runtime_portfolio_mode,
        )
        decision = model_state.decision
        # The user is only ever asked to move on a day the model itself moved:
        # between signals the model holds, so asking would be noise.
        transfers = (
            self._project_transfers(
                runtime_portfolio=runtime_portfolio,
                price_map=price_map,
                target=decision.target_allocation.model_dump(),
            )
            if replay.traded
            else []
        )
        block_reason = self._resolve_block_reason(replay)
        status: ExecutionStatus
        if transfers:
            status, reason_code = "action_required", decision.reason
        elif block_reason is not None:
            status, reason_code = "blocked", block_reason
        else:
            status, reason_code = "no_action", decision.reason

        return DailySuggestionResponse(
            as_of=self._clock(),
            config_id=saved_config.config_id,
            config_display_name=resolved_config.display_name,
            strategy_id=resolved_config.strategy_id,
            spec_ref=cast(str, resolved_config.spec_ref),
            action=DailySuggestionActionState(
                status=status,
                required=bool(transfers),
                kind="rebalance" if transfers else None,
                reason_code=reason_code,
                transfers=transfers,
            ),
            context=DailySuggestionContextState(
                market=replay.market,
                signal=model_state.signal,
                portfolio=DailySuggestionPortfolioState(
                    spot_usd=user.buckets.spot_value,
                    stable_usd=user.buckets.stable_value,
                    total_value=user.buckets.total_value,
                    total_assets_usd=user.total_assets_usd,
                    total_debt_usd=user.total_debt_usd,
                    total_net_usd=user.total_net_usd,
                    allocation=Allocation(**user.buckets.allocation()),
                    asset_allocation=self._resolve_asset_allocation(
                        user.buckets,
                        primary_asset=primary_asset,
                    ),
                    spot_asset=cast(
                        SpotAssetType | None,
                        runtime_portfolio.serializable_spot_asset(),
                    ),
                ),
                target=DailySuggestionTargetState(
                    allocation=decision.target_allocation
                ),
                strategy=DailySuggestionStrategyContextState(
                    stance=decision.action,
                    reason_code=decision.reason,
                    rule_group=decision.rule_group,
                    details=dict(decision.details),
                ),
                model=DailySuggestionModelState(
                    allocation=model_state.portfolio.asset_allocation,
                    window=replay.window,
                ),
            ),
            data_freshness=replay.data_freshness,
        )

    @staticmethod
    def _project_transfers(
        *,
        runtime_portfolio: Portfolio,
        price_map: dict[str, float],
        target: dict[str, float],
    ) -> list[TransferRecord]:
        return [
            TransferRecord(
                from_bucket=cast(BucketType, transfer.from_bucket),
                to_bucket=cast(BucketType, transfer.to_bucket),
                amount_usd=float(transfer.amount_usd),
            )
            for transfer in plan_transfers_to_target(
                portfolio=runtime_portfolio,
                price=price_map,
                target_allocation=target,
            )
        ]

    @staticmethod
    def _resolve_block_reason(replay: ModelReplay) -> str | None:
        block_reason = replay.state.execution.blocked_reason or None
        decision = replay.state.decision
        if (
            block_reason is None
            and decision.action == "hold"
            and decision.reason.startswith("trade_quota_")
        ):
            # The trade-quota guard turns a decision into a hold named for its limit.
            return decision.reason
        return block_reason

    @staticmethod
    def _resolve_asset_allocation(
        buckets: PortfolioBuckets,
        *,
        primary_asset: str,
    ) -> AssetAllocation:
        current_asset_allocation = buckets.asset_allocation()
        if current_asset_allocation is not None:
            return serialize_asset_allocation(current_asset_allocation)
        runtime = buckets.allocation()
        primary = primary_asset.strip().lower()
        return AssetAllocation(
            btc=float(runtime["spot"]) if primary == "btc" else 0.0,
            eth=float(runtime["spot"]) if primary == "eth" else 0.0,
            spy=float(runtime["spot"]) if primary == "spy" else 0.0,
            stable=float(runtime["stable"]),
            alt=float(runtime["spot"]) if primary not in ("btc", "eth", "spy") else 0.0,
        )


__all__ = [
    "PortfolioBuckets",
    "StrategyDailySuggestionService",
]

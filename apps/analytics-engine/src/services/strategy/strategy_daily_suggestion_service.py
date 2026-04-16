"""Daily suggestion service for the recipe-first v3 framework."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    MarketSnapshot,
    StrategyId,
)
from src.models.strategy import (
    DailySuggestionActionState,
    DailySuggestionContextState,
    DailySuggestionPortfolioState,
    DailySuggestionResponse,
    DailySuggestionStrategyContextState,
    DailySuggestionTargetState,
)
from src.services.backtesting.asset_allocation_serialization import (
    aggregate_to_asset_allocation,
    serialize_asset_allocation,
    serialize_target_asset_allocation,
)
from src.services.backtesting.capabilities import (
    PortfolioBuckets,
    RuntimePortfolioMode,
)
from src.services.backtesting.composition import (
    ResolvedSavedStrategyConfig,
    resolve_saved_strategy_config,
)
from src.services.backtesting.composition_catalog import (
    CompositionCatalog,
    get_default_composition_catalog,
)
from src.services.backtesting.data.feature_loader import resolve_price_feature_history
from src.services.backtesting.execution.block_reasons import (
    resolve_effective_block_reason,
)
from src.services.backtesting.execution.plugins import (
    TradeHistoryAwareExecutionPlugin,
)
from src.services.backtesting.execution.state import build_strategy_state
from src.services.backtesting.features import (
    ETH_USD_PRICE_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.strategies.base import (
    DailyRecommendationInput,
    StrategyAction,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
)
from src.services.backtesting.utils import normalize_regime_label
from src.services.strategy.strategy_config_store import (
    SeedStrategyConfigStore,
    StrategyConfigStore,
)
from src.services.strategy.strategy_trade_history_store import (
    SeedStrategyTradeHistoryStore,
)

if TYPE_CHECKING:
    from src.services.interfaces import (
        CanonicalSnapshotServiceProtocol,
        LandingPageServiceProtocol,
        RegimeTrackingServiceProtocol,
        SentimentDatabaseServiceProtocol,
        StrategyTradeHistoryStoreProtocol,
        TokenPriceServiceProtocol,
    )

logger = logging.getLogger(__name__)
DEFAULT_REGIME_HISTORY_DAYS = 30


@dataclass(frozen=True)
class _DailySuggestionPortfolioData:
    buckets: PortfolioBuckets
    total_assets_usd: float
    total_debt_usd: float
    total_net_usd: float


@dataclass(frozen=True)
class _DailySuggestionMarketData:
    current_date: date
    current_price: float
    current_price_map: dict[str, float]
    current_sentiment: dict[str, str | int]
    sentiment_history: list[Any]
    price_history: list[float]
    warmup_price_by_date: dict[date, float]
    warmup_price_map_by_date: dict[date, dict[str, float]]
    extra_data: dict[str, Any]
    warmup_extra_data_by_date: dict[date, dict[str, Any]]


class StrategyDailySuggestionService:
    landing_page_service: LandingPageServiceProtocol
    regime_tracking_service: RegimeTrackingServiceProtocol
    sentiment_service: SentimentDatabaseServiceProtocol
    token_price_service: TokenPriceServiceProtocol
    canonical_snapshot_service: CanonicalSnapshotServiceProtocol | None
    strategy_config_store: StrategyConfigStore | SeedStrategyConfigStore
    trade_history_store: StrategyTradeHistoryStoreProtocol
    composition_catalog: CompositionCatalog

    def __init__(
        self,
        landing_page_service: LandingPageServiceProtocol,
        regime_tracking_service: RegimeTrackingServiceProtocol,
        sentiment_service: SentimentDatabaseServiceProtocol,
        token_price_service: TokenPriceServiceProtocol,
        canonical_snapshot_service: CanonicalSnapshotServiceProtocol | None = None,
        strategy_config_store: StrategyConfigStore | None = None,
        trade_history_store: StrategyTradeHistoryStoreProtocol | None = None,
        composition_catalog: CompositionCatalog | None = None,
    ) -> None:
        self.landing_page_service = landing_page_service
        self.regime_tracking_service = regime_tracking_service
        self.sentiment_service = sentiment_service
        self.token_price_service = token_price_service
        self.canonical_snapshot_service = canonical_snapshot_service
        self.strategy_config_store = strategy_config_store or SeedStrategyConfigStore()
        self.trade_history_store = (
            trade_history_store or SeedStrategyTradeHistoryStore()
        )
        self.composition_catalog = (
            composition_catalog or get_default_composition_catalog()
        )

    def get_daily_suggestion(
        self,
        user_id: UUID,
        config_id: str | None = None,
        drift_threshold: float | None = None,
        regime_history_days: int | None = None,
    ) -> DailySuggestionResponse:
        del drift_threshold
        saved_config = self.strategy_config_store.resolve_config(config_id)
        resolved_config = resolve_saved_strategy_config(
            saved_config,
            catalog=self.composition_catalog,
        )
        if not resolved_config.supports_daily_suggestion:
            raise ValueError(
                f"Strategy '{resolved_config.strategy_id}' does not support /daily-suggestion"
            )
        lookback_days = regime_history_days or DEFAULT_REGIME_HISTORY_DAYS

        portfolio_data = self._load_portfolio_data(
            user_id, resolved_config=resolved_config
        )
        market_data = self._load_market_data(
            resolved_config=resolved_config,
            lookback_days=lookback_days,
        )

        strategy = resolved_config.build_strategy(
            StrategyBuildRequest(
                mode="daily_suggestion",
                total_capital=max(portfolio_data.buckets.total_value, 0.0),
                params=dict(resolved_config.public_params),
            )
        )
        strategy.summary_signal_id = resolved_config.summary_signal_id
        self._seed_trade_history_plugins(
            strategy=strategy,
            user_id=user_id,
            current_date=market_data.current_date,
        )
        action = strategy.get_daily_recommendation(
            self._build_daily_recommendation_input(
                buckets=portfolio_data.buckets,
                market_data=market_data,
                primary_asset=resolved_config.primary_asset,
                runtime_portfolio_mode=resolved_config.runtime_portfolio_mode,
            )
        )
        return self._build_daily_suggestion_response(
            preset_config_id=saved_config.config_id,
            config_display_name=resolved_config.display_name,
            strategy_id=resolved_config.strategy_id,
            primary_asset=resolved_config.primary_asset,
            runtime_portfolio_mode=resolved_config.runtime_portfolio_mode,
            portfolio_data=portfolio_data,
            market_data=market_data,
            action=action,
        )

    def _load_portfolio_data(
        self, user_id: UUID, *, resolved_config: ResolvedSavedStrategyConfig
    ) -> _DailySuggestionPortfolioData:
        portfolio_data = self.landing_page_service.get_landing_page_data(user_id)
        buckets = resolved_config.portfolio_bucket_mapper(portfolio_data)
        total_assets_usd = self._coerce_portfolio_total(
            value=getattr(portfolio_data, "total_assets_usd", None),
            fallback=buckets.total_value,
        )
        total_debt_usd = self._coerce_portfolio_total(
            value=getattr(portfolio_data, "total_debt_usd", None),
            fallback=0.0,
        )
        total_net_usd = self._coerce_portfolio_total(
            value=getattr(portfolio_data, "total_net_usd", None),
            fallback=total_assets_usd - total_debt_usd,
        )
        return _DailySuggestionPortfolioData(
            buckets=buckets,
            total_assets_usd=total_assets_usd,
            total_debt_usd=total_debt_usd,
            total_net_usd=total_net_usd,
        )

    def _load_market_data(
        self,
        *,
        resolved_config: ResolvedSavedStrategyConfig,
        lookback_days: int,
    ) -> _DailySuggestionMarketData:
        market_data_requirements = resolved_config.market_data_requirements.merge(
            MarketDataRequirements(
                price_history_days=lookback_days,
                sentiment_history_days=lookback_days,
            )
        )
        latest_price = self.token_price_service.get_latest_price(
            resolved_config.primary_asset
        )
        if latest_price is None:
            raise ValueError(f"Missing latest {resolved_config.primary_asset} price")
        current_date = date.fromisoformat(latest_price.date[:10])
        current_price = float(latest_price.price_usd)
        latest_sentiment = self.sentiment_service.get_current_sentiment_sync()
        current_sentiment: dict[str, str | int] = {
            "label": normalize_regime_label(latest_sentiment.status),
            "value": int(latest_sentiment.value),
        }
        history_days = max(
            market_data_requirements.price_history_days,
            market_data_requirements.sentiment_history_days,
            1,
        )
        history_start = current_date - timedelta(
            days=history_days + resolved_config.warmup_lookback_days
        )
        sentiment_history = (
            self.sentiment_service.get_daily_sentiment_aggregates(
                start_date=history_start,
                end_date=current_date,
            )
            if market_data_requirements.requires_sentiment
            else []
        )
        price_history_rows = self.token_price_service.get_price_history(
            days=history_days + resolved_config.warmup_lookback_days,
            token_symbol=resolved_config.primary_asset,
            start_date=history_start,
            end_date=current_date,
        )
        price_history = [float(row.price_usd) for row in price_history_rows]
        warmup_price_by_date = {
            date.fromisoformat(row.date[:10]): float(row.price_usd)
            for row in price_history_rows
        }
        warmup_extra_data_by_date = self._load_required_market_features_by_date(
            resolved_config=resolved_config,
            market_data_requirements=market_data_requirements,
            current_date=current_date,
            history_start=history_start,
        )
        current_price_map = self._build_price_map(
            primary_asset=resolved_config.primary_asset,
            primary_price=current_price,
            feature_row=warmup_extra_data_by_date.get(current_date, {}),
        )
        warmup_price_map_by_date = {
            snapshot_date: self._build_price_map(
                primary_asset=resolved_config.primary_asset,
                primary_price=warmup_price_by_date.get(snapshot_date, current_price),
                feature_row=feature_row,
            )
            for snapshot_date, feature_row in warmup_extra_data_by_date.items()
        }
        warmup_price_map_by_date.setdefault(current_date, dict(current_price_map))
        return _DailySuggestionMarketData(
            current_date=current_date,
            current_price=current_price,
            current_price_map=current_price_map,
            current_sentiment=current_sentiment,
            sentiment_history=sentiment_history,
            price_history=price_history,
            warmup_price_by_date=warmup_price_by_date,
            warmup_price_map_by_date=warmup_price_map_by_date,
            extra_data=dict(warmup_extra_data_by_date.get(current_date, {})),
            warmup_extra_data_by_date=warmup_extra_data_by_date,
        )

    def _load_required_market_features_by_date(
        self,
        *,
        resolved_config: ResolvedSavedStrategyConfig,
        market_data_requirements: MarketDataRequirements,
        current_date: date,
        history_start: date,
    ) -> dict[date, dict[str, Any]]:
        feature_history = resolve_price_feature_history(
            token_price_service=self.token_price_service,
            token_symbol=resolved_config.primary_asset,
            start_date=history_start,
            end_date=current_date,
            market_data_requirements=market_data_requirements,
        )
        if not feature_history:
            return {}
        strictly_required_features = set(
            market_data_requirements.required_price_features
        )
        feature_rows: dict[date, dict[str, Any]] = {}
        for feature_name, values_by_date in feature_history.items():
            if (
                current_date not in values_by_date
                and feature_name in strictly_required_features
            ):
                display_name = "DMA-200" if feature_name == "dma_200" else feature_name
                raise ValueError(
                    "Missing current-day "
                    f"{display_name} data for {resolved_config.strategy_id} daily suggestion"
                )
            for snapshot_date, feature_value in values_by_date.items():
                feature_rows.setdefault(snapshot_date, {})[feature_name] = feature_value
        return feature_rows

    def _build_daily_recommendation_input(
        self,
        *,
        buckets: PortfolioBuckets,
        market_data: _DailySuggestionMarketData,
        primary_asset: str,
        runtime_portfolio_mode: RuntimePortfolioMode,
    ) -> DailyRecommendationInput:
        return DailyRecommendationInput(
            current_date=market_data.current_date,
            price=market_data.current_price,
            portfolio=buckets.to_portfolio(
                market_data.current_price,
                price_map=market_data.current_price_map,
                spot_asset=primary_asset,
                runtime_mode=runtime_portfolio_mode,
            ),
            price_history=market_data.price_history,
            sentiment_aggregates=market_data.sentiment_history,
            current_sentiment=market_data.current_sentiment,
            fallback_regime=cast(str, market_data.current_sentiment["label"]),
            fallback_sentiment_value=cast(int, market_data.current_sentiment["value"]),
            price_map=market_data.current_price_map,
            extra_data=market_data.extra_data,
            warmup_extra_data_by_date=market_data.warmup_extra_data_by_date,
            warmup_price_by_date=market_data.warmup_price_by_date,
            warmup_price_map_by_date=market_data.warmup_price_map_by_date,
        )

    def _build_daily_suggestion_response(
        self,
        *,
        preset_config_id: str,
        config_display_name: str,
        strategy_id: StrategyId,
        primary_asset: str,
        runtime_portfolio_mode: RuntimePortfolioMode,
        portfolio_data: _DailySuggestionPortfolioData,
        market_data: _DailySuggestionMarketData,
        action: StrategyAction,
    ) -> DailySuggestionResponse:
        buckets = portfolio_data.buckets
        allocation = buckets.allocation()
        runtime_portfolio = buckets.to_portfolio(
            market_data.current_price,
            price_map=market_data.current_price_map,
            spot_asset=primary_asset,
            runtime_mode=runtime_portfolio_mode,
        )
        market = MarketSnapshot(
            date=market_data.current_date,
            token_price=dict(market_data.current_price_map),
            sentiment=cast(int, market_data.current_sentiment["value"]),
            sentiment_label=cast(str, market_data.current_sentiment["label"]),
        )
        portfolio_asset_allocation = self._resolve_portfolio_asset_allocation(
            buckets=buckets,
            primary_asset=primary_asset,
        )
        portfolio = DailySuggestionPortfolioState(
            spot_usd=buckets.spot_value,
            stable_usd=buckets.stable_value,
            total_value=buckets.total_value,
            total_assets_usd=portfolio_data.total_assets_usd,
            total_debt_usd=portfolio_data.total_debt_usd,
            total_net_usd=portfolio_data.total_net_usd,
            allocation=Allocation(**allocation),
            asset_allocation=portfolio_asset_allocation,
            spot_asset=cast(Any, runtime_portfolio.serializable_spot_asset()),
        )
        serialized = build_strategy_state(
            portfolio=runtime_portfolio,
            price=market_data.current_price_map,
            snapshot=action.snapshot,
        )
        if serialized.signal is None:
            raise ValueError("Daily suggestion serialization missing signal state")
        target_asset_allocation = self._resolve_target_asset_allocation(
            target_allocation=serialized.decision.target_allocation,
            existing_target_asset_allocation=serialized.decision.target_asset_allocation,
            current_asset_allocation=portfolio_asset_allocation,
            primary_asset=primary_asset,
            runtime_portfolio_mode=runtime_portfolio_mode,
        )
        transfers = list(serialized.execution.transfers)
        _execution = serialized.execution
        effective_block_reason = resolve_effective_block_reason(
            blocked_reason=getattr(_execution, "blocked_reason", None),
            diagnostics=getattr(
                getattr(_execution, "diagnostics", None), "plugins", None
            ),
        )

        if transfers:
            action_status = "action_required"
            action_required = True
            action_kind = "rebalance"
            action_reason_code = serialized.decision.reason
        elif effective_block_reason is not None:
            action_status = "blocked"
            action_required = False
            action_kind = None
            action_reason_code = effective_block_reason
        else:
            action_status = "no_action"
            action_required = False
            action_kind = None
            action_reason_code = serialized.decision.reason

        response = DailySuggestionResponse(
            as_of=datetime.now(UTC),
            config_id=preset_config_id,
            config_display_name=config_display_name,
            strategy_id=strategy_id,
            action=DailySuggestionActionState(
                status=cast(Any, action_status),
                required=action_required,
                kind=cast(Any, action_kind),
                reason_code=action_reason_code,
                transfers=transfers,
            ),
            context=DailySuggestionContextState(
                market=market,
                signal=serialized.signal,
                portfolio=portfolio,
                target=DailySuggestionTargetState(
                    allocation=serialized.decision.target_allocation,
                    asset_allocation=target_asset_allocation,
                ),
                strategy=DailySuggestionStrategyContextState(
                    stance=serialized.decision.action,
                    reason_code=serialized.decision.reason,
                    rule_group=serialized.decision.rule_group,
                    details=dict(serialized.decision.details),
                ),
            ),
        )
        response._signal_state = serialized.signal
        response._decision_state = serialized.decision
        response._execution_state = serialized.execution
        return response

    def _seed_trade_history_plugins(
        self,
        *,
        strategy: object,
        user_id: UUID,
        current_date: date,
    ) -> None:
        execution_engine = getattr(strategy, "execution_engine", None)
        plugins = getattr(execution_engine, "plugins", ())
        history_plugins = [
            plugin
            for plugin in plugins
            if isinstance(plugin, TradeHistoryAwareExecutionPlugin)
            and plugin.history_lookback_days > 0
        ]
        if not history_plugins:
            return
        max_lookback = max(plugin.history_lookback_days for plugin in history_plugins)
        start_date = current_date - timedelta(days=max(max_lookback - 1, 0))
        trade_dates = self.trade_history_store.list_trade_dates(
            user_id,
            start_date=start_date,
            end_date=current_date,
        )
        for plugin in history_plugins:
            plugin.load_trade_dates(trade_dates)

    @staticmethod
    def _build_price_map(
        *,
        primary_asset: str,
        primary_price: float,
        feature_row: dict[str, Any],
    ) -> dict[str, float]:
        price_map = {str(primary_asset).strip().lower(): float(primary_price)}
        eth_price = feature_row.get(ETH_USD_PRICE_FEATURE)
        if eth_price is not None:
            price_map["eth"] = float(eth_price)
        return price_map

    @staticmethod
    def _resolve_portfolio_asset_allocation(
        *,
        buckets: PortfolioBuckets,
        primary_asset: str,
    ) -> AssetAllocation:
        current_asset_allocation = buckets.asset_allocation()
        if current_asset_allocation is not None:
            return serialize_asset_allocation(current_asset_allocation)
        return aggregate_to_asset_allocation(
            spot=float(buckets.allocation()["spot"]),
            stable=float(buckets.allocation()["stable"]),
            primary_asset=primary_asset,
        )

    @staticmethod
    def _resolve_target_asset_allocation(
        *,
        target_allocation: Allocation,
        existing_target_asset_allocation: AssetAllocation | None,
        current_asset_allocation: AssetAllocation,
        primary_asset: str,
        runtime_portfolio_mode: RuntimePortfolioMode,
    ) -> AssetAllocation:
        if existing_target_asset_allocation is not None:
            return serialize_target_asset_allocation(
                existing_target_asset_allocation.model_dump(),
                target_spot_asset=primary_asset,
            )
        if runtime_portfolio_mode == "asset":
            return serialize_asset_allocation(current_asset_allocation.model_dump())
        return aggregate_to_asset_allocation(
            spot=float(target_allocation.spot),
            stable=float(target_allocation.stable),
            primary_asset=primary_asset,
        )

    @staticmethod
    def _coerce_portfolio_total(*, value: object, fallback: float) -> float:
        if value is None or isinstance(value, bool):
            return float(fallback)
        if not isinstance(value, (int, float, str, bytes, bytearray)):
            return float(fallback)
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(fallback)


__all__ = [
    "PortfolioBuckets",
    "StrategyDailySuggestionService",
]

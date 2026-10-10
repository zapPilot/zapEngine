"""Backtesting service for the DMA-first framework."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from src.core.cache_service import analytics_cache, build_service_cache_key
from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestPeriodInfo,
    BacktestResponse,
    BacktestWindowInfo,
)
from src.models.market_data_freshness import MarketDataFreshness, StaleFeatureInfo
from src.models.strategy_config import SavedStrategyConfig
from src.models.validation_utils import normalize_asset_symbol
from src.services.backtesting.constants import (
    MODEL_TOTAL_CAPITAL,
    MODEL_WINDOW_DAYS,
    PRIMER_DAYS,
)
from src.services.backtesting.data.data_provider import BacktestDataProvider
from src.services.backtesting.execution.compare import (
    materialize_compare_request,
    run_compare_v3_on_data,
)
from src.services.backtesting.execution.result_cache import (
    CompareResultCache,
    compare_result_key,
)
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategy_registry import (
    ResolvedSavedStrategyConfig,
    resolve_inline_strategy_config,
    resolve_saved_strategy_config,
)
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.backtesting_protocol import ModelReplay
from src.services.strategy.strategy_config_store import StrategyConfigStore

if TYPE_CHECKING:  # pragma: no cover -- type-only import, never executed
    from src.services.market.macro_fear_greed_service import (
        MacroFearGreedDatabaseService,
    )
    from src.services.market.sentiment_database_service import SentimentDatabaseService
    from src.services.market.stock_price_service import StockPriceService
    from src.services.market.token_price_service import TokenPriceService

logger = logging.getLogger(__name__)

# Bump to invalidate cached replays after a change to how the model is replayed.
MODEL_REPLAY_CACHE_VERSION = "v2"
# The model decides once a day, so a short window keeps every user on one replay
# without waiting for a server-side signal that the day's data has landed.
MODEL_REPLAY_CACHE_TTL = timedelta(minutes=10)


def _resolve_date_range(
    start_date: date | None,
    end_date: date | None,
    days: int | None,
    default_days: int = 90,
) -> tuple[date, date]:
    if start_date and end_date:
        return start_date, end_date
    if start_date and days:
        return start_date, start_date + timedelta(days=days)
    if end_date and days:
        return end_date - timedelta(days=days), end_date
    if days:
        today = date.today()
        return today - timedelta(days=days), today
    resolved_end = end_date or date.today()
    resolved_start = start_date or (resolved_end - timedelta(days=default_days))
    return resolved_start, resolved_end


def _adjust_for_sentiment_availability(
    sentiments: dict[date, Any],
    start_date: date,
    end_date: date,
    token_symbol: str,
) -> date:
    if not sentiments:
        return start_date
    sentiment_start = min(sentiments.keys())
    if sentiment_start > start_date:
        if sentiment_start > end_date:
            # Sentiment series doesn't reach the requested window at all — this
            # is a data-pipeline lag, not a malformed request, so map to 503.
            raise MarketDataUnavailableError(
                "Sentiment data starts after the requested end date "
                f"({sentiment_start} > {end_date})",
                missing_assets=[token_symbol],
                oldest_data_date=sentiment_start,
            )
        return sentiment_start
    return start_date


def _resolve_market_data_requirements(
    configs: list[ResolvedSavedStrategyConfig],
) -> MarketDataRequirements:
    requirements = MarketDataRequirements()
    for config in configs:
        requirements = requirements.merge(config.market_data_requirements)
    return requirements


def _resolve_recipe_warmup_days(configs: list[ResolvedSavedStrategyConfig]) -> int:
    recipe_warmup_days = max(config.warmup_lookback_days for config in configs)
    return max(PRIMER_DAYS, recipe_warmup_days)


def _resolve_shared_primary_asset(configs: list[ResolvedSavedStrategyConfig]) -> str:
    primary_assets = sorted(
        {
            normalize_asset_symbol(config.primary_asset, "token_symbol")
            for config in configs
        }
    )
    if len(primary_assets) == 1:
        return primary_assets[0]
    joined = ", ".join(primary_assets)
    raise ValueError(
        "Compare currently supports a single primary asset; "
        f"received recipes for: {joined}"
    )


def _materialize_compare_market_scope_with_store(
    request: BacktestCompareRequestV3,
    *,
    config_store: StrategyConfigStore,
) -> tuple[BacktestCompareRequestV3, list[ResolvedSavedStrategyConfig], str]:
    effective_request = materialize_compare_request(request)
    resolved_configs = [
        _resolve_runtime_config(config, config_store=config_store)
        for config in effective_request.configs
    ]
    primary_asset = _resolve_shared_primary_asset(resolved_configs)
    requested_token_symbol = normalize_asset_symbol(
        effective_request.token_symbol, "token_symbol"
    )
    if requested_token_symbol != primary_asset:
        raise ValueError(
            "token_symbol must match the shared primary asset for this compare request; "
            f"expected '{primary_asset}', got '{requested_token_symbol}'"
        )
    return (
        effective_request.model_copy(update={"token_symbol": primary_asset}),
        resolved_configs,
        primary_asset,
    )


def _resolve_runtime_config(
    request_config: BacktestCompareConfigV3,
    *,
    config_store: StrategyConfigStore,
) -> ResolvedSavedStrategyConfig:
    if request_config.saved_config_id:
        resolved = resolve_saved_strategy_config(
            config_store.resolve_config(request_config.saved_config_id)
        )
        return replace(
            resolved,
            request_config_id=request_config.config_id,
            display_name=request_config.config_id,
        )
    # The request model requires either a saved config or an inline strategy.
    assert request_config.strategy_id is not None
    return resolve_inline_strategy_config(
        config_id=request_config.config_id,
        strategy_id=request_config.strategy_id,
        params=request_config.params,
    )


def _select_prices_in_window(
    prices: list[dict[str, Any]],
    *,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    return [price for price in prices if start_date <= price["date"] <= end_date]


def _has_usable_dma(price_row: dict[str, Any]) -> bool:
    extra_data = price_row.get("extra_data")
    if not isinstance(extra_data, dict):
        return False
    dma_value = extra_data.get("dma_200")
    return isinstance(dma_value, (int, float)) and float(dma_value) > 0.0


def _select_longest_dma_segment(
    prices: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    best_segment: list[dict[str, Any]] = []
    current_segment: list[dict[str, Any]] = []

    for price in prices:
        if _has_usable_dma(price):
            current_segment.append(price)
            is_longer = len(current_segment) > len(best_segment)
            is_same_length_but_later = (
                len(current_segment) == len(best_segment)
                and best_segment
                and current_segment[-1]["date"] > best_segment[-1]["date"]
            )
            if is_longer or is_same_length_but_later:
                best_segment = list(current_segment)
            continue
        current_segment = []

    return best_segment


def _ensure_usable_window(
    condition: bool,
    *,
    token_symbol: str,
    requested_window: BacktestPeriodInfo,
    oldest_data_date: date | None = None,
) -> None:
    if condition:
        return
    # The window-clamp produced an empty range — this indicates a data-pipeline
    # gap (no prices / no DMA segment / sentiment-bound clip), not a malformed
    # request. Map to HTTP 503 so the client can retry rather than seeing 400.
    raise MarketDataUnavailableError(
        "No usable backtest data available for "
        f"{token_symbol} between {requested_window.start_date} and "
        f"{requested_window.end_date} after applying data availability constraints",
        missing_assets=[token_symbol],
        oldest_data_date=oldest_data_date,
    )


@dataclass(frozen=True)
class PreparedBacktestMarketData:
    prices: list[dict[str, Any]]
    sentiments: dict[date, Any]
    requested_window: BacktestPeriodInfo
    effective_window: BacktestPeriodInfo
    user_start_date: date
    data_freshness: MarketDataFreshness | None = None

    @property
    def window(self) -> BacktestWindowInfo:
        return BacktestWindowInfo(
            requested=self.requested_window,
            effective=self.effective_window,
        )


def _build_backtest_freshness(
    *,
    requested_window: BacktestPeriodInfo,
    effective_window: BacktestPeriodInfo,
    token_symbol: str,
) -> MarketDataFreshness:
    """Translate the requested-vs-effective window clamp into freshness metadata.

    For a backtest, "stale" means the user asked for data through `requested_end`
    but the data pipeline only had data through `effective_end`. We report the
    end-date lag (the part the user typically cares about — "did my backtest
    cover the most recent week?") and surface a single generic stale-feature
    entry per asset, since the prepare step doesn't know which underlying
    feature (price/dma/sentiment) ran out first.
    """
    requested_end = requested_window.end_date
    effective_end = effective_window.end_date
    lag_days = max((requested_end - effective_end).days, 0)
    if lag_days <= 0:
        return MarketDataFreshness(
            requested_date=requested_end,
            effective_date=requested_end,
            missing_dates=[],
            stale_features=[],
            max_lag_days=0,
        )
    missing_dates = [effective_end + timedelta(days=i) for i in range(1, lag_days + 1)]
    stale_features = [
        StaleFeatureInfo(
            feature_name="price_history",
            asset=token_symbol,
            requested_date=requested_end,
            effective_date=effective_end,
            lag_days=lag_days,
        )
    ]
    return MarketDataFreshness(
        requested_date=requested_end,
        effective_date=effective_end,
        missing_dates=missing_dates,
        stale_features=stale_features,
        max_lag_days=lag_days,
    )


def _resolve_effective_window_bounds(
    *,
    user_prices: list[dict[str, Any]],
    sentiments: dict[date, Any],
    requested_window: BacktestPeriodInfo,
    requires_sentiment: bool,
    token_symbol: str,
) -> tuple[date, date]:
    sentiment_adjusted_start = requested_window.start_date
    if requires_sentiment:
        sentiment_adjusted_start = _adjust_for_sentiment_availability(
            sentiments,
            requested_window.start_date,
            requested_window.end_date,
            token_symbol=token_symbol,
        )
    return (
        max(user_prices[0]["date"], sentiment_adjusted_start),
        user_prices[-1]["date"],
    )


def _clamp_dma_window(
    *,
    user_prices: list[dict[str, Any]],
    effective_start: date,
    effective_end: date,
    token_symbol: str,
    requested_window: BacktestPeriodInfo,
) -> tuple[date, date]:
    dma_prices = _select_longest_dma_segment(
        _select_prices_in_window(
            user_prices,
            start_date=effective_start,
            end_date=effective_end,
        )
    )
    _ensure_usable_window(
        bool(dma_prices),
        token_symbol=token_symbol,
        requested_window=requested_window,
        oldest_data_date=user_prices[0]["date"] if user_prices else None,
    )
    return (
        max(effective_start, dma_prices[0]["date"]),
        min(effective_end, dma_prices[-1]["date"]),
    )


@dataclass(frozen=True)
class _CompareOutcome:
    response: BacktestResponse
    resolved_configs: list[ResolvedSavedStrategyConfig]


def _config_fingerprint(saved_config: SavedStrategyConfig) -> str:
    """Stable digest of everything that can change what a saved config does."""
    payload = json.dumps(
        saved_config.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


class BacktestingService:
    def __init__(
        self,
        token_price_service: TokenPriceService,
        sentiment_service: SentimentDatabaseService,
        strategy_config_store: StrategyConfigStore | None = None,
        stock_price_service: StockPriceService | None = None,
        macro_fear_greed_service: MacroFearGreedDatabaseService | None = None,
        result_cache: CompareResultCache | None = None,
    ):
        self.result_cache = result_cache or CompareResultCache()
        self.data_provider = BacktestDataProvider(
            token_price_service=token_price_service,
            sentiment_service=sentiment_service,
            stock_price_service=stock_price_service,
            macro_fear_greed_service=macro_fear_greed_service,
        )
        self.strategy_config_store = strategy_config_store or StrategyConfigStore()

    def _run_with_prepared_data(
        self,
        *,
        request: BacktestCompareRequestV3,
        resolved_configs: list[ResolvedSavedStrategyConfig],
        runner: Callable[..., BacktestResponse],
    ) -> BacktestResponse:
        prepared = self.prepare_market_window(
            resolved_configs=resolved_configs,
            token_symbol=request.token_symbol,
            start_date=request.start_date,
            end_date=request.end_date,
            days=request.days,
        )
        window = prepared.window
        if window.truncated:
            logger.info(
                "backtest_window_truncated",
                extra={
                    "token_symbol": request.token_symbol,
                    "requested_start_date": window.requested.start_date.isoformat(),
                    "requested_end_date": window.requested.end_date.isoformat(),
                    "effective_start_date": window.effective.start_date.isoformat(),
                    "effective_end_date": window.effective.end_date.isoformat(),
                },
            )

        def compute() -> BacktestResponse:
            return runner(
                prices=prepared.prices,
                sentiments=prepared.sentiments,
                request=request,
                user_start_date=prepared.user_start_date,
                resolved_configs=resolved_configs,
                window=window,
            )

        response = self.result_cache.get_or_compute(
            compare_result_key(
                request,
                resolved_configs,
                prepared.prices,
                prepared.sentiments,
                window,
            ),
            compute,
        )
        # The runner doesn't know about freshness — patch it in here so the
        # downstream consumer (frontend) sees a single end-to-end response.
        # `model_copy` is preferred over mutation because BacktestResponse may
        # be frozen by Pydantic depending on config.
        if prepared.data_freshness is not None:
            response = response.model_copy(
                update={"data_freshness": prepared.data_freshness}
            )
        return response

    def prepare_market_window(
        self,
        *,
        resolved_configs: list[ResolvedSavedStrategyConfig],
        token_symbol: str,
        start_date: date | None,
        end_date: date | None,
        days: int | None,
    ) -> PreparedBacktestMarketData:
        resolved_start, resolved_end = _resolve_date_range(start_date, end_date, days)
        requested_window = BacktestPeriodInfo(
            start_date=resolved_start,
            end_date=resolved_end,
            days=max((resolved_end - resolved_start).days, 0),
        )
        warmup_days = _resolve_recipe_warmup_days(resolved_configs)
        fetch_start_date = requested_window.start_date - timedelta(days=warmup_days)
        market_data_requirements = _resolve_market_data_requirements(resolved_configs)
        prices = self.data_provider.fetch_token_prices(
            token_symbol,
            fetch_start_date,
            requested_window.end_date,
            market_data_requirements=market_data_requirements,
        )
        if not prices:
            # Fetch returned zero rows for the entire warmup+request span — the
            # data pipeline simply has nothing for this asset. Map to 503 so
            # clients can retry rather than seeing 400 (which would suggest the
            # request itself was malformed).
            raise MarketDataUnavailableError(
                f"No price data available for {token_symbol} between "
                f"{fetch_start_date} and {requested_window.end_date}",
                missing_assets=[token_symbol],
                oldest_data_date=None,
            )
        sentiments = (
            self.data_provider.fetch_sentiments(
                fetch_start_date,
                requested_window.end_date,
            )
            if market_data_requirements.requires_sentiment
            else {}
        )
        user_prices = _select_prices_in_window(
            prices,
            start_date=requested_window.start_date,
            end_date=requested_window.end_date,
        )
        _ensure_usable_window(
            bool(user_prices),
            token_symbol=token_symbol,
            requested_window=requested_window,
            oldest_data_date=prices[0]["date"] if prices else None,
        )
        effective_start, effective_end = _resolve_effective_window_bounds(
            user_prices=user_prices,
            sentiments=sentiments,
            requested_window=requested_window,
            requires_sentiment=market_data_requirements.requires_sentiment,
            token_symbol=token_symbol,
        )

        if market_data_requirements.require_dma_200:
            effective_start, effective_end = _clamp_dma_window(
                user_prices=user_prices,
                effective_start=effective_start,
                effective_end=effective_end,
                token_symbol=token_symbol,
                requested_window=requested_window,
            )
        _ensure_usable_window(
            effective_start <= effective_end,
            token_symbol=token_symbol,
            requested_window=requested_window,
            oldest_data_date=user_prices[0]["date"] if user_prices else None,
        )
        clamped_prices = _select_prices_in_window(
            prices,
            start_date=fetch_start_date,
            end_date=effective_end,
        )
        _ensure_usable_window(
            any(price["date"] >= effective_start for price in clamped_prices),
            token_symbol=token_symbol,
            requested_window=requested_window,
            oldest_data_date=user_prices[0]["date"] if user_prices else None,
        )

        effective_window = BacktestPeriodInfo(
            start_date=effective_start,
            end_date=effective_end,
            days=max((effective_end - effective_start).days, 0),
        )
        data_freshness = _build_backtest_freshness(
            requested_window=requested_window,
            effective_window=effective_window,
            token_symbol=token_symbol,
        )

        return PreparedBacktestMarketData(
            prices=clamped_prices,
            sentiments=sentiments,
            requested_window=requested_window,
            effective_window=effective_window,
            user_start_date=effective_start,
            data_freshness=data_freshness,
        )

    def _compare(self, request: BacktestCompareRequestV3) -> _CompareOutcome:
        effective_request, resolved_configs, _primary_asset = (
            _materialize_compare_market_scope_with_store(
                request,
                config_store=self.strategy_config_store,
            )
        )
        response = self._run_with_prepared_data(
            request=effective_request,
            resolved_configs=resolved_configs,
            runner=run_compare_v3_on_data,
        )
        return _CompareOutcome(response=response, resolved_configs=resolved_configs)

    def run_compare_v3(self, request: BacktestCompareRequestV3) -> BacktestResponse:
        return self._compare(request).response

    def replay_model(self, saved_config_id: str, requested_end: date) -> ModelReplay:
        """Replay a saved config over the model window and return its last bar.

        Runs the same compare path the API and the published snapshot use, over
        ``MODEL_WINDOW_DAYS`` days ending at ``requested_end``. The replay does
        not depend on any user, so one cached run serves everyone.
        """
        saved_config = self.strategy_config_store.resolve_config(saved_config_id)
        cache_key = build_service_cache_key(
            self.__class__.__name__,
            MODEL_REPLAY_CACHE_VERSION,
            saved_config.config_id,
            _config_fingerprint(saved_config),
            requested_end.isoformat(),
        )
        return analytics_cache.get_or_compute(
            cache_key,
            lambda: self._replay_model(saved_config, requested_end),
            ttl=MODEL_REPLAY_CACHE_TTL,
        )

    def _replay_model(
        self,
        saved_config: SavedStrategyConfig,
        requested_end: date,
    ) -> ModelReplay:
        config_id = saved_config.config_id
        outcome = self._compare(
            BacktestCompareRequestV3(
                token_symbol=saved_config.primary_asset,
                start_date=requested_end - timedelta(days=MODEL_WINDOW_DAYS - 1),
                end_date=requested_end,
                total_capital=MODEL_TOTAL_CAPITAL,
                configs=[
                    BacktestCompareConfigV3(
                        config_id=config_id,
                        saved_config_id=config_id,
                    )
                ],
            ),
        )
        response = outcome.response
        window = response.window
        assert window is not None
        resolved = outcome.resolved_configs[0]
        max_lag_days = resolved.market_data_requirements.max_lag_days
        effective_end = window.effective.end_date
        if (requested_end - effective_end).days > max_lag_days:
            raise MarketDataUnavailableError(
                f"Market data lag exceeds {max_lag_days}-day tolerance "
                f"for {resolved.strategy_id}",
                missing_assets=[resolved.primary_asset],
                # The newest date the data does reach, i.e. where it went stale.
                oldest_data_date=effective_end,
            )
        last_point = response.timeline[-1]
        return ModelReplay(
            config_id=config_id,
            window=window,
            data_freshness=response.data_freshness,
            market=last_point.market,
            state=last_point.strategies[config_id],
        )

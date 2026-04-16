"""Backtesting service for the DMA-first framework."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from src.models.backtesting import (
    BacktestCompareRequestV3,
    BacktestPeriodInfo,
    BacktestResponse,
    BacktestWindowInfo,
)
from src.models.validation_utils import normalize_asset_symbol
from src.services.backtesting.composition import (
    ResolvedSavedStrategyConfig,
    resolve_compare_request_config,
    resolve_saved_strategy_config,
)
from src.services.backtesting.composition_catalog import (
    CompositionCatalog,
    get_default_composition_catalog,
)
from src.services.backtesting.constants import PRIMER_DAYS
from src.services.backtesting.data.data_provider import BacktestDataProvider
from src.services.backtesting.execution.compare import (
    materialize_compare_request,
    run_compare_v3_on_data,
)
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategy_registry import get_strategy_recipe
from src.services.strategy.strategy_config_store import (
    SeedStrategyConfigStore,
    StrategyConfigStore,
)

if TYPE_CHECKING:  # pragma: no cover
    from src.services.interfaces import (
        SentimentDatabaseServiceProtocol,
        TokenPriceServiceProtocol,
    )

logger = logging.getLogger(__name__)


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
) -> date:
    if not sentiments:
        return start_date
    sentiment_start = min(sentiments.keys())
    if sentiment_start > start_date:
        if sentiment_start > end_date:
            raise ValueError("Sentiment data starts after the requested end date")
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
    composition_catalog: CompositionCatalog | None = None,
) -> tuple[BacktestCompareRequestV3, list[ResolvedSavedStrategyConfig], str]:
    effective_request = materialize_compare_request(request)
    resolved_configs = [
        _resolve_runtime_config(
            config,
            config_store=config_store,
            composition_catalog=composition_catalog,
        )
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
    request_config: Any,
    *,
    config_store: StrategyConfigStore,
    composition_catalog: CompositionCatalog | None = None,
) -> ResolvedSavedStrategyConfig:
    resolved_catalog = composition_catalog or get_default_composition_catalog()
    if _has_composition_path(request_config, resolved_catalog):
        resolved = resolve_saved_strategy_config(
            resolve_compare_request_config(
                request_config,
                resolve_saved_config=config_store.resolve_config,
                catalog=resolved_catalog,
            ),
            catalog=resolved_catalog,
        )
        return replace(
            resolved,
            request_config_id=request_config.config_id,
        )
    recipe = get_strategy_recipe(request_config.strategy_id)
    return ResolvedSavedStrategyConfig(
        saved_config_id=request_config.config_id,
        request_config_id=request_config.config_id,
        strategy_id=recipe.strategy_id,
        display_name=request_config.config_id,
        description=recipe.description,
        primary_asset=recipe.primary_asset,
        summary_signal_id=recipe.signal_id,
        warmup_lookback_days=recipe.warmup_lookback_days,
        market_data_requirements=recipe.market_data_requirements,
        portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
        runtime_portfolio_mode=recipe.runtime_portfolio_mode,
        supports_daily_suggestion=recipe.supports_daily_suggestion,
        public_params=dict(request_config.params),
        build_strategy=recipe.build_strategy,
    )


def _has_composition_path(
    request_config: Any,
    catalog: CompositionCatalog,
) -> bool:
    """Check whether this request config should be resolved via the composition catalog."""
    if request_config.saved_config_id:
        return True
    if request_config.strategy_id is None:
        return False
    try:
        family = catalog.resolve_family(request_config.strategy_id)
    except ValueError:
        return False
    return family.legacy_saved_config_builder is not None


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
) -> None:
    if condition:
        return
    raise ValueError(
        "No usable backtest data available for "
        f"{token_symbol} between {requested_window.start_date} and {requested_window.end_date} "
        "after applying data availability constraints"
    )


@dataclass(frozen=True)
class PreparedBacktestMarketData:
    prices: list[dict[str, Any]]
    sentiments: dict[date, Any]
    requested_window: BacktestPeriodInfo
    effective_window: BacktestPeriodInfo
    user_start_date: date

    @property
    def window(self) -> BacktestWindowInfo:
        return BacktestWindowInfo(
            requested=self.requested_window,
            effective=self.effective_window,
        )


def _resolve_effective_window_bounds(
    *,
    user_prices: list[dict[str, Any]],
    sentiments: dict[date, Any],
    requested_window: BacktestPeriodInfo,
    requires_sentiment: bool,
) -> tuple[date, date]:
    sentiment_adjusted_start = requested_window.start_date
    if requires_sentiment:
        sentiment_adjusted_start = _adjust_for_sentiment_availability(
            sentiments,
            requested_window.start_date,
            requested_window.end_date,
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
    )
    return (
        max(effective_start, dma_prices[0]["date"]),
        min(effective_end, dma_prices[-1]["date"]),
    )


class BacktestingService:
    def __init__(
        self,
        db: Session,
        token_price_service: TokenPriceServiceProtocol,
        sentiment_service: SentimentDatabaseServiceProtocol,
        strategy_config_store: StrategyConfigStore | None = None,
        composition_catalog: CompositionCatalog | None = None,
    ):
        self.data_provider = BacktestDataProvider(
            token_price_service=token_price_service,
            sentiment_service=sentiment_service,
        )
        self.strategy_config_store = strategy_config_store or (
            StrategyConfigStore(db) if db is not None else SeedStrategyConfigStore()
        )
        self.composition_catalog = (
            composition_catalog or get_default_composition_catalog()
        )

    async def _run_with_prepared_data(
        self,
        *,
        request: BacktestCompareRequestV3,
        resolved_configs: list[ResolvedSavedStrategyConfig],
        runner: Callable[..., BacktestResponse],
        config: RegimeConfig | None,
    ) -> BacktestResponse:
        prepared = await self._prepare_market_data(
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
        return runner(
            prices=prepared.prices,
            sentiments=prepared.sentiments,
            request=request,
            user_start_date=prepared.user_start_date,
            resolved_configs=resolved_configs,
            window=window,
            config=config,
        )

    async def _prepare_market_data(
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
        prices = await self.data_provider.fetch_token_prices(
            token_symbol,
            fetch_start_date,
            requested_window.end_date,
            market_data_requirements=market_data_requirements,
        )
        if not prices:
            raise ValueError(
                f"No price data available for {token_symbol} between {fetch_start_date} and {requested_window.end_date}"
            )
        sentiments = (
            await self.data_provider.fetch_sentiments(
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
        )
        effective_start, effective_end = _resolve_effective_window_bounds(
            user_prices=user_prices,
            sentiments=sentiments,
            requested_window=requested_window,
            requires_sentiment=market_data_requirements.requires_sentiment,
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
        )

        return PreparedBacktestMarketData(
            prices=clamped_prices,
            sentiments=sentiments,
            requested_window=requested_window,
            effective_window=BacktestPeriodInfo(
                start_date=effective_start,
                end_date=effective_end,
                days=max((effective_end - effective_start).days, 0),
            ),
            user_start_date=effective_start,
        )

    async def run_compare_v3(
        self, request: BacktestCompareRequestV3, config: RegimeConfig | None = None
    ) -> BacktestResponse:
        effective_request, resolved_configs, _primary_asset = (
            _materialize_compare_market_scope_with_store(
                request,
                config_store=self.strategy_config_store,
                composition_catalog=self.composition_catalog,
            )
        )
        return await self._run_with_prepared_data(
            request=effective_request,
            resolved_configs=resolved_configs,
            runner=run_compare_v3_on_data,
            config=config,
        )

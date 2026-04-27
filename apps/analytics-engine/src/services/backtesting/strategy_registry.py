"""Internal strategy recipe registry for backtesting composition."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal, cast

from src.services.backtesting.capabilities import (
    PortfolioBucketMapper,
    RuntimePortfolioMode,
    map_portfolio_to_eth_btc_stable_buckets,
    map_portfolio_to_spy_eth_btc_stable_buckets,
    map_portfolio_to_two_buckets,
)
from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_ROTATION,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_AUX_SERIES,
    MarketDataRequirements,
)
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiParams,
    DmaGatedFgiStrategy,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRotationParams,
    EthBtcRotationStrategy,
    build_initial_eth_btc_asset_allocation,
)
from src.services.backtesting.strategies.spy_eth_btc_rotation import (
    SpyEthBtcRotationParams,
    SpyEthBtcRotationStrategy,
)

StrategyBuildMode = Literal["compare", "daily_suggestion"]
PublicParamNormalizer = Callable[[dict[str, Any]], dict[str, Any]]
StrategyBuilder = Callable[["StrategyBuildRequest"], BaseStrategy]


@dataclass(frozen=True)
class StrategyBuildRequest:
    mode: StrategyBuildMode
    total_capital: float
    params: dict[str, Any] = field(default_factory=dict)
    config_id: str | None = None
    user_prices: list[dict[str, Any]] = field(default_factory=list)
    initial_allocation: dict[str, float] | None = None
    user_start_date: date | None = None

    @property
    def resolved_config_id(self) -> str:
        return self.config_id or ""


def _normalize_dca_params(params: dict[str, Any]) -> dict[str, Any]:
    if params:
        raise ValueError("dca_classic does not accept params")
    return {}


def _normalize_dma_public_params(params: dict[str, Any]) -> dict[str, Any]:
    return DmaGatedFgiParams.from_public_params(params).to_public_params()


def _normalize_eth_btc_rotation_public_params(params: dict[str, Any]) -> dict[str, Any]:
    return EthBtcRotationParams.from_public_params(params).to_public_params()


def _normalize_spy_eth_btc_rotation_public_params(
    params: dict[str, Any],
) -> dict[str, Any]:
    return SpyEthBtcRotationParams.from_public_params(params).to_public_params()


@dataclass(frozen=True)
class StrategyRecipe:
    strategy_id: str
    display_name: str
    description: str
    signal_id: str | None
    primary_asset: str
    warmup_lookback_days: int
    market_data_requirements: MarketDataRequirements
    portfolio_bucket_mapper: PortfolioBucketMapper
    normalize_public_params: PublicParamNormalizer
    build_strategy: StrategyBuilder
    runtime_portfolio_mode: RuntimePortfolioMode = "aggregate"
    supports_daily_suggestion: bool = False


def _require_compare_mode(request: StrategyBuildRequest) -> None:
    if request.mode != "compare":
        raise ValueError("This strategy does not support daily suggestion")


def _require_compare_runtime_inputs(request: StrategyBuildRequest) -> None:
    if request.initial_allocation is None or request.user_start_date is None:
        raise ValueError(
            "Compare strategy build requires initial allocation and start date"
        )


def _build_dca_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    _require_compare_mode(request)
    _require_compare_runtime_inputs(request)
    assert request.initial_allocation is not None
    assert request.user_start_date is not None
    return DcaClassicStrategy(
        total_days=len(request.user_prices),
        total_capital=request.total_capital,
        initial_allocation=request.initial_allocation,
        user_start_date=request.user_start_date,
        strategy_id=request.resolved_config_id or STRATEGY_DCA_CLASSIC,
        display_name=request.resolved_config_id or STRATEGY_DCA_CLASSIC,
    )


def _build_dma_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    params = DmaGatedFgiParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_DMA_GATED_FGI
    return DmaGatedFgiStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
    )


def _build_eth_btc_rotation_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    params = EthBtcRotationParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_ETH_BTC_ROTATION
    initial_asset_allocation = None
    if request.mode == "compare" and request.initial_allocation is not None:
        first_price_row = request.user_prices[0] if request.user_prices else {}
        initial_asset_allocation = build_initial_eth_btc_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            extra_data=cast(
                Mapping[str, Any] | None,
                first_price_row.get("extra_data"),
            ),
            params=params,
        )
    return EthBtcRotationStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


def _build_spy_eth_btc_rotation_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    params = SpyEthBtcRotationParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_SPY_ETH_BTC_ROTATION
    initial_asset_allocation = None
    if request.mode == "compare" and request.initial_allocation is not None:
        first_price_row = request.user_prices[0] if request.user_prices else {}
        crypto_initial = build_initial_eth_btc_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            extra_data=cast(
                Mapping[str, Any] | None,
                first_price_row.get("extra_data"),
            ),
            params=params,
        )
        initial_asset_allocation = {**crypto_initial, "spy": 0.0}
    return SpyEthBtcRotationStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


_RECIPES: dict[str, StrategyRecipe] = {
    STRATEGY_DCA_CLASSIC: StrategyRecipe(
        strategy_id=STRATEGY_DCA_CLASSIC,
        display_name="DCA Classic",
        description="Baseline: deploy stables into spot evenly across the simulation.",
        signal_id=None,
        primary_asset="BTC",
        warmup_lookback_days=0,
        # DCA decisions are price-only and immediate — tolerate at most 1 day of
        # staleness so we don't deploy capital based on yesterday's price quote.
        market_data_requirements=MarketDataRequirements(max_lag_days=1),
        portfolio_bucket_mapper=map_portfolio_to_two_buckets,
        runtime_portfolio_mode="aggregate",
        normalize_public_params=_normalize_dca_params,
        build_strategy=_build_dca_strategy,
        supports_daily_suggestion=False,
    ),
    STRATEGY_DMA_GATED_FGI: StrategyRecipe(
        strategy_id=STRATEGY_DMA_GATED_FGI,
        display_name="DMA Gated FGI",
        description="DMA-first rebalancing recipe using market-state extraction, allocation policy, and shared execution.",
        signal_id="dma_gated_fgi",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            # FGI sentiment can shift quickly — cap forward-fill at 2 days so a
            # stale "Greed" reading doesn't override a fresh "Fear" turn.
            max_lag_days=2,
        ),
        portfolio_bucket_mapper=map_portfolio_to_two_buckets,
        runtime_portfolio_mode="aggregate",
        normalize_public_params=_normalize_dma_public_params,
        build_strategy=_build_dma_strategy,
        supports_daily_suggestion=True,
    ),
    STRATEGY_ETH_BTC_ROTATION: StrategyRecipe(
        strategy_id=STRATEGY_ETH_BTC_ROTATION,
        display_name="ETH/BTC Relative Strength Rotation",
        description="Use DMA/FGI stable gating and split risk-on exposure between BTC and ETH via ETH/BTC relative strength.",
        signal_id="eth_btc_rs_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
            # DMA-200 is a long-term smoothing indicator — week-level lag barely
            # moves the signal, so we tolerate a full week of forward-fill.
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_eth_btc_rotation_public_params,
        build_strategy=_build_eth_btc_rotation_strategy,
        supports_daily_suggestion=True,
    ),
    STRATEGY_SPY_ETH_BTC_ROTATION: StrategyRecipe(
        strategy_id=STRATEGY_SPY_ETH_BTC_ROTATION,
        display_name="SPY/ETH/BTC Multi-Asset Rotation",
        description="Add SPY (S&P 500) as a fourth bucket alongside BTC/ETH/stable; SPY uses DMA-only gating with a neutral FGI placeholder until S&P-500 sentiment is available.",
        signal_id="spy_eth_btc_rs_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset(
                {ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES, SPY_AUX_SERIES}
            ),
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_spy_eth_btc_rotation_public_params,
        build_strategy=_build_spy_eth_btc_rotation_strategy,
        supports_daily_suggestion=True,
    ),
}


def get_strategy_recipe(strategy_id: str) -> StrategyRecipe:
    try:
        return _RECIPES[strategy_id]
    except KeyError as exc:  # pragma: no cover - validated upstream
        raise ValueError(f"Unknown strategy_id '{strategy_id}'") from exc


def list_strategy_recipes() -> list[StrategyRecipe]:
    return list(_RECIPES.values())


def validate_strategy_id(strategy_id: str) -> str:
    get_strategy_recipe(strategy_id)
    return strategy_id

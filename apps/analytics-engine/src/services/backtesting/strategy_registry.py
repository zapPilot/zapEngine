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
)
from src.services.backtesting.constants import STRATEGY_ETH_BTC_ROTATION
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_AUX_SERIES,
    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_DMA_200_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaFgiPortfolioRulesStrategy,
    build_initial_portfolio_rules_asset_allocation,
)
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRotationParams,
    EthBtcRotationStrategy,
    build_initial_eth_btc_asset_allocation,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    HIERARCHICAL_ATTRIBUTION_VARIANTS,
)
from src.services.backtesting.strategies.hierarchical_minimum import (
    MINIMUM_HIERARCHICAL_VARIANTS,
    HierarchicalMinimumStrategy,
)
from src.services.backtesting.strategies.pair_rotation_template import (
    ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    build_initial_pair_asset_allocation,
)
from src.services.backtesting.strategies.portfolio_rules_attribution import (
    PORTFOLIO_RULES_ATTRIBUTION_VARIANTS,
)
from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
    SPY_CRYPTO_TEMPLATE,
    HierarchicalPairRotationParams,
    HierarchicalSpyCryptoRotationStrategy,
)

StrategyBuildMode = Literal["compare", "daily_suggestion"]
PublicParamNormalizer = Callable[[dict[str, Any]], dict[str, Any]]
StrategyBuilder = Callable[["StrategyBuildRequest"], BaseStrategy]
InitialAllocationBuilder = Callable[..., dict[str, float]]


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


def _require_compare_mode(request: StrategyBuildRequest) -> None:
    if request.mode != "compare":
        raise ValueError("This strategy does not support daily suggestion mode")


def _require_compare_runtime_inputs(request: StrategyBuildRequest) -> None:
    _require_compare_mode(request)
    if request.initial_allocation is None or request.user_start_date is None:
        raise ValueError(
            "Compare strategy build requires initial allocation and start date"
        )


def _normalize_dma_public_params(params: dict[str, Any]) -> dict[str, Any]:
    return DmaGatedFgiParams.from_public_params(params).to_public_params()


def _normalize_eth_btc_rotation_public_params(params: dict[str, Any]) -> dict[str, Any]:
    return EthBtcRotationParams.from_public_params(params).to_public_params()


def _normalize_hierarchical_spy_crypto_public_params(
    params: dict[str, Any],
) -> dict[str, Any]:
    return HierarchicalPairRotationParams.from_public_params(params).to_public_params()


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
    deprecated: bool = False
    deprecation_note: str | None = None


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


def _first_price_row(request: StrategyBuildRequest) -> dict[str, Any]:
    return request.user_prices[0] if request.user_prices else {}


def _build_compare_price_row_initial_asset_allocation(
    request: StrategyBuildRequest,
    builder: InitialAllocationBuilder,
) -> dict[str, float] | None:
    _require_compare_runtime_inputs(request)
    assert request.initial_allocation is not None
    first_price_row = _first_price_row(request)
    return builder(
        aggregate_allocation=request.initial_allocation,
        extra_data=cast(Mapping[str, Any] | None, first_price_row.get("extra_data")),
        price_map=cast(Mapping[str, float] | None, first_price_row.get("prices")),
        primary_price=(
            float(first_price_row["price"])
            if isinstance(first_price_row.get("price"), int | float)
            else None
        ),
    )


def _build_portfolio_rules_strategy(
    request: StrategyBuildRequest,
    *,
    variant_id: str,
) -> BaseStrategy:
    params = DmaGatedFgiParams.from_public_params(request.params)
    variant = PORTFOLIO_RULES_ATTRIBUTION_VARIANTS[variant_id]
    strategy_id = request.resolved_config_id or variant_id
    return DmaFgiPortfolioRulesStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        canonical_strategy_id=variant_id,
        disabled_rules=variant.disabled_rules,
        initial_asset_allocation=_build_compare_price_row_initial_asset_allocation(
            request,
            build_initial_portfolio_rules_asset_allocation,
        ),
    )


def _make_portfolio_rules_builder(variant_id: str) -> StrategyBuilder:
    def _builder(request: StrategyBuildRequest) -> BaseStrategy:
        return _build_portfolio_rules_strategy(
            request,
            variant_id=variant_id,
        )

    return _builder


def _build_initial_hierarchical_asset_allocation(
    request: StrategyBuildRequest,
) -> dict[str, float]:
    _require_compare_runtime_inputs(request)
    assert request.initial_allocation is not None
    outer_initial = build_initial_pair_asset_allocation(
        aggregate_allocation=request.initial_allocation,
        template=SPY_CRYPTO_TEMPLATE,
    )
    inner_initial = build_initial_pair_asset_allocation(
        aggregate_allocation=request.initial_allocation,
        template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    )
    crypto_share = float(outer_initial.get("btc", 0.0)) + float(
        outer_initial.get("eth", 0.0)
    )
    inner_risk = float(inner_initial.get("btc", 0.0)) + float(
        inner_initial.get("eth", 0.0)
    )
    btc_weight = (
        0.5 if inner_risk <= 0.0 else float(inner_initial.get("btc", 0.0)) / inner_risk
    )
    return {
        "btc": crypto_share * btc_weight,
        "eth": crypto_share * (1.0 - btc_weight),
        "spy": float(outer_initial.get("spy", 0.0)),
        "stable": float(outer_initial.get("stable", 0.0)),
        "alt": 0.0,
    }


def _build_hierarchical_attribution_strategy(
    request: StrategyBuildRequest,
    *,
    variant_id: str,
) -> BaseStrategy:
    params = HierarchicalPairRotationParams.from_public_params(request.params)
    variant = HIERARCHICAL_ATTRIBUTION_VARIANTS[variant_id]
    strategy_id = request.resolved_config_id or variant_id
    return HierarchicalSpyCryptoRotationStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        canonical_strategy_id=variant_id,
        initial_asset_allocation=_build_initial_hierarchical_asset_allocation(request),
        adaptive_crypto_dma_reference=variant.adaptive_crypto_dma_reference,
        spy_cross_up_latch=variant.spy_cross_up_latch,
        outer_disabled_rules=variant.disabled_rules,
        inner_disabled_rules=variant.disabled_rules - frozenset({"above_greed_sell"}),
        dma_buy_strength_floor=variant.dma_buy_strength_floor,
    )


def _make_hierarchical_attribution_builder(variant_id: str) -> StrategyBuilder:
    def _builder(request: StrategyBuildRequest) -> BaseStrategy:
        return _build_hierarchical_attribution_strategy(
            request,
            variant_id=variant_id,
        )

    return _builder


def _eth_btc_relative_strength_requirements() -> MarketDataRequirements:
    return MarketDataRequirements(
        requires_sentiment=True,
        required_price_features=frozenset({DMA_200_FEATURE}),
        required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
        max_lag_days=7,
    )


def _spy_eth_btc_asset_requirements(
    *,
    requires_macro_fear_greed: bool,
) -> MarketDataRequirements:
    return MarketDataRequirements(
        requires_sentiment=True,
        requires_macro_fear_greed=requires_macro_fear_greed,
        required_price_features=frozenset(
            {DMA_200_FEATURE, ETH_DMA_200_FEATURE, SPY_DMA_200_FEATURE}
        ),
        required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
        max_lag_days=7,
    )


def _hierarchical_pair_requirements() -> MarketDataRequirements:
    return MarketDataRequirements(
        requires_sentiment=True,
        requires_macro_fear_greed=True,
        required_price_features=frozenset({DMA_200_FEATURE}),
        required_aux_series=frozenset(
            {
                ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
                SPY_AUX_SERIES,
                SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
            }
        ),
        max_lag_days=7,
    )


def _build_hierarchical_attribution_recipe(strategy_id: str) -> StrategyRecipe:
    variant = HIERARCHICAL_ATTRIBUTION_VARIANTS[strategy_id]
    return StrategyRecipe(
        strategy_id=strategy_id,
        display_name=variant.display_name,
        description=variant.description,
        signal_id=SPY_CRYPTO_TEMPLATE.signal_id,
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=_hierarchical_pair_requirements(),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_hierarchical_spy_crypto_public_params,
        build_strategy=_make_hierarchical_attribution_builder(strategy_id),
        supports_daily_suggestion=False,
    )


def _build_hierarchical_minimum_strategy(
    request: StrategyBuildRequest,
    *,
    variant_id: str,
) -> BaseStrategy:
    params = HierarchicalPairRotationParams.from_public_params(
        request.params
    ).model_copy(update={"rotation_cooldown_days": 7})
    variant = MINIMUM_HIERARCHICAL_VARIANTS[variant_id]
    strategy_id = request.resolved_config_id or variant_id
    return HierarchicalMinimumStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        canonical_strategy_id=variant_id,
        initial_asset_allocation=_build_initial_hierarchical_asset_allocation(request),
        outer_policy=variant.outer_policy,
        composer=variant.composer,
    )


def _make_hierarchical_minimum_builder(variant_id: str) -> StrategyBuilder:
    def _builder(request: StrategyBuildRequest) -> BaseStrategy:
        return _build_hierarchical_minimum_strategy(
            request,
            variant_id=variant_id,
        )

    return _builder


def _build_hierarchical_minimum_recipe(strategy_id: str) -> StrategyRecipe:
    variant = MINIMUM_HIERARCHICAL_VARIANTS[strategy_id]
    return StrategyRecipe(
        strategy_id=strategy_id,
        display_name=variant.display_name,
        description=variant.description,
        signal_id=SPY_CRYPTO_TEMPLATE.signal_id,
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=_hierarchical_pair_requirements(),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_hierarchical_spy_crypto_public_params,
        build_strategy=_make_hierarchical_minimum_builder(strategy_id),
        supports_daily_suggestion=False,
    )


def _build_portfolio_rules_recipe(strategy_id: str) -> StrategyRecipe:
    variant = PORTFOLIO_RULES_ATTRIBUTION_VARIANTS[strategy_id]
    return StrategyRecipe(
        strategy_id=strategy_id,
        display_name=variant.display_name,
        description=variant.description,
        signal_id="dma_fgi_portfolio_rules_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=_spy_eth_btc_asset_requirements(
            requires_macro_fear_greed=True,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_dma_public_params,
        build_strategy=_make_portfolio_rules_builder(strategy_id),
        supports_daily_suggestion=False,
    )


_RECIPES: dict[str, StrategyRecipe] = {
    STRATEGY_ETH_BTC_ROTATION: StrategyRecipe(
        strategy_id=STRATEGY_ETH_BTC_ROTATION,
        display_name="ETH/BTC Relative Strength Rotation",
        description="Use DMA/FGI stable gating and split risk-on exposure between BTC and ETH via ETH/BTC relative strength.",
        signal_id="eth_btc_rs_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=_eth_btc_relative_strength_requirements(),
        portfolio_bucket_mapper=map_portfolio_to_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_eth_btc_rotation_public_params,
        build_strategy=_build_eth_btc_rotation_strategy,
        supports_daily_suggestion=True,
    ),
    **{
        strategy_id: _build_portfolio_rules_recipe(strategy_id)
        for strategy_id in PORTFOLIO_RULES_ATTRIBUTION_VARIANTS
    },
    **{
        strategy_id: _build_hierarchical_attribution_recipe(strategy_id)
        for strategy_id in HIERARCHICAL_ATTRIBUTION_VARIANTS
    },
    **{
        strategy_id: _build_hierarchical_minimum_recipe(strategy_id)
        for strategy_id in MINIMUM_HIERARCHICAL_VARIANTS
    },
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

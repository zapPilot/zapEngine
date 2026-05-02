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
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM,
    STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY,
    STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH,
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO,
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_ROTATION,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_AUX_SERIES,
    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    MarketDataRequirements,
)
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiParams,
    DmaGatedFgiStrategy,
)
from src.services.backtesting.strategies.eth_btc_attribution import (
    ATTRIBUTION_VARIANTS,
    EthBtcAttributionStrategy,
    build_initial_attribution_asset_allocation,
)
from src.services.backtesting.strategies.eth_btc_minimum import (
    DmaFgiEthBtcMinimumStrategy,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRotationParams,
    EthBtcRotationStrategy,
    build_initial_eth_btc_asset_allocation,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    HIERARCHICAL_ATTRIBUTION_VARIANTS,
    PLAIN_GREED_SELL_RULE,
)
from src.services.backtesting.strategies.hierarchical_minimum import (
    MINIMUM_HIERARCHICAL_VARIANTS,
    HierarchicalMinimumStrategy,
)
from src.services.backtesting.strategies.pair_rotation_template import (
    ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    DmaFgiAdaptiveBinaryEthBtcStrategy,
    build_initial_pair_asset_allocation,
)
from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
    SPY_CRYPTO_TEMPLATE,
    HierarchicalPairRotationParams,
    HierarchicalSpyCryptoRotationStrategy,
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


_DEPRECATED_STRATEGY_NOTES: dict[str, str] = {
    # DEPRECATED: see snapshot 2026-04-15; Adaptive-DMA-poisoned.
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH: (
        "Adaptive-DMA-poisoned variant, no longer relevant."
    ),
    # DEPRECATED: see snapshot 2026-04-15; Adaptive-DMA-poisoned.
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION: (
        "Adaptive-DMA-poisoned variant, no longer relevant."
    ),
    # DEPRECATED: see snapshot 2026-04-15; Adaptive-DMA-poisoned.
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR: (
        "Adaptive-DMA-poisoned variant, no longer relevant."
    ),
    # DEPRECATED: see snapshot 2026-04-15; Adaptive-DMA-poisoned.
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY: (
        "Adaptive-DMA-poisoned variant, no longer relevant."
    ),
    # DEPRECATED: see snapshot 2026-04-15; anti-baseline, point made.
    STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY: ("Anti-baseline, point made."),
    # DEPRECATED: see snapshot 2026-04-15; disaster baseline, point made.
    STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY: (
        "Disaster baseline, point made."
    ),
}


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


def _build_eth_btc_attribution_strategy(
    request: StrategyBuildRequest,
    *,
    variant_id: str,
) -> BaseStrategy:
    params = EthBtcRotationParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or variant_id
    initial_asset_allocation = None
    if request.mode == "compare" and request.initial_allocation is not None:
        variant = ATTRIBUTION_VARIANTS[variant_id]
        initial_asset_allocation = build_initial_attribution_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            eth_share_in_risk_on=(
                variant.fixed_eth_share_in_risk_on
                if variant.rotation_mode == "fixed"
                else 0.5
            ),
        )
    return EthBtcAttributionStrategy(
        total_capital=request.total_capital,
        variant=ATTRIBUTION_VARIANTS[variant_id],
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


def _make_eth_btc_attribution_builder(variant_id: str) -> StrategyBuilder:
    def _builder(request: StrategyBuildRequest) -> BaseStrategy:
        return _build_eth_btc_attribution_strategy(request, variant_id=variant_id)

    return _builder


def _eth_btc_attribution_market_data_requirements() -> MarketDataRequirements:
    return MarketDataRequirements(
        requires_sentiment=True,
        required_price_features=frozenset({DMA_200_FEATURE}),
        required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
        max_lag_days=7,
    )


def _build_eth_btc_attribution_recipe(strategy_id: str) -> StrategyRecipe:
    variant = ATTRIBUTION_VARIANTS[strategy_id]
    return StrategyRecipe(
        strategy_id=strategy_id,
        display_name=variant.display_name,
        description=variant.description,
        signal_id="eth_btc_attribution_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=_eth_btc_attribution_market_data_requirements(),
        portfolio_bucket_mapper=map_portfolio_to_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_eth_btc_rotation_public_params,
        build_strategy=_make_eth_btc_attribution_builder(strategy_id),
        supports_daily_suggestion=False,
    )


def _build_adaptive_binary_eth_btc_strategy(
    request: StrategyBuildRequest,
) -> BaseStrategy:
    params = EthBtcRotationParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC
    initial_asset_allocation = None
    if request.mode == "compare" and request.initial_allocation is not None:
        initial_asset_allocation = build_initial_pair_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
        )
    return DmaFgiAdaptiveBinaryEthBtcStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


def _build_eth_btc_minimum_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    params = EthBtcRotationParams.from_public_params(request.params).model_copy(
        update={"disabled_rules": frozenset({PLAIN_GREED_SELL_RULE})}
    )
    strategy_id = request.resolved_config_id or STRATEGY_DMA_FGI_ETH_BTC_MINIMUM
    initial_asset_allocation = None
    if request.mode == "compare" and request.initial_allocation is not None:
        initial_asset_allocation = build_initial_pair_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
        )
    return DmaFgiEthBtcMinimumStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


def _build_spy_eth_btc_rotation_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    params = SpyEthBtcRotationParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_SPY_ETH_BTC_ROTATION
    initial_asset_allocation: dict[str, float] | None = None
    first_price_row = request.user_prices[0] if request.user_prices else {}
    extra_data = cast(Mapping[str, Any] | None, first_price_row.get("extra_data"))
    if request.mode == "compare" and request.initial_allocation is not None:
        crypto_initial = build_initial_eth_btc_asset_allocation(
            aggregate_allocation=request.initial_allocation,
            extra_data=extra_data,
            params=params,
        )
        spy_share = max(0.0, float(request.initial_allocation.get("spy", 0.0)))
        initial_asset_allocation = {**crypto_initial, "spy": spy_share}
    else:
        initial_asset_allocation = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0}
    return SpyEthBtcRotationStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


def _build_hierarchical_spy_crypto_strategy(
    request: StrategyBuildRequest,
) -> BaseStrategy:
    params = HierarchicalPairRotationParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO
    initial_asset_allocation = _build_initial_hierarchical_asset_allocation(request)
    return HierarchicalSpyCryptoRotationStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        initial_asset_allocation=initial_asset_allocation,
    )


def _build_initial_hierarchical_asset_allocation(
    request: StrategyBuildRequest,
) -> dict[str, float]:
    initial_asset_allocation = {
        "btc": 0.0,
        "eth": 0.0,
        "spy": 0.0,
        "stable": 1.0,
        "alt": 0.0,
    }
    if request.mode != "compare" or request.initial_allocation is None:
        return initial_asset_allocation
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


def _build_hierarchical_attribution_recipe(strategy_id: str) -> StrategyRecipe:
    variant = HIERARCHICAL_ATTRIBUTION_VARIANTS[strategy_id]
    deprecation_note = _DEPRECATED_STRATEGY_NOTES.get(strategy_id)
    return StrategyRecipe(
        strategy_id=strategy_id,
        display_name=variant.display_name,
        description=variant.description,
        signal_id=SPY_CRYPTO_TEMPLATE.signal_id,
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset(
                {
                    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
                    SPY_AUX_SERIES,
                    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
                }
            ),
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_hierarchical_spy_crypto_public_params,
        build_strategy=_make_hierarchical_attribution_builder(strategy_id),
        supports_daily_suggestion=False,
        deprecated=deprecation_note is not None,
        deprecation_note=deprecation_note,
    )


def _build_hierarchical_minimum_strategy(
    request: StrategyBuildRequest,
    *,
    variant_id: str,
) -> BaseStrategy:
    params = HierarchicalPairRotationParams.from_public_params(request.params)
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
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset(
                {
                    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
                    SPY_AUX_SERIES,
                    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
                }
            ),
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_hierarchical_spy_crypto_public_params,
        build_strategy=_make_hierarchical_minimum_builder(strategy_id),
        supports_daily_suggestion=False,
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
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC: StrategyRecipe(
        strategy_id=STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
        display_name="DMA FGI Adaptive Binary ETH/BTC",
        description="Clean pair-template strategy: DMA/FGI stable gate with 50/50 ETH/BTC start, dominant-unit DMA reference, and binary ETH/BTC ratio-zone rotation.",
        signal_id=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE.signal_id,
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_eth_btc_rotation_public_params,
        build_strategy=_build_adaptive_binary_eth_btc_strategy,
        supports_daily_suggestion=False,
    ),
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM: StrategyRecipe(
        strategy_id=STRATEGY_DMA_FGI_ETH_BTC_MINIMUM,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_ETH_BTC_MINIMUM],
        description=(
            "Research-only ETH/BTC pair-template strategy: DMA/FGI stable gate "
            "with plain greed sell suppression and no SPY layer."
        ),
        signal_id=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE.signal_id,
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_eth_btc_rotation_public_params,
        build_strategy=_build_eth_btc_minimum_strategy,
        supports_daily_suggestion=False,
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO: StrategyRecipe(
        strategy_id=STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO,
        display_name="DMA FGI Hierarchical SPY/Crypto",
        description=(
            "Two-layer pair-rotation: outer SPY-vs-Crypto sleeve and inner "
            "BTC-vs-ETH, both running DMA-gated FGI with adaptive-DMA "
            "reference and binary ratio zones."
        ),
        signal_id=SPY_CRYPTO_TEMPLATE.signal_id,
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset(
                {
                    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
                    SPY_AUX_SERIES,
                    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
                }
            ),
            max_lag_days=7,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_hierarchical_spy_crypto_public_params,
        build_strategy=_build_hierarchical_spy_crypto_strategy,
        supports_daily_suggestion=True,
    ),
    **{
        strategy_id: _build_eth_btc_attribution_recipe(strategy_id)
        for strategy_id in ATTRIBUTION_VARIANTS
    },
    **{
        strategy_id: _build_hierarchical_attribution_recipe(strategy_id)
        for strategy_id in HIERARCHICAL_ATTRIBUTION_VARIANTS
    },
    **{
        strategy_id: _build_hierarchical_minimum_recipe(strategy_id)
        for strategy_id in MINIMUM_HIERARCHICAL_VARIANTS
    },
    STRATEGY_SPY_ETH_BTC_ROTATION: StrategyRecipe(
        strategy_id=STRATEGY_SPY_ETH_BTC_ROTATION,
        display_name="SPY/ETH/BTC Multi-Asset Rotation",
        description="Add SPY as a fourth bucket alongside BTC/ETH/stable; SPY uses DMA gating plus a CNN US equity Fear & Greed risk overlay.",
        signal_id="spy_eth_btc_rs_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=MarketDataRequirements(
            requires_sentiment=True,
            requires_macro_fear_greed=True,
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

"""Internal strategy recipe registry for backtesting composition."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal, cast

from pydantic import BaseModel

from src.services.backtesting.capabilities import (
    PortfolioBucketMapper,
    RuntimePortfolioMode,
    map_portfolio_to_spy_eth_btc_stable_buckets,
    map_portfolio_to_two_buckets,
)
from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.public_params import DmaGatedFgiPublicParams
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy
from src.services.backtesting.strategies.rule_based_portfolio import (
    DmaGatedFgiParams,
    RuleBasedPortfolioStrategy,
    build_initial_portfolio_rules_asset_allocation,
)

StrategyBuildMode = Literal["compare", "daily_suggestion"]
ParamFamily = Literal["dma", "none"]
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


class _DcaPublicParams(BaseModel):
    """Empty public params model — DCA classic accepts no client params."""


def _normalize_dca_params(params: dict[str, Any]) -> dict[str, Any]:
    if params:
        raise ValueError("dca_classic does not accept params")
    return {}


def _build_dca_strategy(request: StrategyBuildRequest) -> BaseStrategy:
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
    public_params_model: type[BaseModel]
    param_family: ParamFamily
    normalize_public_params: PublicParamNormalizer
    build_strategy: StrategyBuilder
    runtime_portfolio_mode: RuntimePortfolioMode = "aggregate"
    supports_daily_suggestion: bool = False
    deprecated: bool = False
    deprecation_note: str | None = None


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
) -> BaseStrategy:
    params = DmaGatedFgiParams.from_public_params(request.params)
    strategy_id = request.resolved_config_id or STRATEGY_DMA_FGI_PORTFOLIO_RULES
    initial_asset_allocation = (
        _build_compare_price_row_initial_asset_allocation(
            request,
            build_initial_portfolio_rules_asset_allocation,
        )
        if request.mode == "compare"
        else None
    )
    return RuleBasedPortfolioStrategy(
        total_capital=request.total_capital,
        params=params,
        strategy_id=strategy_id,
        display_name=strategy_id,
        canonical_strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        initial_asset_allocation=initial_asset_allocation,
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


def _build_portfolio_rules_recipe() -> StrategyRecipe:
    return StrategyRecipe(
        strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES],
        description=(
            "Canonical rule-based SPY/BTC/ETH portfolio strategy driven by "
            "DMA crosses, ETH/BTC ratio rotation, and FGI regime shifts."
        ),
        signal_id="dma_fgi_portfolio_rules_signal",
        primary_asset="BTC",
        warmup_lookback_days=14,
        market_data_requirements=_spy_eth_btc_asset_requirements(
            requires_macro_fear_greed=True,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        public_params_model=DmaGatedFgiPublicParams,
        param_family="dma",
        runtime_portfolio_mode="asset",
        normalize_public_params=_normalize_dma_public_params,
        build_strategy=_build_portfolio_rules_strategy,
        supports_daily_suggestion=True,
    )


def _build_dca_classic_recipe() -> StrategyRecipe:
    return StrategyRecipe(
        strategy_id=STRATEGY_DCA_CLASSIC,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DCA_CLASSIC],
        description="Baseline: deploy stables into spot evenly across the simulation.",
        signal_id=None,
        primary_asset="BTC",
        warmup_lookback_days=0,
        market_data_requirements=MarketDataRequirements(max_lag_days=1),
        portfolio_bucket_mapper=map_portfolio_to_two_buckets,
        public_params_model=_DcaPublicParams,
        param_family="none",
        runtime_portfolio_mode="aggregate",
        normalize_public_params=_normalize_dca_params,
        build_strategy=_build_dca_strategy,
        supports_daily_suggestion=False,
    )


_RECIPES: dict[str, StrategyRecipe] = {
    STRATEGY_DCA_CLASSIC: _build_dca_classic_recipe(),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES: _build_portfolio_rules_recipe(),
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

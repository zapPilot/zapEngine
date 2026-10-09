"""Strategy recipes: the wire strategies and how a saved config binds to one.

A strategy is stated by a spec (``src/config/strategies/``): the rule-based
recipe has no parameters of its own, and a saved config names the locked
reference it runs. The classic DCA baseline is a frozen benchmark.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from functools import cache
from typing import Any, cast

from src.models.strategy_config import SavedStrategyConfig
from src.services.backtesting.capabilities import (
    PortfolioBucketMapper,
    RuntimePortfolioMode,
    map_portfolio_to_spy_eth_btc_stable_buckets,
    map_portfolio_to_two_buckets,
)
from src.services.backtesting.constants import (
    DMA_FGI_REFERENCE_SPEC,
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
from src.services.backtesting.portfolio_rules.components import (
    PortfolioRuleComponents,
)
from src.services.backtesting.signals.flat_minimum import (
    build_initial_flat_minimum_asset_allocation,
)
from src.services.backtesting.spec import (
    StrategySpec,
    compile_spec,
    spec_ref,
)
from src.services.backtesting.spec.loader import load_locked_spec
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)

StrategyBuilder = Callable[["StrategyBuildRequest"], BaseStrategy]
InitialAllocationBuilder = Callable[..., dict[str, float]]


@dataclass(frozen=True)
class StrategyBuildRequest:
    total_capital: float
    config_id: str | None = None
    user_prices: list[dict[str, Any]] = field(default_factory=list)
    initial_allocation: dict[str, float] | None = None
    user_start_date: date | None = None

    @property
    def resolved_config_id(self) -> str:
        return self.config_id or ""


def _require_compare_runtime_inputs(request: StrategyBuildRequest) -> None:
    if request.initial_allocation is None or request.user_start_date is None:
        raise ValueError(
            "Compare strategy build requires initial allocation and start date"
        )


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
    build_strategy: StrategyBuilder
    runtime_portfolio_mode: RuntimePortfolioMode = "aggregate"
    supports_daily_suggestion: bool = False
    # The locked reference a spec-backed recipe runs unless a saved config names
    # another; ``None`` for a recipe that is not spec-backed.
    spec_ref: str | None = None


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
    components: PortfolioRuleComponents,
    identity: str,
) -> BaseStrategy:
    strategy_id = request.resolved_config_id or STRATEGY_DMA_FGI_PORTFOLIO_RULES
    initial_asset_allocation = _build_compare_price_row_initial_asset_allocation(
        request,
        build_initial_flat_minimum_asset_allocation,
    )
    return RuleBasedPortfolioStrategy(
        total_capital=request.total_capital,
        components=components,
        spec_ref=identity,
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


def _build_spec_backed_strategy(request: StrategyBuildRequest) -> BaseStrategy:
    """The recipe's own build: the strategy of its reference spec."""
    spec = reference_spec(DMA_FGI_REFERENCE_SPEC)
    return _build_portfolio_rules_strategy(
        request,
        components=compile_spec(spec),
        identity=reference_identity(DMA_FGI_REFERENCE_SPEC),
    )


def _build_portfolio_rules_recipe() -> StrategyRecipe:
    reference = reference_spec(DMA_FGI_REFERENCE_SPEC)
    return StrategyRecipe(
        strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES],
        description=(
            "Canonical rule-based SPY/BTC/ETH portfolio strategy driven by "
            "DMA crosses, ETH/BTC ratio rotation, and FGI regime shifts."
        ),
        signal_id="dma_fgi_portfolio_rules_signal",
        primary_asset="BTC",
        warmup_lookback_days=reference.signals.warmup_days,
        market_data_requirements=_spy_eth_btc_asset_requirements(
            requires_macro_fear_greed=True,
        ),
        portfolio_bucket_mapper=map_portfolio_to_spy_eth_btc_stable_buckets,
        runtime_portfolio_mode="asset",
        build_strategy=_build_spec_backed_strategy,
        supports_daily_suggestion=True,
        spec_ref=DMA_FGI_REFERENCE_SPEC,
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
        runtime_portfolio_mode="aggregate",
        build_strategy=_build_dca_strategy,
        supports_daily_suggestion=False,
    )


@cache
def reference_spec(ref: str) -> StrategySpec:
    """A production reference, checked against the lock the first time it is read."""
    return load_locked_spec(ref)


def reference_identity(ref: str) -> str:
    """How a response names the reference a strategy ran: ``ref@version#hash12``."""
    return spec_ref(reference_spec(ref), ref)


# The rule-based recipe reads its reference when it is built, so a reference that
# drifted from the lock stops the process on import instead of on the first run.
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


@dataclass(frozen=True)
class ResolvedSavedStrategyConfig:
    """A recipe bound to what it runs, ready for the compare engine."""

    saved_config_id: str
    request_config_id: str
    strategy_id: str
    display_name: str
    description: str | None
    primary_asset: str
    summary_signal_id: str | None
    warmup_lookback_days: int
    market_data_requirements: MarketDataRequirements
    portfolio_bucket_mapper: PortfolioBucketMapper
    runtime_portfolio_mode: RuntimePortfolioMode
    supports_daily_suggestion: bool
    build_strategy: StrategyBuilder
    # How a response names the spec the strategy runs; ``None`` for a benchmark.
    spec_ref: str | None = None


def _resolve_recipe_config(
    recipe: StrategyRecipe,
    *,
    saved_config_id: str,
    request_config_id: str,
    display_name: str,
    description: str | None,
    primary_asset: str,
    supports_daily_suggestion: bool,
) -> ResolvedSavedStrategyConfig:
    return ResolvedSavedStrategyConfig(
        saved_config_id=saved_config_id,
        request_config_id=request_config_id,
        strategy_id=recipe.strategy_id,
        display_name=display_name,
        description=description,
        primary_asset=primary_asset,
        summary_signal_id=recipe.signal_id,
        warmup_lookback_days=recipe.warmup_lookback_days,
        market_data_requirements=recipe.market_data_requirements,
        portfolio_bucket_mapper=recipe.portfolio_bucket_mapper,
        runtime_portfolio_mode=recipe.runtime_portfolio_mode,
        supports_daily_suggestion=supports_daily_suggestion,
        build_strategy=recipe.build_strategy,
        spec_ref=None
        if recipe.spec_ref is None
        else reference_identity(recipe.spec_ref),
    )


def _bind_spec(
    resolved: ResolvedSavedStrategyConfig,
    spec: StrategySpec,
    *,
    identity: str,
) -> ResolvedSavedStrategyConfig:
    """``resolved`` running ``spec``; each build compiles it afresh.

    The spec decides the rules, guards and signal settings; the recipe supplies
    the market data and bucket mapping. Compiling per build means runs never
    share rule state.
    """
    return replace(
        resolved,
        warmup_lookback_days=spec.signals.warmup_days,
        spec_ref=identity,
        build_strategy=lambda request: _build_portfolio_rules_strategy(
            request,
            components=compile_spec(spec),
            identity=identity,
        ),
    )


def resolve_saved_strategy_config(
    saved_config: SavedStrategyConfig,
) -> ResolvedSavedStrategyConfig:
    """Bind a saved config to the recipe its ``strategy_id`` names.

    A spec-backed strategy runs the locked reference the config names (the
    recipe's own when it names none); a benchmark names none.
    """
    recipe = get_strategy_recipe(saved_config.strategy_id)
    resolved = _resolve_recipe_config(
        recipe,
        saved_config_id=saved_config.config_id,
        request_config_id=saved_config.config_id,
        display_name=saved_config.display_name,
        description=saved_config.description,
        primary_asset=saved_config.primary_asset,
        supports_daily_suggestion=saved_config.supports_daily_suggestion,
    )
    if recipe.spec_ref is None:
        if saved_config.spec_ref is not None:
            raise ValueError(f"{recipe.strategy_id} is not spec-backed")
        return resolved
    ref = saved_config.spec_ref or recipe.spec_ref
    return _bind_spec(resolved, reference_spec(ref), identity=reference_identity(ref))


def resolve_inline_strategy_config(
    *,
    config_id: str,
    strategy_id: str,
    params: Mapping[str, Any],
) -> ResolvedSavedStrategyConfig:
    """Bind a request-supplied strategy id to its recipe; it takes no params."""
    if params:
        raise ValueError(f"{strategy_id} does not accept params")
    recipe = get_strategy_recipe(strategy_id)
    return _resolve_recipe_config(
        recipe,
        saved_config_id=config_id,
        request_config_id=config_id,
        display_name=config_id,
        description=recipe.description,
        primary_asset=recipe.primary_asset,
        supports_daily_suggestion=recipe.supports_daily_suggestion,
    )


def resolve_spec_strategy_config(
    spec: StrategySpec,
    *,
    config_id: str,
) -> ResolvedSavedStrategyConfig:
    """Bind any spec (a lab candidate, say) to the rule-based recipe."""
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)
    resolved = _resolve_recipe_config(
        recipe,
        saved_config_id=config_id,
        request_config_id=config_id,
        display_name=config_id,
        description=spec.description,
        primary_asset=recipe.primary_asset,
        supports_daily_suggestion=False,
    )
    return _bind_spec(resolved, spec, identity=spec_ref(spec))

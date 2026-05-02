"""Generic saved-config resolution for composed strategy families."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import JsonValue

from src.models.backtesting import BacktestCompareConfigV3
from src.models.strategy_config import SavedStrategyConfig, StrategyComponentRef
from src.services.backtesting.capabilities import (
    PortfolioBucketMapper,
    RuntimePortfolioMode,
)
from src.services.backtesting.composition_catalog import (
    CompositionCatalog,
    DecisionPolicyFactory,
    ExecutionProfileFactory,
    PacingPolicyFactory,
    SignalComponentFactory,
    get_default_composition_catalog,
)
from src.services.backtesting.constants import STRATEGY_ETH_BTC_ROTATION
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.public_params import public_params_to_runtime_params
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.strategy_registry import StrategyBuildRequest


@dataclass(frozen=True)
class ResolvedSavedStrategyConfig:
    """Runtime-ready saved config resolved from component selections."""

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
    public_params: dict[str, JsonValue]
    build_strategy: Callable[[StrategyBuildRequest], BaseStrategy]


def _require_component_ref(
    ref: StrategyComponentRef | None,
    *,
    field_name: str,
) -> StrategyComponentRef:
    if ref is None:
        raise ValueError(f"Saved config is missing {field_name}")
    return ref


def build_saved_config_from_legacy(
    *,
    strategy_id: str,
    params: Mapping[str, Any],
    config_id: str,
    catalog: CompositionCatalog | None = None,
) -> SavedStrategyConfig:
    resolved_catalog = catalog or get_default_composition_catalog()
    family = resolved_catalog.resolve_family(strategy_id)
    if family.legacy_saved_config_builder is None:
        raise ValueError(
            f"Strategy family '{strategy_id}' does not support legacy inline compare config"
        )
    return family.legacy_saved_config_builder(config_id, params)


def resolve_compare_request_config(
    request_config: BacktestCompareConfigV3,
    *,
    resolve_saved_config: Callable[[str], SavedStrategyConfig],
    catalog: CompositionCatalog | None = None,
) -> SavedStrategyConfig:
    if request_config.saved_config_id:
        resolved = resolve_saved_config(request_config.saved_config_id)
        return resolved.model_copy(
            update={
                "display_name": request_config.config_id,
            },
            deep=True,
        )
    assert request_config.strategy_id is not None
    return build_saved_config_from_legacy(
        strategy_id=request_config.strategy_id,
        params=request_config.params,
        config_id=request_config.config_id,
        catalog=catalog,
    )


def resolve_saved_strategy_config(
    saved_config: SavedStrategyConfig,
    *,
    catalog: CompositionCatalog | None = None,
) -> ResolvedSavedStrategyConfig:
    resolved_catalog = catalog or get_default_composition_catalog()
    family = resolved_catalog.resolve_family(saved_config.strategy_id)
    family.validate_saved_config(saved_config)
    bucket_mapper = resolved_catalog.resolve_bucket_mapper(
        saved_config.composition.bucket_mapper_id
    )

    if family.composition_kind == "benchmark":
        if family.benchmark_strategy_builder_factory is None:
            raise ValueError(
                f"Strategy family '{saved_config.strategy_id}' is missing a benchmark builder"
            )
        return ResolvedSavedStrategyConfig(
            saved_config_id=saved_config.config_id,
            request_config_id=saved_config.config_id,
            strategy_id=saved_config.strategy_id,
            display_name=saved_config.display_name,
            description=saved_config.description,
            primary_asset=saved_config.primary_asset,
            summary_signal_id=None,
            warmup_lookback_days=0,
            market_data_requirements=MarketDataRequirements(),
            portfolio_bucket_mapper=bucket_mapper,
            runtime_portfolio_mode=family.runtime_portfolio_mode,
            supports_daily_suggestion=saved_config.supports_daily_suggestion,
            public_params=dict(saved_config.params),
            build_strategy=family.benchmark_strategy_builder_factory(saved_config),
        )

    signal_ref = _require_component_ref(
        saved_config.composition.signal,
        field_name="signal",
    )
    decision_ref = _require_component_ref(
        saved_config.composition.decision_policy,
        field_name="decision_policy",
    )
    pacing_ref = _require_component_ref(
        saved_config.composition.pacing_policy,
        field_name="pacing_policy",
    )
    execution_ref = _require_component_ref(
        saved_config.composition.execution_profile,
        field_name="execution_profile",
    )
    signal_factory = resolved_catalog.resolve_signal_component_factory(
        signal_ref.component_id
    )
    decision_factory = resolved_catalog.resolve_decision_policy_factory(
        decision_ref.component_id
    )
    pacing_factory = resolved_catalog.resolve_pacing_policy_factory(
        pacing_ref.component_id
    )
    execution_factory = resolved_catalog.resolve_execution_profile_factory(
        execution_ref.component_id
    )
    signal_component = signal_factory(signal_ref.params)
    _validate_component_params(
        decision_factory=decision_factory,
        decision_params=decision_ref.params,
        pacing_factory=pacing_factory,
        pacing_params=pacing_ref.params,
        execution_factory=execution_factory,
        execution_params=execution_ref.params,
        plugin_refs=saved_config.composition.plugins,
        catalog=resolved_catalog,
    )
    return ResolvedSavedStrategyConfig(
        saved_config_id=saved_config.config_id,
        request_config_id=saved_config.config_id,
        strategy_id=saved_config.strategy_id,
        display_name=saved_config.display_name,
        description=saved_config.description,
        primary_asset=saved_config.primary_asset,
        summary_signal_id=signal_component.signal_id,
        warmup_lookback_days=signal_component.warmup_lookback_days,
        market_data_requirements=signal_component.market_data_requirements,
        portfolio_bucket_mapper=bucket_mapper,
        runtime_portfolio_mode=family.runtime_portfolio_mode,
        supports_daily_suggestion=saved_config.supports_daily_suggestion,
        public_params=dict(saved_config.params),
        build_strategy=_build_composed_strategy(
            saved_config=saved_config,
            signal_component_factory=signal_factory,
            signal_params=signal_ref.params,
            decision_policy_factory=decision_factory,
            decision_params=decision_ref.params,
            pacing_policy_factory=pacing_factory,
            pacing_params=pacing_ref.params,
            plugin_refs=list(saved_config.composition.plugins),
            catalog=resolved_catalog,
        ),
    )


def _validate_component_params(
    *,
    decision_factory: DecisionPolicyFactory,
    decision_params: Mapping[str, Any],
    pacing_factory: PacingPolicyFactory,
    pacing_params: Mapping[str, Any],
    execution_factory: ExecutionProfileFactory,
    execution_params: Mapping[str, Any],
    plugin_refs: list[StrategyComponentRef],
    catalog: CompositionCatalog,
) -> None:
    """Validate component params by invoking factories (results intentionally discarded).

    This ensures all component params are well-formed at config resolution time,
    before the strategy is actually built at runtime.
    """
    decision_factory(decision_params)
    pacing_factory(pacing_params)
    execution_factory(execution_params)
    for plugin_ref in plugin_refs:
        catalog.resolve_plugin_factory(plugin_ref.component_id)(plugin_ref.params)


def _resolve_rotation_cooldown_days(saved_config: SavedStrategyConfig) -> int:
    if saved_config.strategy_id != STRATEGY_ETH_BTC_ROTATION:
        return 0
    runtime_params = public_params_to_runtime_params(
        saved_config.strategy_id,
        saved_config.params,
    )
    rotation_cooldown_days = runtime_params.get("rotation_cooldown_days")
    return rotation_cooldown_days if isinstance(rotation_cooldown_days, int) else 0


def _build_composed_strategy(
    *,
    saved_config: SavedStrategyConfig,
    signal_component_factory: SignalComponentFactory,
    signal_params: Mapping[str, Any],
    decision_policy_factory: DecisionPolicyFactory,
    decision_params: Mapping[str, Any],
    pacing_policy_factory: PacingPolicyFactory,
    pacing_params: Mapping[str, Any],
    plugin_refs: list[StrategyComponentRef],
    catalog: CompositionCatalog,
) -> Callable[[StrategyBuildRequest], BaseStrategy]:
    rotation_cooldown_days = _resolve_rotation_cooldown_days(saved_config)

    def _builder(request: StrategyBuildRequest) -> BaseStrategy:
        signal_component = signal_component_factory(signal_params)
        plugins = tuple(
            catalog.resolve_plugin_factory(plugin_ref.component_id)(plugin_ref.params)
            for plugin_ref in plugin_refs
        )
        resolved_strategy_id = request.resolved_config_id or saved_config.config_id
        return ComposedSignalStrategy(
            total_capital=request.total_capital,
            signal_component=signal_component,
            decision_policy=decision_policy_factory(decision_params),
            execution_engine=AllocationIntentExecutor(
                pacing_policy=pacing_policy_factory(pacing_params),
                plugins=plugins,
                rotation_cooldown_days=rotation_cooldown_days,
            ),
            public_params=dict(saved_config.params),
            signal_id=signal_component.signal_id,
            summary_signal_id=signal_component.signal_id,
            strategy_id=resolved_strategy_id,
            display_name=resolved_strategy_id,
            canonical_strategy_id=saved_config.strategy_id,
        )

    return _builder


__all__ = [
    "ResolvedSavedStrategyConfig",
    "build_saved_config_from_legacy",
    "resolve_compare_request_config",
    "resolve_saved_strategy_config",
]

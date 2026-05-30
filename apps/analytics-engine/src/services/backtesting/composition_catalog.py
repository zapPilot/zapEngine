"""Typed component/family catalog for saved-config composition."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from src.models.strategy_config import (
    SavedStrategyConfig,
)
from src.services.backtesting.capabilities import (
    PortfolioBucketMapper,
    RuntimePortfolioMode,
    map_portfolio_to_spy_eth_btc_stable_buckets,
    map_portfolio_to_two_buckets,
)
from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
from src.services.backtesting.execution.dma_buy_gate_plugin import (
    DmaBuyGateExecutionPlugin,
)
from src.services.backtesting.execution.pacing import FgiExponentialPacingPolicy
from src.services.backtesting.execution.trade_quota_guard_plugin import (
    TradeQuotaGuardExecutionPlugin,
)
from src.services.backtesting.portfolio_rules.base import DecisionPolicy
from src.services.backtesting.portfolio_rules.decision_policy import (
    PORTFOLIO_RULES_SIGNAL_ID,
    RuleBasedPortfolioDecisionPolicy,
)
from src.services.backtesting.signals.contracts import StatefulSignalComponent
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
)
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.rule_based_portfolio import (
    DmaGatedFgiParams,
)
from src.services.backtesting.strategy_registry import StrategyBuildRequest
from src.services.backtesting.utils import (
    coerce_bool,
    coerce_float,
    coerce_float_list,
    coerce_int,
    coerce_nullable_int,
    coerce_params,
)

SignalComponentFactory = Callable[[Mapping[str, Any]], StatefulSignalComponent]
DecisionPolicyFactory = Callable[[Mapping[str, Any]], DecisionPolicy]
PacingPolicyFactory = Callable[[Mapping[str, Any]], Any]
ExecutionProfileFactory = Callable[[Mapping[str, Any]], None]
PluginFactory = Callable[[Mapping[str, Any]], Any]
LegacySavedConfigBuilder = Callable[[str, Mapping[str, Any]], SavedStrategyConfig]
BenchmarkStrategyBuilderFactory = Callable[
    [SavedStrategyConfig],
    Callable[[StrategyBuildRequest], BaseStrategy],
]


def _build_portfolio_rules_signal_component(
    params: Mapping[str, Any],
) -> FlatMinimumSignalComponent:
    """Build the portfolio-rule signal component from saved-config params."""
    normalized = coerce_params(
        params,
        {"cross_cooldown_days": coerce_int, "cross_on_touch": coerce_bool},
        prefix="signal.",
    )
    return FlatMinimumSignalComponent(
        config=DmaGatedFgiParams(**normalized).build_signal_config(),
        signal_id=PORTFOLIO_RULES_SIGNAL_ID,
    )


def _build_decision_policy(
    policy_class: type[DecisionPolicy],
    params: Mapping[str, Any],
    policy_name: str,
) -> DecisionPolicy:
    if params:
        raise ValueError(f"{policy_name} does not accept params")
    return policy_class()


def _build_fgi_exponential_pacing(
    params: Mapping[str, Any],
) -> FgiExponentialPacingPolicy:
    normalized = coerce_params(
        params, {"k": coerce_float, "r_max": coerce_float}, prefix="pacing."
    )
    return FgiExponentialPacingPolicy(**normalized)


def _build_two_bucket_execution_profile(params: Mapping[str, Any]) -> None:
    if params:
        raise ValueError("two_bucket_rebalance does not accept params")
    return None


def _build_dma_buy_gate_plugin(params: Mapping[str, Any]) -> DmaBuyGateExecutionPlugin:
    prefix = "plugins.dma_buy_gate."
    normalized = coerce_params(
        params,
        {"window_days": coerce_int, "sideways_max_range": coerce_float},
        prefix=prefix,
    )
    if "leg_caps" in params:
        normalized["leg_caps"] = tuple(
            coerce_float_list(params["leg_caps"], field_name=f"{prefix}leg_caps")
        )
    return DmaBuyGateExecutionPlugin(**normalized)


def _build_trade_quota_guard_plugin(
    params: Mapping[str, Any],
) -> TradeQuotaGuardExecutionPlugin:
    allowed_keys = {"min_trade_interval_days", "max_trades_7d", "max_trades_30d"}
    invalid_keys = sorted(set(params) - allowed_keys)
    if invalid_keys:
        joined = ", ".join(invalid_keys)
        raise ValueError("trade_quota_guard does not accept params: " + joined)
    normalized = coerce_params(
        params,
        {
            "min_trade_interval_days": coerce_nullable_int,
            "max_trades_7d": coerce_nullable_int,
            "max_trades_30d": coerce_nullable_int,
        },
        prefix="plugins.trade_quota_guard.",
    )
    return TradeQuotaGuardExecutionPlugin(**normalized)


@dataclass(frozen=True)
class StrategyFamilySpec:
    """Descriptor for one saved-config strategy family."""

    strategy_id: str
    composition_kind: Literal["benchmark", "composed"]
    mutable_via_admin: bool
    runtime_portfolio_mode: RuntimePortfolioMode = "aggregate"
    required_slots: frozenset[str] = frozenset()
    supports_plugins: bool = True
    legacy_saved_config_builder: LegacySavedConfigBuilder | None = None
    benchmark_strategy_builder_factory: BenchmarkStrategyBuilderFactory | None = None

    def validate_saved_config(self, saved_config: SavedStrategyConfig) -> None:
        if saved_config.composition.kind != self.composition_kind:
            raise ValueError(
                f"Strategy family '{self.strategy_id}' must use "
                f"composition.kind='{self.composition_kind}'"
            )
        if self.composition_kind != "composed":
            return
        missing = sorted(
            slot
            for slot in self.required_slots
            if getattr(saved_config.composition, slot) is None
        )
        if missing:
            joined = ", ".join(missing)
            raise ValueError(
                f"Strategy family '{self.strategy_id}' is missing required component slots: {joined}"
            )
        if not self.supports_plugins and saved_config.composition.plugins:
            raise ValueError(
                f"Strategy family '{self.strategy_id}' does not support execution plugins"
            )


@dataclass(frozen=True)
class CompositionCatalog:
    """Production/test catalog for composition components and families."""

    signal_components: Mapping[str, SignalComponentFactory]
    decision_policies: Mapping[str, DecisionPolicyFactory]
    pacing_policies: Mapping[str, PacingPolicyFactory]
    execution_profiles: Mapping[str, ExecutionProfileFactory]
    plugins: Mapping[str, PluginFactory]
    bucket_mappers: Mapping[str, PortfolioBucketMapper]
    strategy_families: Mapping[str, StrategyFamilySpec]

    def with_extensions(
        self,
        *,
        signal_components: Mapping[str, SignalComponentFactory] | None = None,
        decision_policies: Mapping[str, DecisionPolicyFactory] | None = None,
        pacing_policies: Mapping[str, PacingPolicyFactory] | None = None,
        execution_profiles: Mapping[str, ExecutionProfileFactory] | None = None,
        plugins: Mapping[str, PluginFactory] | None = None,
        bucket_mappers: Mapping[str, PortfolioBucketMapper] | None = None,
        strategy_families: Mapping[str, StrategyFamilySpec] | None = None,
    ) -> CompositionCatalog:
        return CompositionCatalog(
            signal_components={**self.signal_components, **(signal_components or {})},
            decision_policies={
                **self.decision_policies,
                **(decision_policies or {}),
            },
            pacing_policies={**self.pacing_policies, **(pacing_policies or {})},
            execution_profiles={
                **self.execution_profiles,
                **(execution_profiles or {}),
            },
            plugins={**self.plugins, **(plugins or {})},
            bucket_mappers={**self.bucket_mappers, **(bucket_mappers or {})},
            strategy_families={
                **self.strategy_families,
                **(strategy_families or {}),
            },
        )

    def resolve_family(self, strategy_id: str) -> StrategyFamilySpec:
        try:
            return self.strategy_families[strategy_id]
        except KeyError as exc:
            raise ValueError(f"Unsupported strategy family '{strategy_id}'") from exc

    def resolve_signal_component_factory(
        self, component_id: str
    ) -> SignalComponentFactory:
        return _resolve_factory(
            registry=self.signal_components,
            component_id=component_id,
            kind="signal component",
        )

    def resolve_decision_policy_factory(
        self, component_id: str
    ) -> DecisionPolicyFactory:
        return _resolve_factory(
            registry=self.decision_policies,
            component_id=component_id,
            kind="decision policy",
        )

    def resolve_pacing_policy_factory(self, component_id: str) -> PacingPolicyFactory:
        return _resolve_factory(
            registry=self.pacing_policies,
            component_id=component_id,
            kind="pacing policy",
        )

    def resolve_execution_profile_factory(
        self, component_id: str
    ) -> ExecutionProfileFactory:
        return _resolve_factory(
            registry=self.execution_profiles,
            component_id=component_id,
            kind="execution profile",
        )

    def resolve_plugin_factory(self, component_id: str) -> PluginFactory:
        return _resolve_factory(
            registry=self.plugins,
            component_id=component_id,
            kind="execution plugin",
        )

    def resolve_bucket_mapper(self, bucket_mapper_id: str) -> PortfolioBucketMapper:
        try:
            return self.bucket_mappers[bucket_mapper_id]
        except KeyError as exc:
            raise ValueError(
                f"Unsupported bucket_mapper_id '{bucket_mapper_id}'"
            ) from exc


def _resolve_factory(
    *,
    registry: Mapping[str, Callable[[Mapping[str, Any]], Any]],
    component_id: str,
    kind: str,
) -> Callable[[Mapping[str, Any]], Any]:
    try:
        return registry[component_id]
    except KeyError as exc:
        raise ValueError(f"Unsupported {kind} '{component_id}'") from exc


def build_default_composition_catalog() -> CompositionCatalog:
    return CompositionCatalog(
        signal_components={
            PORTFOLIO_RULES_SIGNAL_ID: _build_portfolio_rules_signal_component,
        },
        decision_policies={
            "dma_fgi_portfolio_rules_policy": lambda p: _build_decision_policy(
                RuleBasedPortfolioDecisionPolicy,
                p,
                "dma_fgi_portfolio_rules_policy",
            ),
        },
        pacing_policies={
            "fgi_exponential": _build_fgi_exponential_pacing,
        },
        execution_profiles={
            "two_bucket_rebalance": _build_two_bucket_execution_profile,
        },
        plugins={
            "dma_buy_gate": _build_dma_buy_gate_plugin,
            "trade_quota_guard": _build_trade_quota_guard_plugin,
        },
        bucket_mappers={
            "two_bucket_spot_stable": map_portfolio_to_two_buckets,
            "spy_eth_btc_stable": map_portfolio_to_spy_eth_btc_stable_buckets,
        },
        strategy_families={
            STRATEGY_DMA_FGI_PORTFOLIO_RULES: StrategyFamilySpec(
                strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
                composition_kind="composed",
                mutable_via_admin=True,
                runtime_portfolio_mode="asset",
                required_slots=frozenset({"signal", "decision_policy"}),
                supports_plugins=False,
            ),
        },
    )


@lru_cache(maxsize=1)
def get_default_composition_catalog() -> CompositionCatalog:
    return build_default_composition_catalog()


__all__ = [
    "BenchmarkStrategyBuilderFactory",
    "CompositionCatalog",
    "DecisionPolicyFactory",
    "ExecutionProfileFactory",
    "LegacySavedConfigBuilder",
    "PacingPolicyFactory",
    "PluginFactory",
    "SignalComponentFactory",
    "StrategyFamilySpec",
    "build_default_composition_catalog",
    "get_default_composition_catalog",
]

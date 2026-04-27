"""Typed component/family catalog for saved-config composition."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, cast

from pydantic import JsonValue

from src.config.strategy_presets import resolve_strategy_default_runtime_params
from src.models.strategy_config import (
    SavedStrategyConfig,
    StrategyComponentRef,
    StrategyComposition,
)
from src.services.backtesting.capabilities import (
    PortfolioBucketMapper,
    RuntimePortfolioMode,
    map_portfolio_to_eth_btc_stable_buckets,
    map_portfolio_to_spy_eth_btc_stable_buckets,
    map_portfolio_to_two_buckets,
)
from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_ROTATION,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.execution.dma_buy_gate_plugin import (
    DmaBuyGateExecutionPlugin,
)
from src.services.backtesting.execution.pacing import FgiExponentialPacingPolicy
from src.services.backtesting.execution.trade_quota_guard_plugin import (
    TradeQuotaGuardExecutionPlugin,
)
from src.services.backtesting.public_params import runtime_params_to_public_params
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiDecisionPolicy,
    DmaGatedFgiParams,
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRelativeStrengthSignalComponent,
    EthBtcRotationDecisionPolicy,
    EthBtcRotationParams,
)
from src.services.backtesting.strategies.spy_eth_btc_rotation import (
    SpyEthBtcRotationDecisionPolicy,
    SpyEthBtcRotationParams,
    SpyEthBtcRotationSignalComponent,
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


def _build_dma_gated_fgi_signal_component(
    params: Mapping[str, Any],
) -> DmaGatedFgiSignalComponent:
    """Build DMA-gated FGI signal component from params."""
    normalized = coerce_params(
        params,
        {"cross_cooldown_days": coerce_int, "cross_on_touch": coerce_bool},
        prefix="signal.",
    )
    return DmaGatedFgiSignalComponent(
        config=DmaGatedFgiParams(
            cross_cooldown_days=normalized.get("cross_cooldown_days", 30),
            cross_on_touch=normalized.get("cross_on_touch", True),
        ).build_signal_config()
    )


def _build_eth_btc_rs_signal_component(
    params: Mapping[str, Any],
) -> EthBtcRelativeStrengthSignalComponent:
    """Build ETH/BTC relative strength signal component from params."""
    config_kwargs = coerce_params(
        params,
        {"cross_cooldown_days": coerce_int, "cross_on_touch": coerce_bool},
        prefix="signal.",
    )
    signal_kwargs: dict[str, Any] = {}
    if config_kwargs:
        signal_kwargs["config"] = DmaGatedFgiParams(
            **config_kwargs
        ).build_signal_config()
    signal_kwargs.update(
        coerce_params(
            params,
            {
                "ratio_cross_cooldown_days": coerce_int,
                "rotation_neutral_band": coerce_float,
                "rotation_max_deviation": coerce_float,
            },
            prefix="signal.",
        )
    )
    return EthBtcRelativeStrengthSignalComponent(**signal_kwargs)


def _build_spy_eth_btc_rs_signal_component(
    params: Mapping[str, Any],
) -> SpyEthBtcRotationSignalComponent:
    """Build SPY/ETH/BTC rotation signal component from params."""
    if not params:
        return SpyEthBtcRotationSignalComponent()
    return SpyEthBtcRotationSignalComponent(
        params=SpyEthBtcRotationParams.from_public_params(dict(params)),
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


def _build_dca_strategy(
    saved_config: SavedStrategyConfig,
) -> Callable[[StrategyBuildRequest], BaseStrategy]:
    def _builder(request: StrategyBuildRequest) -> BaseStrategy:
        if request.mode != "compare":
            raise ValueError("dca_classic does not support daily suggestion")
        if request.initial_allocation is None or request.user_start_date is None:
            raise ValueError(
                "Compare strategy build requires initial allocation and start date"
            )
        return DcaClassicStrategy(
            total_days=len(request.user_prices),
            total_capital=request.total_capital,
            initial_allocation=request.initial_allocation,
            user_start_date=request.user_start_date,
            strategy_id=request.resolved_config_id or saved_config.config_id,
            display_name=request.resolved_config_id or saved_config.display_name,
        )

    return _builder


def _build_dca_saved_config_from_legacy(
    config_id: str,
    params: Mapping[str, Any],
) -> SavedStrategyConfig:
    if params:
        raise ValueError("dca_classic does not accept params")
    return SavedStrategyConfig(
        config_id=config_id,
        display_name=config_id,
        strategy_id=STRATEGY_DCA_CLASSIC,
        primary_asset="BTC",
        params={},
        composition=StrategyComposition(
            kind="benchmark",
            bucket_mapper_id="two_bucket_spot_stable",
        ),
        supports_daily_suggestion=False,
        is_default=False,
        is_benchmark=True,
    )


def _build_composed_saved_config_from_legacy(
    config_id: str,
    params: Mapping[str, Any],
    *,
    strategy_id: str,
    params_class: type[DmaGatedFgiParams],
    signal_component_id: str,
    decision_component_id: str,
    default_runtime_params: Mapping[str, Any] | None = None,
    bucket_mapper_id: str = "two_bucket_spot_stable",
    signal_extra_params: Mapping[str, Any] | None = None,
) -> SavedStrategyConfig:
    merged_params = {
        **({} if default_runtime_params is None else dict(default_runtime_params)),
        **dict(params),
    }
    resolved_params = params_class.from_public_params(merged_params)
    signal_params: dict[str, JsonValue] = {
        "cross_cooldown_days": resolved_params.cross_cooldown_days,
        "cross_on_touch": resolved_params.cross_on_touch,
    }
    if signal_extra_params:
        signal_params.update(
            {key: cast(JsonValue, value) for key, value in signal_extra_params.items()}
        )
    return SavedStrategyConfig(
        config_id=config_id,
        display_name=config_id,
        description="Legacy compare adapter config.",
        strategy_id=strategy_id,
        primary_asset="BTC",
        params=runtime_params_to_public_params(
            strategy_id,
            resolved_params.to_public_params(),
        ),
        composition=StrategyComposition(
            kind="composed",
            bucket_mapper_id=bucket_mapper_id,
            signal=StrategyComponentRef(
                component_id=signal_component_id,
                params=signal_params,
            ),
            decision_policy=StrategyComponentRef(
                component_id=decision_component_id,
                params={},
            ),
            pacing_policy=StrategyComponentRef(
                component_id="fgi_exponential",
                params={
                    "k": resolved_params.pacing_k,
                    "r_max": resolved_params.pacing_r_max,
                },
            ),
            execution_profile=StrategyComponentRef(
                component_id="two_bucket_rebalance",
                params={},
            ),
            plugins=[
                StrategyComponentRef(
                    component_id="dma_buy_gate",
                    params={
                        "window_days": resolved_params.buy_sideways_window_days,
                        "sideways_max_range": resolved_params.buy_sideways_max_range,
                        "leg_caps": list(resolved_params.buy_leg_caps),
                    },
                ),
                StrategyComponentRef(
                    component_id="trade_quota_guard",
                    params=resolved_params.build_trade_quota_plugin_params(),
                ),
            ],
        ),
        supports_daily_suggestion=True,
        is_default=False,
        is_benchmark=False,
    )


def _build_dma_saved_config_from_legacy(
    config_id: str,
    params: Mapping[str, Any],
) -> SavedStrategyConfig:
    return _build_composed_saved_config_from_legacy(
        config_id,
        params,
        strategy_id=STRATEGY_DMA_GATED_FGI,
        params_class=DmaGatedFgiParams,
        signal_component_id="dma_gated_fgi_signal",
        decision_component_id="dma_fgi_policy",
        default_runtime_params=resolve_strategy_default_runtime_params(
            STRATEGY_DMA_GATED_FGI
        ),
    )


def _build_eth_btc_saved_config_from_legacy(
    config_id: str,
    params: Mapping[str, Any],
) -> SavedStrategyConfig:
    default_runtime_params = resolve_strategy_default_runtime_params(
        STRATEGY_ETH_BTC_ROTATION
    )
    merged_params = {
        **default_runtime_params,
        **params,
    }
    resolved_params = EthBtcRotationParams.from_public_params(merged_params)
    return _build_composed_saved_config_from_legacy(
        config_id,
        params,
        strategy_id=STRATEGY_ETH_BTC_ROTATION,
        params_class=EthBtcRotationParams,
        signal_component_id="eth_btc_rs_signal",
        decision_component_id="eth_btc_rotation_policy",
        default_runtime_params=default_runtime_params,
        bucket_mapper_id="eth_btc_stable",
        signal_extra_params={
            "ratio_cross_cooldown_days": resolved_params.ratio_cross_cooldown_days,
            "rotation_neutral_band": resolved_params.rotation_neutral_band,
            "rotation_max_deviation": resolved_params.rotation_max_deviation,
        },
    )


def _build_spy_eth_btc_saved_config_from_legacy(
    config_id: str,
    params: Mapping[str, Any],
) -> SavedStrategyConfig:
    default_runtime_params = resolve_strategy_default_runtime_params(
        STRATEGY_SPY_ETH_BTC_ROTATION
    )
    merged_params = {
        **default_runtime_params,
        **params,
    }
    resolved_params = SpyEthBtcRotationParams.from_public_params(merged_params)
    return _build_composed_saved_config_from_legacy(
        config_id,
        params,
        strategy_id=STRATEGY_SPY_ETH_BTC_ROTATION,
        params_class=SpyEthBtcRotationParams,
        signal_component_id="spy_eth_btc_rs_signal",
        decision_component_id="spy_eth_btc_rotation_policy",
        default_runtime_params=default_runtime_params,
        bucket_mapper_id="spy_eth_btc_stable",
        signal_extra_params={
            "ratio_cross_cooldown_days": resolved_params.ratio_cross_cooldown_days,
            "rotation_neutral_band": resolved_params.rotation_neutral_band,
            "rotation_max_deviation": resolved_params.rotation_max_deviation,
        },
    )


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
            "dma_gated_fgi_signal": _build_dma_gated_fgi_signal_component,
            "eth_btc_rs_signal": _build_eth_btc_rs_signal_component,
            "spy_eth_btc_rs_signal": _build_spy_eth_btc_rs_signal_component,
        },
        decision_policies={
            "dma_fgi_policy": lambda p: _build_decision_policy(
                DmaGatedFgiDecisionPolicy, p, "dma_fgi_policy"
            ),
            "eth_btc_rotation_policy": lambda p: _build_decision_policy(
                EthBtcRotationDecisionPolicy, p, "eth_btc_rotation_policy"
            ),
            "spy_eth_btc_rotation_policy": lambda p: _build_decision_policy(
                SpyEthBtcRotationDecisionPolicy, p, "spy_eth_btc_rotation_policy"
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
            "eth_btc_stable": map_portfolio_to_eth_btc_stable_buckets,
            "spy_eth_btc_stable": map_portfolio_to_spy_eth_btc_stable_buckets,
        },
        strategy_families={
            STRATEGY_DCA_CLASSIC: StrategyFamilySpec(
                strategy_id=STRATEGY_DCA_CLASSIC,
                composition_kind="benchmark",
                mutable_via_admin=False,
                runtime_portfolio_mode="aggregate",
                legacy_saved_config_builder=_build_dca_saved_config_from_legacy,
                benchmark_strategy_builder_factory=_build_dca_strategy,
            ),
            STRATEGY_DMA_GATED_FGI: StrategyFamilySpec(
                strategy_id=STRATEGY_DMA_GATED_FGI,
                composition_kind="composed",
                mutable_via_admin=True,
                runtime_portfolio_mode="aggregate",
                required_slots=frozenset(
                    {"signal", "decision_policy", "pacing_policy", "execution_profile"}
                ),
                legacy_saved_config_builder=_build_dma_saved_config_from_legacy,
            ),
            STRATEGY_ETH_BTC_ROTATION: StrategyFamilySpec(
                strategy_id=STRATEGY_ETH_BTC_ROTATION,
                composition_kind="composed",
                mutable_via_admin=True,
                runtime_portfolio_mode="asset",
                required_slots=frozenset(
                    {"signal", "decision_policy", "pacing_policy", "execution_profile"}
                ),
                legacy_saved_config_builder=_build_eth_btc_saved_config_from_legacy,
            ),
            STRATEGY_SPY_ETH_BTC_ROTATION: StrategyFamilySpec(
                strategy_id=STRATEGY_SPY_ETH_BTC_ROTATION,
                composition_kind="composed",
                mutable_via_admin=True,
                runtime_portfolio_mode="asset",
                required_slots=frozenset(
                    {"signal", "decision_policy", "pacing_policy", "execution_profile"}
                ),
                legacy_saved_config_builder=_build_spy_eth_btc_saved_config_from_legacy,
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

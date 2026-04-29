"""Seed strategy configs used to bootstrap the saved-config store."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, cast

from pydantic import JsonValue

from src.models.strategy_config import (
    BacktestDefaults,
    SavedStrategyConfig,
    StrategyComponentRef,
    StrategyComposition,
    StrategyPreset,
)
from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_ROTATION,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.public_params import (
    get_default_public_params,
    normalize_nested_public_params,
    public_params_to_runtime_params,
)
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.eth_btc_rotation import EthBtcRotationParams
from src.services.backtesting.strategies.spy_eth_btc_rotation import (
    SpyEthBtcRotationParams,
)


@dataclass(frozen=True)
class _ComposedPresetDefinition:
    config_id: str
    display_name: str
    description: str
    strategy_id: str
    signal_component_id: str
    decision_component_id: str
    signal_param_fields: tuple[str, ...]
    bucket_mapper_id: str = "two_bucket_spot_stable"
    primary_asset: str = "BTC"
    supports_daily_suggestion: bool = True
    is_default: bool = False
    is_benchmark: bool = False


# ── Strategy Tuning ──────────────────────────────────────────────────────────
# Central point for tuning strategy defaults.
# Edit values here using the nested public params contract.
STRATEGY_TUNING_OVERRIDES: Final[dict[str, dict[str, JsonValue]]] = {
    STRATEGY_DMA_GATED_FGI: {
        "trade_quota": {
            "min_trade_interval_days": None,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
    },
    STRATEGY_ETH_BTC_ROTATION: {
        "trade_quota": {
            "min_trade_interval_days": 1,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
        "rotation": {
            "cooldown_days": 14,
        },
    },
    STRATEGY_SPY_ETH_BTC_ROTATION: {
        "trade_quota": {
            "min_trade_interval_days": 1,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
        "rotation": {
            "cooldown_days": 14,
        },
    },
}
# ─────────────────────────────────────────────────────────────────────────────

DMA_DEFAULT_CONFIG_ID: Final[str] = "dma_gated_fgi_default"
ETH_BTC_ROTATION_CONFIG_ID: Final[str] = "eth_btc_rotation_default"
SPY_ETH_BTC_ROTATION_CONFIG_ID: Final[str] = "spy_eth_btc_rotation_default"

_DEFAULT_SIGNAL_PARAM_FIELDS: Final[tuple[str, ...]] = (
    "cross_cooldown_days",
    "cross_on_touch",
)
_PARAMS_MODEL_BY_STRATEGY: Final[dict[str, type[DmaGatedFgiParams]]] = {
    STRATEGY_DMA_GATED_FGI: DmaGatedFgiParams,
    STRATEGY_ETH_BTC_ROTATION: EthBtcRotationParams,
    STRATEGY_SPY_ETH_BTC_ROTATION: SpyEthBtcRotationParams,
}
_COMPOSED_PRESET_DEFINITIONS: Final[tuple[_ComposedPresetDefinition, ...]] = (
    _ComposedPresetDefinition(
        config_id=DMA_DEFAULT_CONFIG_ID,
        display_name="DMA Gated FGI Default",
        description="Curated live/backtest preset for the DMA recipe.",
        strategy_id=STRATEGY_DMA_GATED_FGI,
        signal_component_id="dma_gated_fgi_signal",
        decision_component_id="dma_fgi_policy",
        signal_param_fields=_DEFAULT_SIGNAL_PARAM_FIELDS,
    ),
    _ComposedPresetDefinition(
        config_id=ETH_BTC_ROTATION_CONFIG_ID,
        display_name="ETH/BTC RS Rotation",
        description=(
            "Default live/backtest preset that rotates spot exposure between "
            "BTC and ETH based on ETH/BTC relative strength vs DMA. Trade "
            "frequency limited to prevent overtrading."
        ),
        strategy_id=STRATEGY_ETH_BTC_ROTATION,
        signal_component_id="eth_btc_rs_signal",
        decision_component_id="eth_btc_rotation_policy",
        signal_param_fields=(
            *_DEFAULT_SIGNAL_PARAM_FIELDS,
            "ratio_cross_cooldown_days",
            "rotation_neutral_band",
            "rotation_max_deviation",
        ),
        bucket_mapper_id="eth_btc_stable",
        is_default=True,
    ),
    _ComposedPresetDefinition(
        config_id=SPY_ETH_BTC_ROTATION_CONFIG_ID,
        display_name="SPY/ETH/BTC Multi-Asset Rotation",
        description=(
            "Adds SPY (S&P 500) as a fourth bucket to the ETH/BTC rotation. "
            "SPY uses DMA gating plus a CNN US equity Fear & Greed risk overlay. Capital is "
            "allocated competitively: when both DMA gates are risk-on, SPY "
            "and crypto each get ~50%."
        ),
        strategy_id=STRATEGY_SPY_ETH_BTC_ROTATION,
        signal_component_id="spy_eth_btc_rs_signal",
        decision_component_id="spy_eth_btc_rotation_policy",
        signal_param_fields=(
            *_DEFAULT_SIGNAL_PARAM_FIELDS,
            "ratio_cross_cooldown_days",
            "rotation_neutral_band",
            "rotation_max_deviation",
        ),
        bucket_mapper_id="spy_eth_btc_stable",
    ),
)


def _get_params_model(strategy_id: str) -> type[DmaGatedFgiParams]:
    params_model = _PARAMS_MODEL_BY_STRATEGY.get(strategy_id)
    if params_model is None:
        valid = ", ".join(sorted(_PARAMS_MODEL_BY_STRATEGY))
        raise ValueError(
            f"Strategy '{strategy_id}' does not define preset params. Valid values: {valid}"
        )
    return params_model


def _merge_public_params(
    base: dict[str, JsonValue],
    overrides: dict[str, JsonValue],
) -> dict[str, JsonValue]:
    merged = dict(base)
    for key, value in overrides.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = cast(JsonValue, {**existing, **value})
            continue
        merged[key] = value
    return merged


def _resolve_default_public_params(strategy_id: str) -> dict[str, JsonValue]:
    base_params = get_default_public_params(strategy_id)
    tuned_params = _merge_public_params(
        base_params,
        STRATEGY_TUNING_OVERRIDES.get(strategy_id, {}),
    )
    return normalize_nested_public_params(strategy_id, tuned_params)


def _resolve_default_params_model(strategy_id: str) -> DmaGatedFgiParams:
    params_model = _get_params_model(strategy_id)
    runtime_params = public_params_to_runtime_params(
        strategy_id,
        _resolve_default_public_params(strategy_id),
    )
    return params_model.from_public_params(runtime_params)


def resolve_strategy_default_params(strategy_id: str) -> dict[str, JsonValue]:
    """Return the validated default public params for one tunable strategy."""
    return _resolve_default_public_params(strategy_id)


def resolve_strategy_default_runtime_params(
    strategy_id: str,
) -> dict[str, JsonValue]:
    """Return validated flat runtime params for preset/composition internals."""
    return public_params_to_runtime_params(
        strategy_id,
        _resolve_default_public_params(strategy_id),
    )


def _project_signal_params(
    params: DmaGatedFgiParams,
    fields: tuple[str, ...],
) -> dict[str, JsonValue]:
    return cast(
        dict[str, JsonValue],
        params.model_dump(include=set(fields), exclude_none=True, mode="json"),
    )


def _build_composed_strategy_composition(
    definition: _ComposedPresetDefinition,
    params: DmaGatedFgiParams,
) -> StrategyComposition:
    return StrategyComposition(
        kind="composed",
        bucket_mapper_id=definition.bucket_mapper_id,
        signal=StrategyComponentRef(
            component_id=definition.signal_component_id,
            params=_project_signal_params(params, definition.signal_param_fields),
        ),
        decision_policy=StrategyComponentRef(
            component_id=definition.decision_component_id,
            params={},
        ),
        pacing_policy=StrategyComponentRef(
            component_id="fgi_exponential",
            params={
                "k": params.pacing_k,
                "r_max": params.pacing_r_max,
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
                    "window_days": params.buy_sideways_window_days,
                    "sideways_max_range": params.buy_sideways_max_range,
                    "leg_caps": list(params.buy_leg_caps),
                },
            ),
            StrategyComponentRef(
                component_id="trade_quota_guard",
                params=params.build_trade_quota_plugin_params(),
            ),
        ],
    )


def _build_composed_seed_config(
    definition: _ComposedPresetDefinition,
) -> SavedStrategyConfig:
    public_params = resolve_strategy_default_params(definition.strategy_id)
    resolved_params = _resolve_default_params_model(definition.strategy_id)
    return SavedStrategyConfig(
        config_id=definition.config_id,
        display_name=definition.display_name,
        description=definition.description,
        strategy_id=definition.strategy_id,
        primary_asset=definition.primary_asset,
        params=public_params,
        composition=_build_composed_strategy_composition(definition, resolved_params),
        supports_daily_suggestion=definition.supports_daily_suggestion,
        is_default=definition.is_default,
        is_benchmark=definition.is_benchmark,
    )


SEED_STRATEGY_CONFIGS: Final[list[SavedStrategyConfig]] = [
    *(
        _build_composed_seed_config(definition)
        for definition in _COMPOSED_PRESET_DEFINITIONS
    ),
    SavedStrategyConfig(
        config_id=STRATEGY_DCA_CLASSIC,
        display_name="Classic DCA",
        description="Simple dollar-cost averaging baseline.",
        strategy_id=STRATEGY_DCA_CLASSIC,
        primary_asset="BTC",
        params={},
        composition=StrategyComposition(kind="benchmark"),
        supports_daily_suggestion=False,
        is_default=False,
        is_benchmark=True,
    ),
]

BACKTEST_DEFAULTS: Final[BacktestDefaults] = BacktestDefaults(
    days=500, total_capital=10000
)


def get_backtest_defaults() -> BacktestDefaults:
    return BACKTEST_DEFAULTS


def _validate_seed_strategy_config_invariants() -> None:
    defaults = [
        config.config_id for config in SEED_STRATEGY_CONFIGS if config.is_default
    ]
    benchmarks = [
        config.config_id for config in SEED_STRATEGY_CONFIGS if config.is_benchmark
    ]
    if len(defaults) > 1:
        joined = ", ".join(sorted(defaults))
        raise ValueError(f"Seed strategy configs contain multiple defaults: {joined}")
    if len(benchmarks) > 1:
        joined = ", ".join(sorted(benchmarks))
        raise ValueError(f"Seed strategy configs contain multiple benchmarks: {joined}")


def list_seed_strategy_configs() -> list[SavedStrategyConfig]:
    _validate_seed_strategy_config_invariants()
    return [config.model_copy(deep=True) for config in SEED_STRATEGY_CONFIGS]


def get_default_seed_strategy_config() -> SavedStrategyConfig:
    _validate_seed_strategy_config_invariants()
    for config in SEED_STRATEGY_CONFIGS:
        if config.is_default:
            return config.model_copy(deep=True)
    raise ValueError("No default strategy config configured")


def get_benchmark_seed_strategy_config() -> SavedStrategyConfig:
    _validate_seed_strategy_config_invariants()
    for config in SEED_STRATEGY_CONFIGS:
        if config.is_benchmark:
            return config.model_copy(deep=True)
    raise ValueError("No benchmark strategy config configured")


def resolve_seed_strategy_config(config_id: str | None) -> SavedStrategyConfig:
    _validate_seed_strategy_config_invariants()
    if config_id is None or not str(config_id).strip():
        return get_default_seed_strategy_config()
    for config in SEED_STRATEGY_CONFIGS:
        if config.config_id == config_id:
            return config.model_copy(deep=True)
    valid = ", ".join(sorted(config.config_id for config in SEED_STRATEGY_CONFIGS))
    raise ValueError(f"Unknown config_id '{config_id}'. Valid values: {valid}")


def list_strategy_presets() -> list[StrategyPreset]:
    _validate_seed_strategy_config_invariants()
    return [
        config.to_public_preset()
        for config in SEED_STRATEGY_CONFIGS
        if not config.is_benchmark
    ]


def get_default_strategy_preset() -> StrategyPreset:
    return get_default_seed_strategy_config().to_public_preset()


def get_benchmark_strategy_preset() -> StrategyPreset:
    return get_benchmark_seed_strategy_config().to_public_preset()


def resolve_strategy_preset(config_id: str | None) -> StrategyPreset:
    return resolve_seed_strategy_config(config_id).to_public_preset()


STRATEGY_PRESETS: Final[list[StrategyPreset]] = list_strategy_presets() + [
    get_benchmark_strategy_preset()
]

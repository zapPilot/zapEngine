"""Public strategy params contract helpers.

This module defines the nested public `params` schema exposed by the API and
translates it to the flat runtime params consumed by the strategy classes.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF,
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM,
    STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY,
    STRATEGY_DMA_FGI_HIERARCHICAL_BUY_FLOOR_ONLY,
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH,
    STRATEGY_DMA_FGI_HIERARCHICAL_GREED_SUPPRESSION_ONLY,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH,
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO,
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_LATCH_ONLY,
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION,
    STRATEGY_DMA_FGI_RATIO_COOLDOWN,
    STRATEGY_DMA_FGI_RATIO_ZONE,
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS,
    STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN,
    STRATEGY_ETH_BTC_ROTATION,
    STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)


class _EmptyPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _SignalPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cross_cooldown_days: int = Field(default=30, ge=0, strict=True)
    cross_on_touch: bool = Field(default=True)


class _EthBtcSignalPublicParams(_SignalPublicParams):
    ratio_cross_cooldown_days: int = Field(default=30, ge=0, strict=True)
    rotation_neutral_band: float = Field(default=0.05, ge=0.0)
    rotation_max_deviation: float = Field(default=0.20, gt=0.0)


class _PacingPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    k: float = Field(default=5.0)
    r_max: float = Field(default=1.0)


class _BuyGatePublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    window_days: int = Field(default=5, ge=1, strict=True)
    sideways_max_range: float = Field(default=0.04, ge=0.0)
    leg_caps: list[float] = Field(default_factory=lambda: [0.05, 0.10, 0.20])


class _TradeQuotaPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min_trade_interval_days: int | None = Field(default=None, ge=1, strict=True)
    max_trades_7d: int | None = Field(default=None, ge=1, strict=True)
    max_trades_30d: int | None = Field(default=None, ge=1, strict=True)


class _TopEscapePublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dma_overextension_threshold: float = Field(default=0.30, ge=0.0, le=1.0)
    fgi_slope_reversal_threshold: float = Field(default=-0.05, le=0.0)
    fgi_slope_recovery_threshold: float = Field(default=0.05, ge=0.0)


class _RotationPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    drift_threshold: float = Field(default=0.03, ge=0.0, le=0.20)
    cooldown_days: int = Field(default=14, ge=0, strict=True)


class DmaGatedFgiPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: _SignalPublicParams = Field(default_factory=_SignalPublicParams)
    pacing: _PacingPublicParams = Field(default_factory=_PacingPublicParams)
    buy_gate: _BuyGatePublicParams = Field(default_factory=_BuyGatePublicParams)
    trade_quota: _TradeQuotaPublicParams = Field(
        default_factory=_TradeQuotaPublicParams
    )
    top_escape: _TopEscapePublicParams = Field(default_factory=_TopEscapePublicParams)


class EthBtcRotationPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: _EthBtcSignalPublicParams = Field(default_factory=_EthBtcSignalPublicParams)
    pacing: _PacingPublicParams = Field(default_factory=_PacingPublicParams)
    buy_gate: _BuyGatePublicParams = Field(default_factory=_BuyGatePublicParams)
    trade_quota: _TradeQuotaPublicParams = Field(
        default_factory=_TradeQuotaPublicParams
    )
    top_escape: _TopEscapePublicParams = Field(default_factory=_TopEscapePublicParams)
    rotation: _RotationPublicParams = Field(default_factory=_RotationPublicParams)


_PUBLIC_PARAMS_MODEL_BY_STRATEGY: Final[dict[str, type[BaseModel]]] = {
    STRATEGY_DCA_CLASSIC: _EmptyPublicParams,
    STRATEGY_DMA_GATED_FGI: DmaGatedFgiPublicParams,
    STRATEGY_ETH_BTC_ROTATION: EthBtcRotationPublicParams,
    STRATEGY_SPY_ETH_BTC_ROTATION: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_RATIO_ZONE: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_RATIO_COOLDOWN: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS: EthBtcRotationPublicParams,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_LATCH_ONLY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_GREED_SUPPRESSION_ONLY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_BUY_FLOOR_ONLY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM: EthBtcRotationPublicParams,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION: (
        EthBtcRotationPublicParams
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING: (
        EthBtcRotationPublicParams
    ),
}

_ETH_BTC_ATTRIBUTION_STRATEGY_IDS: Final[frozenset[str]] = frozenset(
    {
        STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
        STRATEGY_DMA_FGI_ETH_BTC_MINIMUM,
        STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF,
        STRATEGY_DMA_FGI_RATIO_ZONE,
        STRATEGY_DMA_FGI_RATIO_COOLDOWN,
        STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION,
        STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL,
        STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA,
        STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS,
        STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN,
        STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION,
        STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE,
        STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS,
        STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN,
    }
)

_HIERARCHICAL_ATTRIBUTION_STRATEGY_IDS: Final[frozenset[str]] = frozenset(
    {
        STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR,
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY,
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH,
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION,
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR,
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY,
        STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY,
        STRATEGY_DMA_FGI_HIERARCHICAL_SPY_LATCH_ONLY,
        STRATEGY_DMA_FGI_HIERARCHICAL_GREED_SUPPRESSION_ONLY,
        STRATEGY_DMA_FGI_HIERARCHICAL_BUY_FLOOR_ONLY,
        STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY,
        STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING,
    }
)


def supports_nested_public_params(strategy_id: str) -> bool:
    return strategy_id in _PUBLIC_PARAMS_MODEL_BY_STRATEGY


def normalize_nested_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Validate and canonicalize nested public params for a built-in strategy."""
    if strategy_id == STRATEGY_DCA_CLASSIC:
        raw = {} if params is None else dict(params)
        if raw:
            raise ValueError("dca_classic does not accept params")
        return {}

    model_type = _PUBLIC_PARAMS_MODEL_BY_STRATEGY.get(strategy_id)
    if model_type is None:
        raw = {} if params is None else dict(params)
        return cast(dict[str, JsonValue], raw)

    raw_params = {} if params is None else dict(params)
    normalized = model_type.model_validate(raw_params)
    return cast(dict[str, JsonValue], normalized.model_dump(mode="json"))


_DMA_FIELD_MAPPING: Final[list[tuple[str, str, str]]] = [
    # (flat_key, nested_section, nested_key)
    ("cross_cooldown_days", "signal", "cross_cooldown_days"),
    ("cross_on_touch", "signal", "cross_on_touch"),
    ("pacing_k", "pacing", "k"),
    ("pacing_r_max", "pacing", "r_max"),
    ("buy_sideways_window_days", "buy_gate", "window_days"),
    ("buy_sideways_max_range", "buy_gate", "sideways_max_range"),
    ("buy_leg_caps", "buy_gate", "leg_caps"),
    ("min_trade_interval_days", "trade_quota", "min_trade_interval_days"),
    ("max_trades_7d", "trade_quota", "max_trades_7d"),
    ("max_trades_30d", "trade_quota", "max_trades_30d"),
    ("dma_overextension_threshold", "top_escape", "dma_overextension_threshold"),
    ("fgi_slope_reversal_threshold", "top_escape", "fgi_slope_reversal_threshold"),
    ("fgi_slope_recovery_threshold", "top_escape", "fgi_slope_recovery_threshold"),
]

_ROTATION_EXTRA_FIELD_MAPPING: Final[list[tuple[str, str, str]]] = [
    ("ratio_cross_cooldown_days", "signal", "ratio_cross_cooldown_days"),
    ("rotation_neutral_band", "signal", "rotation_neutral_band"),
    ("rotation_max_deviation", "signal", "rotation_max_deviation"),
    ("rotation_drift_threshold", "rotation", "drift_threshold"),
    ("rotation_cooldown_days", "rotation", "cooldown_days"),
]


def _nested_to_flat(
    nested: BaseModel,
    field_mapping: list[tuple[str, str, str]],
) -> dict[str, Any]:
    """Extract flat runtime params from a nested public params model."""
    flat: dict[str, Any] = {}
    for flat_key, section, nested_key in field_mapping:
        section_model = getattr(nested, section)
        value = getattr(section_model, nested_key)
        if isinstance(value, list):
            value = list(value)
        flat[flat_key] = value
    return flat


def _flat_to_nested(
    resolved: BaseModel,
    field_mapping: list[tuple[str, str, str]],
) -> dict[str, dict[str, Any]]:
    """Group flat runtime params into nested section dicts."""
    sections: dict[str, dict[str, Any]] = {}
    for flat_key, section, nested_key in field_mapping:
        value = getattr(resolved, flat_key)
        if isinstance(value, list):
            value = list(value)
        sections.setdefault(section, {})[nested_key] = value
    return sections


def public_params_to_runtime_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Translate nested public params into flat runtime params."""
    normalized = normalize_nested_public_params(strategy_id, params)
    if strategy_id == STRATEGY_DCA_CLASSIC:
        return {}

    if strategy_id == STRATEGY_DMA_GATED_FGI:
        from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams

        nested = DmaGatedFgiPublicParams.model_validate(normalized)
        flat = _nested_to_flat(nested, _DMA_FIELD_MAPPING)
        return DmaGatedFgiParams.from_public_params(flat).to_public_params()

    if strategy_id == STRATEGY_ETH_BTC_ROTATION or (
        strategy_id in _ETH_BTC_ATTRIBUTION_STRATEGY_IDS
    ):
        from src.services.backtesting.strategies.eth_btc_rotation import (
            EthBtcRotationParams,
        )

        nested_rotation = EthBtcRotationPublicParams.model_validate(normalized)
        flat = _nested_to_flat(
            nested_rotation, _DMA_FIELD_MAPPING + _ROTATION_EXTRA_FIELD_MAPPING
        )
        return EthBtcRotationParams.from_public_params(flat).to_public_params()

    if strategy_id == STRATEGY_SPY_ETH_BTC_ROTATION:
        from src.services.backtesting.strategies.spy_eth_btc_rotation import (
            SpyEthBtcRotationParams,
        )

        nested_spy = EthBtcRotationPublicParams.model_validate(normalized)
        flat = _nested_to_flat(
            nested_spy, _DMA_FIELD_MAPPING + _ROTATION_EXTRA_FIELD_MAPPING
        )
        return SpyEthBtcRotationParams.from_public_params(flat).to_public_params()

    if strategy_id == STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO or (
        strategy_id in _HIERARCHICAL_ATTRIBUTION_STRATEGY_IDS
    ):
        from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
            HierarchicalPairRotationParams,
        )

        nested_hierarchical = EthBtcRotationPublicParams.model_validate(normalized)
        flat = _nested_to_flat(
            nested_hierarchical, _DMA_FIELD_MAPPING + _ROTATION_EXTRA_FIELD_MAPPING
        )
        return HierarchicalPairRotationParams.from_public_params(
            flat
        ).to_public_params()

    return normalized


def runtime_params_to_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Translate flat runtime params into the nested public contract."""
    raw_params = {} if params is None else dict(params)
    if strategy_id == STRATEGY_DCA_CLASSIC:
        if raw_params:
            raise ValueError("dca_classic does not accept params")
        return {}

    if strategy_id == STRATEGY_DMA_GATED_FGI:
        from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams

        resolved = DmaGatedFgiParams.from_public_params(raw_params)
        sections = _flat_to_nested(resolved, _DMA_FIELD_MAPPING)
        dma_model = DmaGatedFgiPublicParams(
            signal=_SignalPublicParams(**sections.get("signal", {})),
            pacing=_PacingPublicParams(**sections.get("pacing", {})),
            buy_gate=_BuyGatePublicParams(**sections.get("buy_gate", {})),
            trade_quota=_TradeQuotaPublicParams(**sections.get("trade_quota", {})),
            top_escape=_TopEscapePublicParams(**sections.get("top_escape", {})),
        )
        return cast(dict[str, JsonValue], dma_model.model_dump(mode="json"))

    if strategy_id == STRATEGY_ETH_BTC_ROTATION or (
        strategy_id in _ETH_BTC_ATTRIBUTION_STRATEGY_IDS
    ):
        from src.services.backtesting.strategies.eth_btc_rotation import (
            EthBtcRotationParams,
        )

        resolved_rotation = EthBtcRotationParams.from_public_params(raw_params)
        sections = _flat_to_nested(
            resolved_rotation, _DMA_FIELD_MAPPING + _ROTATION_EXTRA_FIELD_MAPPING
        )
        rotation_model = EthBtcRotationPublicParams(
            signal=_EthBtcSignalPublicParams(**sections.get("signal", {})),
            pacing=_PacingPublicParams(**sections.get("pacing", {})),
            buy_gate=_BuyGatePublicParams(**sections.get("buy_gate", {})),
            trade_quota=_TradeQuotaPublicParams(**sections.get("trade_quota", {})),
            top_escape=_TopEscapePublicParams(**sections.get("top_escape", {})),
            rotation=_RotationPublicParams(**sections.get("rotation", {})),
        )
        return cast(dict[str, JsonValue], rotation_model.model_dump(mode="json"))

    if strategy_id == STRATEGY_SPY_ETH_BTC_ROTATION:
        from src.services.backtesting.strategies.spy_eth_btc_rotation import (
            SpyEthBtcRotationParams,
        )

        resolved_spy = SpyEthBtcRotationParams.from_public_params(raw_params)
        sections = _flat_to_nested(
            resolved_spy, _DMA_FIELD_MAPPING + _ROTATION_EXTRA_FIELD_MAPPING
        )
        spy_model = EthBtcRotationPublicParams(
            signal=_EthBtcSignalPublicParams(**sections.get("signal", {})),
            pacing=_PacingPublicParams(**sections.get("pacing", {})),
            buy_gate=_BuyGatePublicParams(**sections.get("buy_gate", {})),
            trade_quota=_TradeQuotaPublicParams(**sections.get("trade_quota", {})),
            top_escape=_TopEscapePublicParams(**sections.get("top_escape", {})),
            rotation=_RotationPublicParams(**sections.get("rotation", {})),
        )
        return cast(dict[str, JsonValue], spy_model.model_dump(mode="json"))

    if strategy_id == STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO or (
        strategy_id in _HIERARCHICAL_ATTRIBUTION_STRATEGY_IDS
    ):
        from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
            HierarchicalPairRotationParams,
        )

        resolved_hierarchical = HierarchicalPairRotationParams.from_public_params(
            raw_params
        )
        sections = _flat_to_nested(
            resolved_hierarchical,
            _DMA_FIELD_MAPPING + _ROTATION_EXTRA_FIELD_MAPPING,
        )
        hierarchical_model = EthBtcRotationPublicParams(
            signal=_EthBtcSignalPublicParams(**sections.get("signal", {})),
            pacing=_PacingPublicParams(**sections.get("pacing", {})),
            buy_gate=_BuyGatePublicParams(**sections.get("buy_gate", {})),
            trade_quota=_TradeQuotaPublicParams(**sections.get("trade_quota", {})),
            top_escape=_TopEscapePublicParams(**sections.get("top_escape", {})),
            rotation=_RotationPublicParams(**sections.get("rotation", {})),
        )
        return cast(
            dict[str, JsonValue],
            hierarchical_model.model_dump(mode="json"),
        )

    return cast(dict[str, JsonValue], raw_params)


def get_nested_public_params_schema(strategy_id: str) -> dict[str, JsonValue]:
    if strategy_id == STRATEGY_DCA_CLASSIC:
        return cast(dict[str, JsonValue], _EmptyPublicParams.model_json_schema())
    model_type = _PUBLIC_PARAMS_MODEL_BY_STRATEGY.get(strategy_id)
    if model_type is None:
        raise ValueError(f"Unknown strategy_id '{strategy_id}'")
    return cast(dict[str, JsonValue], model_type.model_json_schema())


def get_default_public_params(strategy_id: str) -> dict[str, JsonValue]:
    return normalize_nested_public_params(strategy_id, {})


def normalize_saved_strategy_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Normalize public params for persisted/admin strategy configs.

    Built-in strategies must use the nested public schema. Unknown strategy IDs
    keep their existing free-form params to avoid breaking test-only extension
    families that are validated through the composition catalog instead.
    """
    if supports_nested_public_params(strategy_id):
        return normalize_nested_public_params(strategy_id, params)
    raw = {} if params is None else dict(params)
    return cast(dict[str, JsonValue], raw)


__all__ = [
    "DmaGatedFgiPublicParams",
    "EthBtcRotationPublicParams",
    "get_default_public_params",
    "get_nested_public_params_schema",
    "normalize_nested_public_params",
    "normalize_saved_strategy_public_params",
    "public_params_to_runtime_params",
    "runtime_params_to_public_params",
    "supports_nested_public_params",
]

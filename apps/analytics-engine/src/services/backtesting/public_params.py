"""Public strategy params contract helpers.

This module defines the nested public `params` schema exposed by the API and
translates it to the flat runtime params consumed by the strategy classes.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Final, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator

from src.services.backtesting.portfolio_rules import RULE_NAMES

if TYPE_CHECKING:
    from src.services.backtesting.strategy_registry import StrategyRecipe


class _SignalPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cross_cooldown_days: int = Field(default=30, ge=0, strict=True)
    cross_on_touch: bool = Field(default=True)


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
    overextension_threshold_multiplier_greed: float = Field(
        default=0.50,
        ge=0.0,
        le=2.0,
    )
    overextension_threshold_multiplier_extreme_greed: float = Field(
        default=0.33,
        ge=0.0,
        le=2.0,
    )
    fgi_slope_reversal_threshold: float = Field(default=-0.05, le=0.0)
    fgi_slope_recovery_threshold: float = Field(default=0.05, ge=0.0)


class DmaGatedFgiPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: _SignalPublicParams = Field(default_factory=_SignalPublicParams)
    pacing: _PacingPublicParams = Field(default_factory=_PacingPublicParams)
    buy_gate: _BuyGatePublicParams = Field(default_factory=_BuyGatePublicParams)
    trade_quota: _TradeQuotaPublicParams = Field(
        default_factory=_TradeQuotaPublicParams
    )
    top_escape: _TopEscapePublicParams = Field(default_factory=_TopEscapePublicParams)
    disabled_rules: list[str] = Field(default_factory=list)
    enabled_rules: list[str] | None = Field(default=None)

    @field_validator("disabled_rules", "enabled_rules")
    @classmethod
    def validate_rule_names(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        invalid_rules = sorted(set(value) - RULE_NAMES)
        if invalid_rules:
            joined = ", ".join(invalid_rules)
            raise ValueError(f"Unsupported portfolio rule names: {joined}")
        return value


def _get_recipe(strategy_id: str) -> StrategyRecipe:
    from src.services.backtesting.strategy_registry import get_strategy_recipe

    return get_strategy_recipe(strategy_id)


def supports_nested_public_params(strategy_id: str) -> bool:
    try:
        _get_recipe(strategy_id)
    except ValueError:
        return False
    return True


def normalize_nested_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Validate and canonicalize nested public params for a built-in strategy."""
    raw_params = {} if params is None else dict(params)
    try:
        recipe = _get_recipe(strategy_id)
    except ValueError:
        return cast(dict[str, JsonValue], raw_params)

    normalized = recipe.public_params_model.model_validate(raw_params)
    return cast(dict[str, JsonValue], normalized.model_dump(mode="json"))


_DMA_FIELD_MAPPING: Final[list[tuple[str, tuple[str, ...]]]] = [
    # (flat_key, public_param_path)
    ("cross_cooldown_days", ("signal", "cross_cooldown_days")),
    ("cross_on_touch", ("signal", "cross_on_touch")),
    ("pacing_k", ("pacing", "k")),
    ("pacing_r_max", ("pacing", "r_max")),
    ("buy_sideways_window_days", ("buy_gate", "window_days")),
    ("buy_sideways_max_range", ("buy_gate", "sideways_max_range")),
    ("buy_leg_caps", ("buy_gate", "leg_caps")),
    ("min_trade_interval_days", ("trade_quota", "min_trade_interval_days")),
    ("max_trades_7d", ("trade_quota", "max_trades_7d")),
    ("max_trades_30d", ("trade_quota", "max_trades_30d")),
    ("dma_overextension_threshold", ("top_escape", "dma_overextension_threshold")),
    (
        "overextension_threshold_multiplier_greed",
        ("top_escape", "overextension_threshold_multiplier_greed"),
    ),
    (
        "overextension_threshold_multiplier_extreme_greed",
        ("top_escape", "overextension_threshold_multiplier_extreme_greed"),
    ),
    ("fgi_slope_reversal_threshold", ("top_escape", "fgi_slope_reversal_threshold")),
    ("fgi_slope_recovery_threshold", ("top_escape", "fgi_slope_recovery_threshold")),
    ("disabled_rules", ("disabled_rules",)),
    ("enabled_rules", ("enabled_rules",)),
]


def _json_ready_value(value: Any) -> Any:
    if isinstance(value, frozenset | set):
        return sorted(value)
    if isinstance(value, list):
        return list(value)
    return value


def _nested_to_flat(
    nested: BaseModel,
    field_mapping: list[tuple[str, tuple[str, ...]]],
) -> dict[str, Any]:
    """Extract flat runtime params from a nested public params model."""
    flat: dict[str, Any] = {}
    for flat_key, path in field_mapping:
        if len(path) == 1:
            value = getattr(nested, path[0])
        else:
            section_model = getattr(nested, path[0])
            value = getattr(section_model, path[1])
        flat[flat_key] = _json_ready_value(value)
    return flat


def _flat_to_nested(
    resolved: BaseModel,
    field_mapping: list[tuple[str, tuple[str, ...]]],
) -> dict[str, Any]:
    """Group flat runtime params into nested section dicts."""
    nested: dict[str, Any] = {}
    for flat_key, path in field_mapping:
        value = _json_ready_value(getattr(resolved, flat_key))
        if len(path) == 1:
            nested[path[0]] = value
        else:
            nested.setdefault(path[0], {})[path[1]] = value
    return nested


def public_params_to_runtime_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Translate nested public params into flat runtime params."""
    raw_params = {} if params is None else dict(params)
    try:
        recipe = _get_recipe(strategy_id)
    except ValueError:
        return cast(dict[str, JsonValue], raw_params)

    normalized_model = recipe.public_params_model.model_validate(raw_params)
    normalized = cast(
        dict[str, JsonValue],
        normalized_model.model_dump(mode="json"),
    )

    if recipe.param_family == "dma":
        from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
            DmaGatedFgiParams,
        )

        nested = DmaGatedFgiPublicParams.model_validate(normalized)
        flat = _nested_to_flat(nested, _DMA_FIELD_MAPPING)
        return DmaGatedFgiParams.from_public_params(flat).to_public_params()

    return normalized


def runtime_params_to_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Translate flat runtime params into the nested public contract."""
    raw_params = {} if params is None else dict(params)
    try:
        recipe = _get_recipe(strategy_id)
    except ValueError:
        return cast(dict[str, JsonValue], raw_params)

    if recipe.param_family == "dma":
        from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
            DmaGatedFgiParams,
        )

        resolved = DmaGatedFgiParams.from_public_params(raw_params)
        sections = _flat_to_nested(resolved, _DMA_FIELD_MAPPING)
        dma_model = DmaGatedFgiPublicParams(
            signal=_SignalPublicParams(**sections.get("signal", {})),
            pacing=_PacingPublicParams(**sections.get("pacing", {})),
            buy_gate=_BuyGatePublicParams(**sections.get("buy_gate", {})),
            trade_quota=_TradeQuotaPublicParams(**sections.get("trade_quota", {})),
            top_escape=_TopEscapePublicParams(**sections.get("top_escape", {})),
            disabled_rules=sections.get("disabled_rules", []),
            enabled_rules=sections.get("enabled_rules"),
        )
        return cast(dict[str, JsonValue], dma_model.model_dump(mode="json"))

    return cast(dict[str, JsonValue], raw_params)


def get_nested_public_params_schema(strategy_id: str) -> dict[str, JsonValue]:
    recipe = _get_recipe(strategy_id)
    return cast(dict[str, JsonValue], recipe.public_params_model.model_json_schema())


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
    "get_default_public_params",
    "get_nested_public_params_schema",
    "normalize_nested_public_params",
    "normalize_saved_strategy_public_params",
    "public_params_to_runtime_params",
    "runtime_params_to_public_params",
    "supports_nested_public_params",
]

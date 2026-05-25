"""Public strategy params contract helpers.

This module defines the nested public `params` schema exposed by the API and
translates it to the flat runtime params consumed by the strategy classes.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from functools import lru_cache
from typing import TYPE_CHECKING, Any, Self, cast

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)

from src.services.backtesting.portfolio_rules import RULE_NAMES

if TYPE_CHECKING:
    from src.services.backtesting.strategy_registry import StrategyRecipe


class _SignalPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cross_cooldown_days: int = Field(default=30, ge=0, strict=True)
    cross_on_touch: bool = Field(default=True)


class _PacingPublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    k: float = Field(default=5.0, serialization_alias="pacing_k")
    r_max: float = Field(default=1.0, serialization_alias="pacing_r_max")


class _BuyGatePublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    window_days: int = Field(
        default=5,
        ge=1,
        strict=True,
        serialization_alias="buy_sideways_window_days",
    )
    sideways_max_range: float = Field(
        default=0.04,
        ge=0.0,
        serialization_alias="buy_sideways_max_range",
    )
    leg_caps: list[float] = Field(
        default_factory=lambda: [0.05, 0.10, 0.20],
        serialization_alias="buy_leg_caps",
    )


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


class _TargetWeightsParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    btc: float = Field(default=0.25, ge=0.0, le=1.0)
    eth: float = Field(default=0.25, ge=0.0, le=1.0)
    spy: float = Field(default=0.25, ge=0.0, le=1.0)
    stable: float = Field(default=0.25, ge=0.0, le=1.0)


class FixedIntervalRebalancePublicParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interval_days: int = Field(default=30, ge=1, le=365, strict=True)
    min_drift_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    target_weights: _TargetWeightsParams = Field(default_factory=_TargetWeightsParams)

    @model_validator(mode="after")
    def _weights_sum_to_one(self) -> Self:
        total = (
            self.target_weights.btc
            + self.target_weights.eth
            + self.target_weights.spy
            + self.target_weights.stable
        )
        if not math.isclose(total, 1.0, abs_tol=1e-4):
            raise ValueError(f"target_weights must sum to 1.0 (got {total:.6f})")
        return self


def _get_recipe(strategy_id: str) -> StrategyRecipe:
    from src.services.backtesting.strategy_registry import get_strategy_recipe

    return get_strategy_recipe(strategy_id)


def _resolve_recipe(strategy_id: str) -> StrategyRecipe | None:
    try:
        return _get_recipe(strategy_id)
    except ValueError:
        return None


def _copy_params(params: Mapping[str, Any] | None) -> dict[str, Any]:
    return {} if params is None else dict(params)


def _as_json_params(params: Mapping[str, Any]) -> dict[str, JsonValue]:
    return cast(dict[str, JsonValue], dict(params))


def _dump_model_json(model: BaseModel) -> dict[str, JsonValue]:
    return cast(dict[str, JsonValue], model.model_dump(mode="json"))


def _normalize_recipe_params(
    recipe: StrategyRecipe,
    params: Mapping[str, Any],
) -> dict[str, JsonValue]:
    normalized = recipe.public_params_model.model_validate(params)
    return _dump_model_json(normalized)


def supports_nested_public_params(strategy_id: str) -> bool:
    return _resolve_recipe(strategy_id) is not None


def normalize_nested_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Validate and canonicalize nested public params for a built-in strategy."""
    raw_params = _copy_params(params)
    recipe = _resolve_recipe(strategy_id)
    if recipe is None:
        return _as_json_params(raw_params)
    return _normalize_recipe_params(recipe, raw_params)


def _flat_key(field_name: str, field_info: Any) -> str:
    serialization_alias = getattr(field_info, "serialization_alias", None)
    return serialization_alias if isinstance(serialization_alias, str) else field_name


@lru_cache(maxsize=1)
def _dma_field_mapping() -> tuple[tuple[str, tuple[str, ...]], ...]:
    mapping: list[tuple[str, tuple[str, ...]]] = []
    for field_name, field_info in DmaGatedFgiPublicParams.model_fields.items():
        annotation = field_info.annotation
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            for nested_name, nested_info in annotation.model_fields.items():
                mapping.append(
                    (
                        _flat_key(nested_name, nested_info),
                        (field_name, nested_name),
                    )
                )
            continue
        mapping.append((_flat_key(field_name, field_info), (field_name,)))
    return tuple(mapping)


def _json_ready_value(value: Any) -> Any:
    if isinstance(value, frozenset | set):
        return sorted(value)
    return value


def _nested_to_flat(nested: BaseModel) -> dict[str, Any]:
    """Extract flat runtime params from a nested public params model."""
    flat: dict[str, Any] = {}
    for flat_key, path in _dma_field_mapping():
        if len(path) == 1:
            value = getattr(nested, path[0])
        else:
            section_model = getattr(nested, path[0])
            value = getattr(section_model, path[1])
        flat[flat_key] = _json_ready_value(value)
    return flat


def _flat_to_nested(resolved: BaseModel) -> dict[str, Any]:
    """Group flat runtime params into nested section dicts."""
    nested: dict[str, Any] = {}
    for flat_key, path in _dma_field_mapping():
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
    raw_params = _copy_params(params)
    recipe = _resolve_recipe(strategy_id)
    if recipe is None:
        return _as_json_params(raw_params)

    normalized = _normalize_recipe_params(recipe, raw_params)

    if recipe.param_family == "dma":
        from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
            DmaGatedFgiParams,
        )

        nested = DmaGatedFgiPublicParams.model_validate(normalized)
        flat = _nested_to_flat(nested)
        return DmaGatedFgiParams.from_public_params(flat).to_public_params()

    return normalized


def runtime_params_to_public_params(
    strategy_id: str,
    params: Mapping[str, Any] | None,
) -> dict[str, JsonValue]:
    """Translate flat runtime params into the nested public contract."""
    raw_params = _copy_params(params)
    recipe = _resolve_recipe(strategy_id)
    if recipe is None:
        return _as_json_params(raw_params)

    if recipe.param_family == "dma":
        from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
            DmaGatedFgiParams,
        )

        resolved = DmaGatedFgiParams.from_public_params(raw_params)
        sections = _flat_to_nested(resolved)
        dma_model = DmaGatedFgiPublicParams.model_validate(sections)
        return _dump_model_json(dma_model)

    return _as_json_params(raw_params)


@lru_cache(maxsize=32)
def get_nested_public_params_schema(strategy_id: str) -> dict[str, JsonValue]:
    recipe = _get_recipe(strategy_id)
    return _as_json_params(recipe.public_params_model.model_json_schema())


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
    return normalize_nested_public_params(strategy_id, params)


__all__ = [
    "DmaGatedFgiPublicParams",
    "FixedIntervalRebalancePublicParams",
    "get_default_public_params",
    "get_nested_public_params_schema",
    "normalize_nested_public_params",
    "normalize_saved_strategy_public_params",
    "public_params_to_runtime_params",
    "runtime_params_to_public_params",
    "supports_nested_public_params",
]

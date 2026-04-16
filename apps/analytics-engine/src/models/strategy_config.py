"""Strategy configuration models for saved strategy configs and admin APIs."""

from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, Field, JsonValue, model_validator

from src.models.backtesting import BacktestStrategyCatalogEntryV3
from src.models.validation_utils import normalize_asset_symbol, validate_config_id
from src.services.backtesting.public_params import (
    normalize_saved_strategy_public_params,
)


def _normalize_strategy_id(value: str) -> str:
    normalized = str(value).strip()
    return validate_config_id(normalized, "strategy_id")


class StrategyPreset(BaseModel):
    config_id: str = Field(description="Stable preset identifier")
    display_name: str
    description: str | None = None
    strategy_id: str
    params: dict[str, JsonValue] = Field(default_factory=dict)
    is_default: bool = False
    is_benchmark: bool = False

    @model_validator(mode="after")
    def check_config_id(self) -> Self:
        validate_config_id(self.config_id)
        self.strategy_id = _normalize_strategy_id(self.strategy_id)
        self.params = normalize_saved_strategy_public_params(
            self.strategy_id,
            self.params,
        )
        return self


class StrategyComponentRef(BaseModel):
    """Reference to one composable strategy component."""

    component_id: str = Field(description="Stable component identifier")
    params: dict[str, JsonValue] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_component_id(self) -> Self:
        validate_config_id(self.component_id, "component_id")
        return self


class StrategyComposition(BaseModel):
    """Internal composition payload persisted for saved strategy configs."""

    kind: Literal["benchmark", "composed"] = Field(default="composed")
    bucket_mapper_id: str = Field(default="two_bucket_spot_stable")
    signal: StrategyComponentRef | None = None
    decision_policy: StrategyComponentRef | None = None
    pacing_policy: StrategyComponentRef | None = None
    execution_profile: StrategyComponentRef | None = None
    plugins: list[StrategyComponentRef] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_composition(self) -> Self:
        validate_config_id(self.bucket_mapper_id, "bucket_mapper_id")
        if self.kind == "benchmark":
            if (
                self.signal is not None
                or self.decision_policy is not None
                or self.pacing_policy is not None
                or self.execution_profile is not None
                or self.plugins
            ):
                raise ValueError(
                    "benchmark composition must not declare signal/policy/pacing/execution components"
                )
        return self


class SavedStrategyConfig(BaseModel):
    """Authoritative saved config used by backtesting and daily suggestion."""

    config_id: str = Field(description="Stable saved config identifier")
    display_name: str
    description: str | None = None
    strategy_id: str
    primary_asset: str = Field(default="BTC")
    params: dict[str, JsonValue] = Field(default_factory=dict)
    composition: StrategyComposition
    supports_daily_suggestion: bool = False
    is_default: bool = False
    is_benchmark: bool = False

    @model_validator(mode="after")
    def validate_saved_config(self) -> Self:
        validate_config_id(self.config_id)
        self.strategy_id = _normalize_strategy_id(self.strategy_id)
        self.primary_asset = _normalize_primary_asset(self.primary_asset)
        self.params = normalize_saved_strategy_public_params(
            self.strategy_id,
            self.params,
        )
        if self.is_default and self.is_benchmark:
            raise ValueError("saved config cannot be both default and benchmark")
        return self

    def to_public_preset(self) -> StrategyPreset:
        """Project an internal saved config to the existing preset payload."""
        return StrategyPreset(
            config_id=self.config_id,
            display_name=self.display_name,
            description=self.description,
            strategy_id=self.strategy_id,
            params=dict(self.params),
            is_default=self.is_default,
            is_benchmark=self.is_benchmark,
        )


class BacktestDefaults(BaseModel):
    days: int = Field(default=500)
    total_capital: float = Field(default=10000)


class StrategyConfigsResponse(BaseModel):
    strategies: list[BacktestStrategyCatalogEntryV3]
    presets: list[StrategyPreset]
    backtest_defaults: BacktestDefaults


def _normalize_primary_asset(value: str) -> str:
    return normalize_asset_symbol(value, "primary_asset")


class SavedStrategyConfigMutationBase(BaseModel):
    display_name: str
    description: str | None = None
    strategy_id: str
    primary_asset: str = Field(default="BTC")
    params: dict[str, JsonValue] = Field(default_factory=dict)
    composition: StrategyComposition
    supports_daily_suggestion: bool = False

    @model_validator(mode="after")
    def validate_mutation(self) -> Self:
        self.strategy_id = _normalize_strategy_id(self.strategy_id)
        self.primary_asset = _normalize_primary_asset(self.primary_asset)
        self.params = normalize_saved_strategy_public_params(
            self.strategy_id,
            self.params,
        )
        return self


class CreateSavedStrategyConfigRequest(SavedStrategyConfigMutationBase):
    config_id: str = Field(description="Stable saved config identifier")

    @model_validator(mode="after")
    def validate_create_request(self) -> Self:
        validate_config_id(self.config_id)
        return self


class UpdateSavedStrategyConfigRequest(SavedStrategyConfigMutationBase):
    pass


class SavedStrategyConfigResponse(BaseModel):
    config: SavedStrategyConfig


class SavedStrategyConfigListResponse(BaseModel):
    configs: list[SavedStrategyConfig]

"""Strategy configuration models for saved strategy configs and presets."""

from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.models.backtesting import BacktestStrategyCatalogEntryV3
from src.models.validation_utils import normalize_asset_symbol, validate_config_id


def _normalize_strategy_id(value: str) -> str:
    normalized = str(value).strip()
    return validate_config_id(normalized, "strategy_id")


class StrategyPreset(BaseModel):
    # A config names a spec; a leftover ``params`` is an error, not an ignored key.
    model_config = ConfigDict(extra="forbid")

    config_id: str = Field(description="Stable preset identifier")
    display_name: str
    description: str | None = None
    strategy_id: str
    spec_ref: str | None = Field(
        default=None,
        description="The locked reference spec the strategy runs; null for a benchmark.",
    )
    is_default: bool = False
    is_benchmark: bool = False

    @model_validator(mode="after")
    def check_config_id(self) -> Self:
        validate_config_id(self.config_id)
        self.strategy_id = _normalize_strategy_id(self.strategy_id)
        return self


class SavedStrategyConfig(BaseModel):
    """Authoritative saved config used by backtesting and daily suggestion."""

    model_config = ConfigDict(extra="forbid")

    config_id: str = Field(description="Stable saved config identifier")
    display_name: str
    description: str | None = None
    strategy_id: str
    primary_asset: str = Field(default="BTC")
    spec_ref: str | None = Field(
        default=None,
        description=(
            "The locked reference spec the config runs (a path under "
            "src/config/strategies/); null for the recipe's own reference or a "
            "benchmark."
        ),
    )
    supports_daily_suggestion: bool = False
    is_default: bool = False
    is_benchmark: bool = False

    @model_validator(mode="after")
    def validate_saved_config(self) -> Self:
        validate_config_id(self.config_id)
        self.strategy_id = _normalize_strategy_id(self.strategy_id)
        self.primary_asset = _normalize_primary_asset(self.primary_asset)
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
            spec_ref=self.spec_ref,
            is_default=self.is_default,
            is_benchmark=self.is_benchmark,
        )


class BacktestDefaults(BaseModel):
    days: int = Field(default=500)
    total_capital: float = Field(default=10000)


class PortfolioRuleMetadata(BaseModel):
    name: str
    priority: int
    description: str


class StrategyConfigsResponse(BaseModel):
    strategies: list[BacktestStrategyCatalogEntryV3]
    presets: list[StrategyPreset]
    backtest_defaults: BacktestDefaults
    portfolio_rules: list[PortfolioRuleMetadata] = Field(default_factory=list)


def _normalize_primary_asset(value: str) -> str:
    return normalize_asset_symbol(value, "primary_asset")

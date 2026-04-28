"""Backtesting API models for the recipe-first v3 framework."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    computed_field,
    model_validator,
)

from src.models.market_data_freshness import MarketDataFreshness
from src.models.validation_utils import validate_config_id
from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.public_params import (
    public_params_to_runtime_params,
    supports_nested_public_params,
)

StrategyId = str
SignalId = str
ActionType = Literal["buy", "sell", "hold"]
BucketType = Literal["spot", "stable", "btc", "eth", "spy"]
SpotAssetType = Literal["BTC", "ETH", "SPY"]
ExecutionStatus = Literal["action_required", "blocked", "no_action"]


def _validate_strategy_id(strategy_id: str) -> str:
    from src.services.backtesting.strategy_registry import validate_strategy_id

    return validate_strategy_id(strategy_id)


def _validate_date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise ValueError("start_date must be before end_date")


def _assert_sums_to_one(total: float, label: str = "allocation") -> None:
    """Validate that a total is approximately 1.0 (within 0.001 tolerance)."""
    if abs(total - 1.0) > 0.001:
        raise ValueError(f"{label} must sum to 1.0, got {total:.6f}")


class Allocation(BaseModel):
    """Two-bucket target/current allocation."""

    spot: float = Field(ge=0.0, le=1.0)
    stable: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_sum(self) -> Self:
        _assert_sums_to_one(self.spot + self.stable, "allocation")
        return self


class AssetAllocation(BaseModel):
    """Five-bucket display allocation."""

    btc: float = Field(ge=0.0, le=1.0)
    eth: float = Field(ge=0.0, le=1.0)
    spy: float = Field(ge=0.0, le=1.0)
    stable: float = Field(ge=0.0, le=1.0)
    alt: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_sum(self) -> Self:
        _assert_sums_to_one(
            self.btc + self.eth + self.spy + self.stable + self.alt,
            "asset allocation",
        )
        return self


class PortfolioState(BaseModel):
    spot_usd: float = Field(ge=0.0)
    stable_usd: float = Field(ge=0.0)
    total_value: float = Field(ge=0.0)
    allocation: Allocation
    asset_allocation: AssetAllocation
    spot_asset: SpotAssetType | None = None


class TransferRecord(BaseModel):
    from_bucket: BucketType
    to_bucket: BucketType
    amount_usd: float = Field(ge=0.0)


class SignalState(BaseModel):
    id: SignalId
    regime: str
    raw_value: float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    details: dict[str, JsonValue] = Field(default_factory=dict)


class DecisionState(BaseModel):
    action: ActionType
    reason: str
    rule_group: RuleGroup
    target_allocation: Allocation
    target_asset_allocation: AssetAllocation
    immediate: bool = False
    details: dict[str, JsonValue] = Field(default_factory=dict)


class ExecutionDiagnostics(BaseModel):
    plugins: dict[str, dict[str, JsonValue] | None] = Field(default_factory=dict)


class ExecutionState(BaseModel):
    event: str | None = None
    transfers: list[TransferRecord] = Field(default_factory=list)
    blocked_reason: str | None = None
    status: ExecutionStatus = "no_action"
    action_required: bool = False
    step_count: int = Field(ge=0)
    steps_remaining: int = Field(ge=0)
    interval_days: int = Field(ge=0)
    diagnostics: ExecutionDiagnostics = Field(default_factory=ExecutionDiagnostics)


class StrategyState(BaseModel):
    portfolio: PortfolioState
    signal: SignalState | None = None
    decision: DecisionState
    execution: ExecutionState


class MarketSnapshot(BaseModel):
    date: date
    token_price: dict[str, float]
    sentiment: int | None = None
    sentiment_label: str | None = None


class TimelinePoint(BaseModel):
    market: MarketSnapshot
    strategies: dict[str, StrategyState]


class StrategySummary(BaseModel):
    strategy_id: StrategyId
    display_name: str
    signal_id: SignalId | None = None
    total_invested: float = Field(ge=0.0)
    final_value: float = Field(ge=0.0)
    roi_percent: float
    trade_count: int = Field(ge=0)
    calmar_ratio: float = 0.0
    max_drawdown_percent: float = 0.0
    final_allocation: Allocation
    final_asset_allocation: AssetAllocation
    parameters: dict[str, JsonValue] = Field(default_factory=dict)


class BacktestPeriodInfo(BaseModel):
    start_date: date
    end_date: date
    days: int = Field(ge=0)


class BacktestWindowInfo(BaseModel):
    requested: BacktestPeriodInfo
    effective: BacktestPeriodInfo

    @computed_field(return_type=bool)  # type: ignore[prop-decorator]
    @property
    def truncated(self) -> bool:
        return self.requested != self.effective


class BacktestResponse(BaseModel):
    strategies: dict[str, StrategySummary]
    timeline: list[TimelinePoint]
    window: BacktestWindowInfo | None = None
    data_freshness: MarketDataFreshness | None = None


class BacktestCompareConfigV3(BaseModel):
    model_config = ConfigDict(revalidate_instances="never")

    config_id: str = Field(description="Unique request-scoped identifier")
    saved_config_id: str | None = Field(
        default=None,
        description="Stable saved config reference for saved-config-first compare.",
    )
    strategy_id: StrategyId | None = None
    params: dict[str, JsonValue] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def validate_config(cls, data: Any) -> Any:
        from src.services.backtesting.strategy_registry import get_strategy_recipe

        if isinstance(data, cls):
            return data

        if not isinstance(data, dict):
            return data

        raw = dict(data)
        config_id = raw.get("config_id")
        if isinstance(config_id, str):
            validate_config_id(config_id)

        saved_config_id = raw.get("saved_config_id")
        strategy_id = raw.get("strategy_id")
        params = raw.get("params") or {}

        if saved_config_id is not None:
            validate_config_id(saved_config_id, "saved_config_id")
            if strategy_id is not None:
                raise ValueError("saved_config_id cannot be combined with strategy_id")
            if params:
                raise ValueError(
                    "saved_config_id cannot be combined with inline params"
                )
            return raw

        if strategy_id is None:
            raise ValueError(
                "compare config must provide either saved_config_id or strategy_id"
            )

        normalized_strategy_id = _validate_strategy_id(strategy_id)
        raw["strategy_id"] = normalized_strategy_id
        recipe = get_strategy_recipe(normalized_strategy_id)
        if supports_nested_public_params(normalized_strategy_id):
            raw["params"] = public_params_to_runtime_params(
                normalized_strategy_id,
                params,
            )
        else:
            raw["params"] = recipe.normalize_public_params(params)
        return raw


class BacktestCompareRequestV3(BaseModel):
    token_symbol: str = Field(default="BTC")
    start_date: date | None = None
    end_date: date | None = None
    days: int | None = None
    total_capital: float = Field(default=10000.0, gt=0.0)
    configs: list[BacktestCompareConfigV3]

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        _validate_date_range(self.start_date, self.end_date)
        if not self.configs:
            raise ValueError("configs must contain at least one config")
        config_ids = [cfg.config_id for cfg in self.configs]
        if len(config_ids) != len(set(config_ids)):
            raise ValueError("config_id values must be unique")
        return self


class BacktestStrategyCatalogEntryV3(BaseModel):
    strategy_id: StrategyId
    display_name: str
    description: str | None = None
    param_schema: dict[str, JsonValue]
    default_params: dict[str, JsonValue] = Field(default_factory=dict)
    supports_daily_suggestion: bool = False


class BacktestStrategyCatalogResponseV3(BaseModel):
    catalog_version: str
    strategies: list[BacktestStrategyCatalogEntryV3]

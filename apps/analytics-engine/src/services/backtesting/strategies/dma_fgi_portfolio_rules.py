"""Flat portfolio-level DMA/FGI rule strategy preset."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, TypeVar, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.execution.dma_buy_gate_plugin import (
    DmaBuyGateExecutionPlugin,
)
from src.services.backtesting.execution.pacing.fgi_exponential import (
    FgiExponentialPacingPolicy,
)
from src.services.backtesting.execution.plugins import ExecutionPlugin
from src.services.backtesting.execution.rule_based.allocation_executor import (
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.execution.trade_quota_guard_plugin import (
    TradeQuotaGuardExecutionPlugin,
)
from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULE_NAMES,
    DEFAULT_PORTFOLIO_RULES,
)
from src.services.backtesting.portfolio_rules import (
    RULE_NAMES as PORTFOLIO_RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    PORTFOLIO_RULE_SYMBOLS,
    PortfolioRule,
    PortfolioRuleConfig,
)
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.decision_policy import (
    PORTFOLIO_RULES_SIGNAL_ID,
    DmaFgiPortfolioRulesDecisionPolicy,
    RuleExecutionState,
    active_rules,
    assert_known_rule_names,
    build_portfolio_rules_for_params,
    build_risk_guards_for_params,
    fresh_portfolio_rule,
    required_rule,
)
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.public_params import runtime_params_to_public_params
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
    build_initial_flat_minimum_asset_allocation,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.composed import ComposedSignalStrategy
from src.services.backtesting.tactics.rules import (
    RULE_NAMES as TACTICAL_RULE_NAMES,
)
from src.services.backtesting.utils import (
    coerce_bool,
    coerce_float,
    coerce_float_list,
    coerce_int,
    coerce_nullable_int,
    coerce_params,
)

_RuleT = TypeVar("_RuleT", bound=PortfolioRule)

DMA_GATED_FGI_PUBLIC_PARAM_KEYS = frozenset(
    {
        "cross_cooldown_days",
        "cross_on_touch",
        "pacing_k",
        "pacing_r_max",
        "buy_sideways_window_days",
        "buy_sideways_max_range",
        "buy_leg_caps",
        "min_trade_interval_days",
        "max_trades_7d",
        "max_trades_30d",
        "dma_overextension_threshold",
        "fgi_slope_reversal_threshold",
        "fgi_slope_recovery_threshold",
        "disabled_rules",
        "enabled_rules",
    }
)

_DMA_COERCION_SPEC: dict[str, Any] = {
    "cross_cooldown_days": coerce_int,
    "cross_on_touch": coerce_bool,
    "pacing_k": coerce_float,
    "pacing_r_max": coerce_float,
    "buy_sideways_window_days": coerce_int,
    "buy_sideways_max_range": coerce_float,
    "buy_leg_caps": coerce_float_list,
    "min_trade_interval_days": coerce_nullable_int,
    "max_trades_7d": coerce_nullable_int,
    "max_trades_30d": coerce_nullable_int,
    "dma_overextension_threshold": coerce_float,
    "fgi_slope_reversal_threshold": coerce_float,
    "fgi_slope_recovery_threshold": coerce_float,
}


def _coerce_rule_name_set(value: Any, *, field_name: str) -> frozenset[str]:
    if not isinstance(value, list | tuple | set | frozenset):
        raise ValueError(f"{field_name} must be an array of rule names")
    names = frozenset(str(item) for item in value)
    invalid_names = sorted(names - _KNOWN_RULE_NAMES)
    if invalid_names:
        joined = ", ".join(invalid_names)
        raise ValueError(f"{field_name} contains unsupported rule names: {joined}")
    return names


def _coerce_optional_rule_name_set(
    value: Any,
    *,
    field_name: str,
) -> frozenset[str] | None:
    if value is None:
        return None
    return _coerce_rule_name_set(value, field_name=field_name)


_KNOWN_RULE_NAMES = PORTFOLIO_RULE_NAMES | TACTICAL_RULE_NAMES
_DMA_COERCION_SPEC["disabled_rules"] = _coerce_rule_name_set
_DMA_COERCION_SPEC["enabled_rules"] = _coerce_optional_rule_name_set


class DmaGatedFgiParams(BaseModel):
    """Single public parameter surface for the DMA/FGI portfolio rules strategy."""

    model_config = ConfigDict(extra="forbid")

    cross_cooldown_days: int = Field(
        default=30,
        ge=0,
        description="Days to suppress repeat DMA cross actions after an actionable cross.",
    )
    cross_on_touch: bool = Field(
        default=True,
        description="Treat touching the DMA threshold as a cross trigger.",
    )
    pacing_k: float = Field(
        default=5.0,
        description="Steepness parameter for the shared fgi_exponential pacing curve.",
    )
    pacing_r_max: float = Field(
        default=1.0,
        description="Upper multiplier cap for the shared fgi_exponential pacing curve.",
    )
    buy_sideways_window_days: int = Field(
        default=5,
        ge=1,
        description="Observation window for the DMA sideways buy-gate plugin.",
    )
    buy_sideways_max_range: float = Field(
        default=0.04,
        ge=0.0,
        description="Maximum sideways range allowed before the DMA buy-gate opens.",
    )
    buy_leg_caps: list[float] = Field(
        default_factory=lambda: [0.05, 0.10, 0.20],
        description="Per-leg portfolio caps enforced by the DMA buy-gate plugin.",
    )
    min_trade_interval_days: int | None = Field(
        default=None,
        ge=1,
        description="Minimum days required between any two executed trades.",
    )
    max_trades_7d: int | None = Field(
        default=None,
        ge=1,
        description="Maximum executed trades allowed within a rolling 7-day window.",
    )
    max_trades_30d: int | None = Field(
        default=None,
        ge=1,
        description="Maximum executed trades allowed within a rolling 30-day window.",
    )
    dma_overextension_threshold: float = Field(
        default=0.30,
        ge=0.0,
        le=1.0,
        description="DMA distance threshold above which overextension sell triggers.",
    )
    fgi_slope_reversal_threshold: float = Field(
        default=-0.05,
        le=0.0,
        description="FGI slope threshold below which greed-fading sell triggers.",
    )
    fgi_slope_recovery_threshold: float = Field(
        default=0.05,
        ge=0.0,
        description="FGI slope threshold above which fear-recovery buy triggers.",
    )
    disabled_rules: frozenset[str] = Field(
        default_factory=frozenset,
        description="DMA/FGI rule names to skip during policy evaluation.",
    )
    enabled_rules: frozenset[str] | None = Field(
        default=None,
        description=(
            "Optional rule allowlist. Portfolio-rule strategies use this to "
            "isolate rule sets for attribution."
        ),
    )

    @classmethod
    def from_public_params(
        cls, params: Mapping[str, Any] | None = None
    ) -> DmaGatedFgiParams:
        raw_params = {} if params is None else dict(params)
        invalid_keys = sorted(set(raw_params) - DMA_GATED_FGI_PUBLIC_PARAM_KEYS)
        if invalid_keys:
            joined = ", ".join(invalid_keys)
            raise ValueError("Unsupported dma_gated_fgi params: " + joined)

        normalized = coerce_params(raw_params, _DMA_COERCION_SPEC)
        return cls(**normalized)

    def to_public_params(self) -> dict[str, JsonValue]:
        params = self.model_dump(exclude_none=True)
        if self.disabled_rules:
            params["disabled_rules"] = sorted(self.disabled_rules)
        else:
            params.pop("disabled_rules", None)
        if self.enabled_rules is not None:
            params["enabled_rules"] = sorted(self.enabled_rules)
        else:
            params.pop("enabled_rules", None)
        return cast(dict[str, JsonValue], params)

    def build_signal_config(self) -> DmaGatedFgiConfig:
        return DmaGatedFgiConfig(
            cross_cooldown_days=self.cross_cooldown_days,
            cross_on_touch=self.cross_on_touch,
        )

    def build_pacing_policy(self) -> FgiExponentialPacingPolicy:
        return FgiExponentialPacingPolicy(k=self.pacing_k, r_max=self.pacing_r_max)

    def build_trade_quota_plugin_params(self) -> dict[str, JsonValue]:
        params: dict[str, JsonValue] = {}
        if self.min_trade_interval_days is not None:
            params["min_trade_interval_days"] = self.min_trade_interval_days
        if self.max_trades_7d is not None:
            params["max_trades_7d"] = self.max_trades_7d
        if self.max_trades_30d is not None:
            params["max_trades_30d"] = self.max_trades_30d
        return params

    def build_execution_plugins(self) -> tuple[ExecutionPlugin, ...]:
        return (
            DmaBuyGateExecutionPlugin(
                window_days=self.buy_sideways_window_days,
                sideways_max_range=self.buy_sideways_max_range,
                leg_caps=tuple(self.buy_leg_caps),
            ),
            TradeQuotaGuardExecutionPlugin(
                min_trade_interval_days=self.min_trade_interval_days,
                max_trades_7d=self.max_trades_7d,
                max_trades_30d=self.max_trades_30d,
            ),
        )


@dataclass
class DmaFgiPortfolioRulesStrategy(ComposedSignalStrategy):
    """Canonical flat SPY/BTC/ETH portfolio-rule strategy."""

    total_capital: float
    signal_id: str = PORTFOLIO_RULES_SIGNAL_ID
    summary_signal_id: str | None = PORTFOLIO_RULES_SIGNAL_ID
    params: DmaGatedFgiParams | dict[str, Any] = field(
        default_factory=DmaGatedFgiParams
    )
    signal_component: FlatMinimumSignalComponent = field(init=False, repr=False)
    decision_policy: DmaFgiPortfolioRulesDecisionPolicy = field(
        init=False,
        repr=False,
    )
    execution_engine: RuleBasedAllocationExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    disabled_rules: frozenset[str] = frozenset()
    enabled_rules: frozenset[str] | None = None
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        resolved_params = (
            self.params
            if isinstance(self.params, DmaGatedFgiParams)
            else DmaGatedFgiParams.from_public_params(self.params)
        )
        self.disabled_rules = frozenset(
            {*self.disabled_rules, *resolved_params.disabled_rules}
        )
        self.enabled_rules = (
            self.enabled_rules
            if self.enabled_rules is not None
            else resolved_params.enabled_rules
        )
        if self.enabled_rules is None:
            self.enabled_rules = DEFAULT_PORTFOLIO_RULE_NAMES
        assert_known_rule_names(self.disabled_rules, field_name="disabled_rules")
        assert_known_rule_names(self.enabled_rules, field_name="enabled_rules")

        self.params = resolved_params
        self.execution_engine = RuleBasedAllocationExecutor()
        rules = build_portfolio_rules_for_params(
            resolved_params,
            include_inactive=True,
        )
        self.decision_policy = DmaFgiPortfolioRulesDecisionPolicy(
            rules=rules,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
            risk_guards=build_risk_guards_for_params(resolved_params),
            config=PortfolioRuleConfig(emit_signals_consulted=True),
            execution_state_provider=lambda: RuleExecutionState(
                last_trade_date=self.execution_engine.last_trade_date,
                trade_dates=tuple(self.execution_engine.trade_dates),
            ),
        )
        metadata_rules = tuple(
            fresh_portfolio_rule(rule) for rule in DEFAULT_PORTFOLIO_RULES
        )
        cross_down_rule = required_rule(metadata_rules, CrossDownExitRule)
        ratio_rule = required_rule(metadata_rules, EthBtcRatioRotationRule)
        self.signal_component = FlatMinimumSignalComponent(
            config=resolved_params.build_signal_config(),
            signal_id=self.signal_id,
            ratio_cross_cooldown_days=ratio_rule.cooldown_days,
            cross_down_cooldown_days_by_symbol={
                symbol: cross_down_rule.cooldown_days_for(symbol)
                for symbol in PORTFOLIO_RULE_SYMBOLS
            },
        )
        self.public_params = {
            "signal_id": self.signal_id,
            **runtime_params_to_public_params(
                STRATEGY_DMA_FGI_PORTFOLIO_RULES,
                resolved_params.to_public_params(),
            ),
        }

    def initialize(
        self,
        portfolio: Any,
        config: Any,
        context: StrategyContext,
    ) -> None:
        self.decision_policy.reset()
        super().initialize(portfolio, config, context)

    def feature_summary(self) -> dict[str, Any]:
        active = active_rules(
            self.decision_policy.rules,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
        )
        rule_names = [rule.name for rule in active]
        has_ratio_rotation = any(
            isinstance(rule, EthBtcRatioRotationRule) for rule in active
        )
        return {
            "policy": "DmaFgiPortfolioRulesStrategy",
            "active_features": ["portfolio_level_rules", *rule_names],
            "ratio_rotation": has_ratio_rotation,
            "research_only": True,
        }

    def parameters(self) -> dict[str, Any]:
        return {
            **self.public_params,
            "disabled_rules": sorted(self.disabled_rules),
            "enabled_rules": sorted(self.enabled_rules)
            if self.enabled_rules is not None
            else None,
            "feature_summary": self.feature_summary(),
        }


def build_initial_portfolio_rules_asset_allocation(
    *,
    aggregate_allocation: Mapping[str, float],
    extra_data: Mapping[str, Any] | None,
    price_map: Mapping[str, float] | None,
    primary_price: float | None = None,
) -> dict[str, float]:
    return build_initial_flat_minimum_asset_allocation(
        aggregate_allocation=aggregate_allocation,
        extra_data=extra_data,
        price_map=price_map,
        primary_price=primary_price,
    )


def default_dma_fgi_portfolio_rules_params() -> dict[str, JsonValue]:
    return DmaGatedFgiParams().to_public_params()


__all__ = [
    "DMA_GATED_FGI_PUBLIC_PARAM_KEYS",
    "DmaFgiPortfolioRulesStrategy",
    "DmaGatedFgiParams",
    "build_initial_portfolio_rules_asset_allocation",
    "default_dma_fgi_portfolio_rules_params",
]

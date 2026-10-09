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
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.execution.rule_based.allocation_executor import (
    AllocationExecutionResult,
    RuleBasedAllocationExecutor,
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
    RuleBasedPortfolioDecisionPolicy,
    RuleExecutionState,
    active_rules,
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
)
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
)
from src.services.backtesting.utils import (
    coerce_float,
    coerce_nullable_int,
    coerce_params,
)

_RuleT = TypeVar("_RuleT", bound=PortfolioRule)

DMA_GATED_FGI_PUBLIC_PARAM_KEYS = frozenset(
    {
        "min_trade_interval_days",
        "max_trades_7d",
        "max_trades_30d",
        "overextension_threshold_multiplier_greed",
        "overextension_threshold_multiplier_extreme_greed",
        "disabled_rules",
        "enabled_rules",
    }
)

_DMA_COERCION_SPEC: dict[str, Any] = {
    "min_trade_interval_days": coerce_nullable_int,
    "max_trades_7d": coerce_nullable_int,
    "max_trades_30d": coerce_nullable_int,
    "overextension_threshold_multiplier_greed": coerce_float,
    "overextension_threshold_multiplier_extreme_greed": coerce_float,
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


_KNOWN_RULE_NAMES = PORTFOLIO_RULE_NAMES
_DMA_COERCION_SPEC["disabled_rules"] = _coerce_rule_name_set
_DMA_COERCION_SPEC["enabled_rules"] = _coerce_optional_rule_name_set


class DmaGatedFgiParams(BaseModel):
    """Single public parameter surface for the DMA/FGI portfolio rules strategy."""

    model_config = ConfigDict(extra="forbid")

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
    overextension_threshold_multiplier_greed: float = Field(
        default=0.50,
        ge=0.0,
        le=2.0,
        description="Multiplier applied to overextension sell thresholds in greed.",
    )
    overextension_threshold_multiplier_extreme_greed: float = Field(
        default=0.33,
        ge=0.0,
        le=2.0,
        description=(
            "Multiplier applied to overextension sell thresholds in extreme greed."
        ),
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


@dataclass
class RuleBasedPortfolioStrategy(BaseStrategy):
    """Canonical flat SPY/BTC/ETH portfolio-rule strategy.

    Each day the signal component observes the three DMA signals, the first
    matching rule decides a target allocation, and the executor applies it in
    full on the same bar.
    """

    total_capital: float
    signal_component: FlatMinimumSignalComponent = field(init=False, repr=False)
    decision_policy: RuleBasedPortfolioDecisionPolicy = field(
        init=False,
        repr=False,
    )
    execution_engine: RuleBasedAllocationExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    signal_id: str = PORTFOLIO_RULES_SIGNAL_ID
    summary_signal_id: str | None = PORTFOLIO_RULES_SIGNAL_ID
    strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    daily_data: list[dict[str, Any]] = field(default_factory=list)
    params: DmaGatedFgiParams | dict[str, Any] = field(
        default_factory=DmaGatedFgiParams
    )
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
        self.params = resolved_params
        self.execution_engine = RuleBasedAllocationExecutor()
        rules = build_portfolio_rules_for_params(
            resolved_params,
            include_inactive=True,
        )
        self.decision_policy = RuleBasedPortfolioDecisionPolicy(
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
            config=DmaGatedFgiConfig(),
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
        del portfolio, config
        self.daily_data = []
        self.decision_policy.reset()
        self.signal_component.reset()
        self.signal_component.initialize(context)
        self.execution_engine.reset()

    def warmup_day(self, context: StrategyContext) -> None:
        self.signal_component.warmup(context)

    def on_day(self, context: StrategyContext) -> StrategyAction:
        market_state = self.signal_component.observe(context)
        decision = self.decision_policy.decide(market_state)
        committed_state = self.signal_component.apply_intent(
            current_date=context.date,
            snapshot=market_state,
            intent=decision,
        )
        signal_observation = self.signal_component.build_signal_observation(
            snapshot=committed_state,
            intent=decision,
        )
        execution = self._execute(context=context, intent=decision)
        self.decision_policy.record_execution(
            context=context,
            intent=decision,
            execution=execution,
        )
        snapshot = StrategySnapshot(
            signal=signal_observation,
            decision=AllocationIntent(
                action=decision.action,
                target_allocation=(
                    None
                    if decision.target_allocation is None
                    else dict(decision.target_allocation)
                ),
                allocation_name=decision.allocation_name,
                immediate=decision.immediate,
                reason=decision.reason,
                rule_group=decision.rule_group,
                decision_score=decision.decision_score,
                diagnostics=(
                    None if decision.diagnostics is None else dict(decision.diagnostics)
                ),
            ),
            execution=execution,
        )
        return StrategyAction(
            snapshot=snapshot,
            transfers=list(execution.transfers) or None,
        )

    def record_day(
        self,
        context: StrategyContext,
        action: StrategyAction,
        yield_breakdown: dict[str, float],
        trade_executed: bool,
    ) -> None:
        del yield_breakdown, trade_executed
        snapshot = action.snapshot
        self.daily_data.append(
            {
                "date": context.date,
                "spot_balance": context.portfolio.spot_balance,
                "stable_balance": context.portfolio.stable_balance,
                "total_value": context.portfolio.total_value(context.portfolio_price),
                "signal_id": None
                if snapshot.signal is None
                else snapshot.signal.signal_id,
                "decision_reason": snapshot.decision.reason,
            }
        )

    def _execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
    ) -> ExecutionOutcome:
        if intent.action == "hold" and intent.target_allocation is None:
            return ExecutionOutcome(event=None, transfers=[])
        return self._to_execution_outcome(
            self.execution_engine.execute(context=context, intent=intent)
        )

    @staticmethod
    def _to_execution_outcome(
        execution: AllocationExecutionResult,
    ) -> ExecutionOutcome:
        return ExecutionOutcome(
            event=execution.event,
            transfers=[] if execution.transfers is None else list(execution.transfers),
            blocked_reason=execution.block_reason,
        )

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
            "policy": "RuleBasedPortfolioStrategy",
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


def default_rule_based_portfolio_params() -> dict[str, JsonValue]:
    return DmaGatedFgiParams().to_public_params()


__all__ = [
    "DMA_GATED_FGI_PUBLIC_PARAM_KEYS",
    "RuleBasedPortfolioStrategy",
    "DmaGatedFgiParams",
    "default_rule_based_portfolio_params",
]

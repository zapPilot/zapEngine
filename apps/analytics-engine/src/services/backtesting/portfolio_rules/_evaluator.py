"""RulesEvaluator and DmaFgiPortfolioRulesDecisionPolicy.

Top-level orchestration: builds the per-day snapshot, runs the first-match
resolver, applies risk guards, then post-intent adjustments. The policy
class wraps the evaluator with stateful execution-context tracking.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules import DEFAULT_PORTFOLIO_RULES
from src.services.backtesting.portfolio_rules._builders import (
    active_rules,
    assert_known_rule_names,
)
from src.services.backtesting.portfolio_rules._matcher import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules._post_processing import (
    _apply_post_intent_adjustments,
    _apply_risk_guards,
    _matched_rule_name,
    _rule_for_name,
)
from src.services.backtesting.portfolio_rules._snapshot_builder import (
    _advance_context,
    build_portfolio_snapshot,
)
from src.services.backtesting.portfolio_rules._types import (
    RuleExecutionContext,
    RuleExecutionState,
)
from src.services.backtesting.portfolio_rules.base import (
    DecisionPolicy,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.risk import RiskGuard, RiskGuardResult
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import StrategyContext

PORTFOLIO_RULES_SIGNAL_ID = "dma_fgi_portfolio_rules_signal"


@dataclass(frozen=True)
class RulesEvaluator:
    """Evaluate portfolio rules against an explicit execution context."""

    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES
    risk_guards: tuple[RiskGuard, ...] = ()
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    disabled_rules: frozenset[str] = field(default_factory=frozenset)
    enabled_rules: frozenset[str] | None = None

    def evaluate(
        self,
        snapshot: FlatMinimumState,
        ctx: RuleExecutionContext,
    ) -> AllocationIntent:
        portfolio_snapshot = build_portfolio_snapshot(
            snapshot,
            previous_fgi_regime=ctx.previous_fgi_regime,
            cycle_open_per_symbol=ctx.cycle_open_per_symbol,
            last_trade_date=ctx.execution_state.last_trade_date,
            trade_dates=ctx.execution_state.trade_dates,
        )
        self._observe_components(portfolio_snapshot)
        intent = resolve_portfolio_rules_intent(
            portfolio_snapshot,
            rules=self.rules,
            config=self.config,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
            cooldown_tracker=ctx.cooldown_tracker,
        )
        risk_result = self._apply_risk_guards(intent, portfolio_snapshot)
        intent = self._apply_post_intent_adjustments(
            risk_result.intent,
            portfolio_snapshot,
        )
        self._record_intent(intent)
        return intent

    def _active_rules(self) -> tuple[PortfolioRule, ...]:
        return active_rules(
            self.rules,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
        )

    def _observe_components(self, snapshot: PortfolioSnapshot) -> None:
        for component in (*self._active_rules(), *self.risk_guards):
            observe = getattr(component, "observe", None)
            if callable(observe):
                observe(snapshot, config=self.config)

    def _record_intent(self, intent: AllocationIntent) -> None:
        for component in (*self._active_rules(), *self.risk_guards):
            record_intent = getattr(component, "record_intent", None)
            if callable(record_intent):
                record_intent(intent)

    def _apply_risk_guards(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> RiskGuardResult:
        return _apply_risk_guards(
            intent,
            snapshot,
            risk_guards=self.risk_guards,
            config=self.config,
        )

    def _apply_post_intent_adjustments(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> AllocationIntent:
        return _apply_post_intent_adjustments(
            intent,
            snapshot,
            rules=self._active_rules(),
            config=self.config,
        )


@dataclass
class DmaFgiPortfolioRulesDecisionPolicy(DecisionPolicy):
    """Decision policy that evaluates whole-portfolio rules."""

    decision_policy_id: str = "dma_fgi_portfolio_rules_policy"
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES
    risk_guards: tuple[RiskGuard, ...] = ()
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    disabled_rules: frozenset[str] = frozenset()
    enabled_rules: frozenset[str] | None = None
    execution_state_provider: Callable[[], RuleExecutionState] | None = None
    _ctx: RuleExecutionContext = field(
        default_factory=RuleExecutionContext,
        init=False,
        repr=False,
    )
    _evaluator: RulesEvaluator = field(init=False, repr=False)

    def __post_init__(self) -> None:
        assert_known_rule_names(self.disabled_rules, field_name="disabled_rules")
        assert_known_rule_names(self.enabled_rules, field_name="enabled_rules")
        self._evaluator = self._build_evaluator()

    def reset(self) -> None:
        self._ctx = RuleExecutionContext()
        for component in (*self.rules, *self.risk_guards):
            reset = getattr(component, "reset", None)
            if callable(reset):
                reset()

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        ctx = replace(
            self._ctx,
            execution_state=self._resolve_execution_state(),
        )
        self._evaluator = self._build_evaluator()
        intent = self._evaluator.evaluate(snapshot, ctx)
        self._ctx = _advance_context(
            ctx,
            intent,
            snapshot=snapshot,
            track_local_execution_state=self.execution_state_provider is None,
        )
        return intent

    def _resolve_execution_state(self) -> RuleExecutionState:
        if self.execution_state_provider is not None:
            return self.execution_state_provider()
        return self._ctx.execution_state

    def _build_evaluator(self) -> RulesEvaluator:
        return RulesEvaluator(
            rules=self.rules,
            risk_guards=self.risk_guards,
            config=self.config,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
        )

    def record_execution(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        execution: Any,
    ) -> None:
        if not getattr(execution, "transfers", ()):
            return
        matched_rule_name = _matched_rule_name(intent)
        if matched_rule_name is None:
            return
        matched_rule = _rule_for_name(self.rules, matched_rule_name)
        if matched_rule is None:
            return
        self._ctx.cooldown_tracker.record_execution(
            matched_rule,
            intent=intent,
            executed_at=context.date,
        )

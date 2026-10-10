"""RulesEvaluator and RuleBasedPortfolioDecisionPolicy.

Top-level orchestration: builds the per-day snapshot, runs the first-match
resolver, then the post-intent adjustments. The policy class wraps the
evaluator with stateful execution-context tracking.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome
from src.services.backtesting.portfolio_rules._matcher import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules._post_processing import (
    _apply_post_intent_adjustments,
    _matched_rule_name,
    _rule_for_name,
)
from src.services.backtesting.portfolio_rules._snapshot_builder import (
    _advance_context,
    build_portfolio_snapshot,
)
from src.services.backtesting.portfolio_rules._types import RuleExecutionContext
from src.services.backtesting.portfolio_rules.base import (
    DecisionPolicy,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import StrategyContext

PORTFOLIO_RULES_SIGNAL_ID = "dma_fgi_portfolio_rules_signal"


@dataclass(frozen=True)
class RulesEvaluator:
    """Evaluate portfolio rules against an explicit execution context."""

    rules: tuple[PortfolioRule, ...]
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)

    def evaluate(
        self,
        snapshot: FlatMinimumState,
        ctx: RuleExecutionContext,
    ) -> AllocationIntent:
        portfolio_snapshot = build_portfolio_snapshot(
            snapshot,
            previous_fgi_regime=ctx.previous_fgi_regime,
            cycle_open_per_symbol=ctx.cycle_open_per_symbol,
        )
        self._observe_components(portfolio_snapshot)
        intent = resolve_portfolio_rules_intent(
            portfolio_snapshot,
            rules=self.rules,
            config=self.config,
            cooldown_tracker=ctx.cooldown_tracker,
        )
        return self._apply_post_intent_adjustments(intent, portfolio_snapshot)

    def _observe_components(self, snapshot: PortfolioSnapshot) -> None:
        for rule in self.rules:
            observe = getattr(rule, "observe", None)
            if callable(observe):
                observe(snapshot, config=self.config)

    def _apply_post_intent_adjustments(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> AllocationIntent:
        return _apply_post_intent_adjustments(
            intent,
            snapshot,
            rules=self.rules,
            config=self.config,
        )


@dataclass
class RuleBasedPortfolioDecisionPolicy(DecisionPolicy):
    """Decision policy that evaluates whole-portfolio rules."""

    rules: tuple[PortfolioRule, ...]
    decision_policy_id: str = "dma_fgi_portfolio_rules_policy"
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    _ctx: RuleExecutionContext = field(
        default_factory=RuleExecutionContext,
        init=False,
        repr=False,
    )
    _evaluator: RulesEvaluator = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._evaluator = self._build_evaluator()

    def reset(self) -> None:
        self._ctx = RuleExecutionContext()
        for rule in self.rules:
            reset = getattr(rule, "reset", None)
            if callable(reset):
                reset()

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        ctx = self._ctx
        self._evaluator = self._build_evaluator()
        intent = self._evaluator.evaluate(snapshot, ctx)
        self._ctx = _advance_context(ctx, snapshot=snapshot)
        return intent

    def _build_evaluator(self) -> RulesEvaluator:
        return RulesEvaluator(rules=self.rules, config=self.config)

    def record_execution(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        execution: ExecutionOutcome,
    ) -> None:
        if not execution.transfers:
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

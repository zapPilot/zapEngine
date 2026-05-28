"""Public re-export hub for the portfolio-rule decision policy.

The implementation is split across focused sibling modules so that adding a
new rule group / risk guard / shadowing tweak only touches one of them:

- ``_evaluator`` — :class:`RulesEvaluator` and
  :class:`DmaFgiPortfolioRulesDecisionPolicy` (the public entry points)
- ``_matcher`` — :func:`resolve_portfolio_rules_intent` (first-match-wins)
  and shadowing of lower-priority matches
- ``_builders`` — rule / risk-guard factories and active-rule filtering
- ``_snapshot_builder`` — :func:`build_portfolio_snapshot` and
  per-day context advancement
- ``_post_processing`` — risk-guard application + intent adjustments
- ``_state_accessors`` — FGI / regime accessors + crypto-cycle tracking
- ``_types`` — shared :class:`RuleExecutionContext` / ``RuleExecutionState``

This module re-exports the stable public surface so existing imports
(``from src.services.backtesting.portfolio_rules.decision_policy import …``)
continue to work unchanged.
"""

from __future__ import annotations

from src.services.backtesting.portfolio_rules._builders import (
    _rule_with_public_params,
    active_rules,
    assert_known_rule_names,
    build_portfolio_rules_for_params,
    build_risk_guards_for_params,
    fresh_portfolio_rule,
    required_rule,
)
from src.services.backtesting.portfolio_rules._evaluator import (
    PORTFOLIO_RULES_SIGNAL_ID,
    DmaFgiPortfolioRulesDecisionPolicy,
    RulesEvaluator,
)
from src.services.backtesting.portfolio_rules._matcher import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules._post_processing import (
    _matched_rule_priority,
)
from src.services.backtesting.portfolio_rules._snapshot_builder import (
    build_portfolio_snapshot,
)
from src.services.backtesting.portfolio_rules._types import (
    RuleExecutionContext,
    RuleExecutionState,
)

__all__ = [
    "PORTFOLIO_RULES_SIGNAL_ID",
    "DmaFgiPortfolioRulesDecisionPolicy",
    "RuleExecutionContext",
    "RuleExecutionState",
    "RulesEvaluator",
    "active_rules",
    "assert_known_rule_names",
    "build_portfolio_rules_for_params",
    "build_portfolio_snapshot",
    "build_risk_guards_for_params",
    "fresh_portfolio_rule",
    "required_rule",
    "resolve_portfolio_rules_intent",
]

# Re-exports kept available for legacy test imports — these are private
# helpers consumed only by ``tests/services/backtesting/portfolio_rules/
# test_decision_policy.py`` and should not be relied on by production code.
_PRIVATE_TEST_REEXPORTS = (_matched_rule_priority, _rule_with_public_params)

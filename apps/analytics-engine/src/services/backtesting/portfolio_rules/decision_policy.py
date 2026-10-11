"""Public re-export hub for the portfolio-rule decision policy.

The implementation is split across focused sibling modules so that adding a
new rule group or a shadowing tweak only touches one of them:

- ``_evaluator`` — :class:`RulesEvaluator` and
  :class:`RuleBasedPortfolioDecisionPolicy` (the public entry points)
- ``_matcher`` — :func:`resolve_portfolio_rules_intent` (first-match-wins)
  and shadowing of lower-priority matches
- ``_builders`` — the intent builder every rule shares and its score table
- ``_snapshot_builder`` — :func:`build_portfolio_snapshot` and
  per-day context advancement
- ``_post_processing`` — post-intent adjustments and the matched rule
- ``_state_accessors`` — FGI / regime accessors + crypto-cycle tracking
- ``_types`` — the shared :class:`RuleExecutionContext`

This module re-exports the stable public surface so existing imports
(``from src.services.backtesting.portfolio_rules.decision_policy import …``)
continue to work unchanged.
"""

from __future__ import annotations

from src.services.backtesting.portfolio_rules._evaluator import (
    PORTFOLIO_RULES_SIGNAL_ID,
    RuleBasedPortfolioDecisionPolicy,
    RulesEvaluator,
)
from src.services.backtesting.portfolio_rules._matcher import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules._snapshot_builder import (
    build_portfolio_snapshot,
)
from src.services.backtesting.portfolio_rules._types import RuleExecutionContext

__all__ = [
    "PORTFOLIO_RULES_SIGNAL_ID",
    "RuleBasedPortfolioDecisionPolicy",
    "RuleExecutionContext",
    "RulesEvaluator",
    "build_portfolio_snapshot",
    "resolve_portfolio_rules_intent",
]

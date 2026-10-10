"""Post-decision processing: intent adjustments and the rule that decided."""

from __future__ import annotations

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    DIAG_MATCHED_RULE_NAME,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)


def _apply_post_intent_adjustments(
    intent: AllocationIntent,
    snapshot: PortfolioSnapshot,
    *,
    rules: tuple[PortfolioRule, ...],
    config: PortfolioRuleConfig,
) -> AllocationIntent:
    adjusted = intent
    for rule in rules:
        hook = getattr(rule, "apply_post_intent_adjustments", None)
        if callable(hook):
            adjusted = hook(intent=adjusted, snapshot=snapshot, config=config)
    return adjusted


def _matched_rule_name(intent: AllocationIntent) -> str | None:
    diagnostics = intent.diagnostics or {}
    matched_rule = diagnostics.get(DIAG_MATCHED_RULE_NAME)
    return matched_rule if isinstance(matched_rule, str) else None


def _rule_for_name(
    rules: tuple[PortfolioRule, ...],
    name: str,
) -> PortfolioRule | None:
    for rule in rules:
        if rule.name == name:
            return rule
    return None

"""Post-decision processing: risk guards, intent adjustments, diagnostics."""

from __future__ import annotations

from dataclasses import replace

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules import RULE_PRIORITIES
from src.services.backtesting.portfolio_rules.base import (
    DIAG_COOLDOWN_SKIPPED_RULES,
    DIAG_MATCHED_RULE_NAME,
    DIAG_PORTFOLIO_RULE_MATCHES,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.risk import RiskGuard, RiskGuardResult


def _apply_risk_guards(
    intent: AllocationIntent,
    snapshot: PortfolioSnapshot,
    *,
    risk_guards: tuple[RiskGuard, ...],
    config: PortfolioRuleConfig,
) -> RiskGuardResult:
    matched_rule_priority = _matched_rule_priority(intent)
    for guard in risk_guards:
        if (
            matched_rule_priority is not None
            and guard.priority >= matched_rule_priority
        ):
            continue
        replacement = guard.allow(intent, snapshot, config=config)
        if replacement is not None:
            return RiskGuardResult(
                intent=_preserve_rule_trace_diagnostics(replacement, original=intent),
                blocked_by=guard.name,
            )
    return RiskGuardResult(intent=intent)


def _preserve_rule_trace_diagnostics(
    replacement: AllocationIntent,
    *,
    original: AllocationIntent,
) -> AllocationIntent:
    original_diagnostics = original.diagnostics or {}
    replacement_diagnostics = dict(replacement.diagnostics or {})
    for key in (DIAG_PORTFOLIO_RULE_MATCHES, DIAG_COOLDOWN_SKIPPED_RULES):
        if key in original_diagnostics and key not in replacement_diagnostics:
            replacement_diagnostics[key] = original_diagnostics[key]
    return replace(replacement, diagnostics=replacement_diagnostics)


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


def _matched_rule_priority(intent: AllocationIntent) -> int | None:
    matched_rule = _matched_rule_name(intent)
    if matched_rule is None:
        return None
    return RULE_PRIORITIES.get(matched_rule)


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

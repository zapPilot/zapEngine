"""First-match-wins rule resolver + shadowing of lower-priority matches."""

from __future__ import annotations

from dataclasses import dataclass, replace

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULES,
    RULE_PRIORITIES,
)
from src.services.backtesting.portfolio_rules._builders import _rule_is_active
from src.services.backtesting.portfolio_rules.base import (
    DIAG_COOLDOWN_SKIPPED_RULES,
    DIAG_MATCHED_RULE_NAME,
    DIAG_PORTFOLIO_RULE_MATCHES,
    DIAG_SIGNALS_CONSULTED,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)


@dataclass(frozen=True)
class RuleMatchOutcome:
    rule_name: str
    matched: bool
    would_have_acted_action: str | None = None
    suppressed_by: str | None = None


def resolve_portfolio_rules_intent(
    snapshot: PortfolioSnapshot,
    *,
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES,
    config: PortfolioRuleConfig | None = None,
    disabled_rules: frozenset[str] = frozenset(),
    enabled_rules: frozenset[str] | None = None,
    cooldown_tracker: RuleCooldownTracker | None = None,
) -> AllocationIntent:
    resolved_config = config or PortfolioRuleConfig()
    resolved_cooldown_tracker = cooldown_tracker or RuleCooldownTracker()
    cooldown_skipped_rules: list[dict[str, object]] = []
    raw_outcomes: list[RuleMatchOutcome] = []
    winning_rule_name: str | None = None
    winning_intent: AllocationIntent | None = None

    for rule in rules:
        matched = rule.matches(snapshot, config=resolved_config)
        candidate_intent: AllocationIntent | None = None
        would_have_acted_action: str | None = None
        if matched:
            candidate_intent = rule.build_intent(snapshot, config=resolved_config)
            would_have_acted_action = candidate_intent.action
        raw_outcomes.append(
            RuleMatchOutcome(
                rule_name=rule.name,
                matched=matched,
                would_have_acted_action=would_have_acted_action,
            )
        )
        if not matched or winning_intent is not None:
            continue
        if not _rule_is_active(
            rule,
            disabled_rules=disabled_rules,
            enabled_rules=enabled_rules,
        ):
            continue
        cooldown = resolved_cooldown_tracker.is_cooled_off(
            rule,
            snapshot=snapshot,
            config=resolved_config,
        )
        if cooldown is not None:
            cooldown_skipped_rules.append(cooldown)
            continue
        winning_rule_name = rule.name
        winning_intent = candidate_intent

    rule_trace = _rule_match_outcome_dicts(
        _apply_shadowing(raw_outcomes, winner_name=winning_rule_name)
    )
    if winning_intent is not None and winning_rule_name is not None:
        diagnostics = dict(winning_intent.diagnostics or {})
        diagnostics.setdefault(DIAG_MATCHED_RULE_NAME, winning_rule_name)
        diagnostics[DIAG_PORTFOLIO_RULE_MATCHES] = rule_trace
        if cooldown_skipped_rules:
            diagnostics[DIAG_COOLDOWN_SKIPPED_RULES] = cooldown_skipped_rules
        return replace(winning_intent, diagnostics=diagnostics)

    return AllocationIntent(
        action="hold",
        target_allocation=current_target(snapshot),
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
        diagnostics={
            DIAG_MATCHED_RULE_NAME: "regime_no_signal_hold",
            DIAG_PORTFOLIO_RULE_MATCHES: rule_trace,
            **(
                {DIAG_COOLDOWN_SKIPPED_RULES: cooldown_skipped_rules}
                if cooldown_skipped_rules
                else {}
            ),
            **(
                {
                    DIAG_SIGNALS_CONSULTED: signals_consulted_for_symbols(
                        snapshot,
                        tuple(symbols_for_snapshot(snapshot)),
                    )
                }
                if resolved_config.emit_signals_consulted
                else {}
            ),
        },
    )


def _apply_shadowing(
    outcomes: list[RuleMatchOutcome],
    *,
    winner_name: str | None,
) -> list[RuleMatchOutcome]:
    if winner_name is None:
        return outcomes
    winner_priority = RULE_PRIORITIES.get(winner_name)
    if winner_priority is None:
        return outcomes
    shadowed: list[RuleMatchOutcome] = []
    for outcome in outcomes:
        suppressed_by = outcome.suppressed_by
        if (
            outcome.matched
            and outcome.rule_name != winner_name
            and RULE_PRIORITIES.get(outcome.rule_name, winner_priority)
            > winner_priority
        ):
            suppressed_by = winner_name
        shadowed.append(replace(outcome, suppressed_by=suppressed_by))
    return shadowed


def _rule_match_outcome_dicts(
    outcomes: list[RuleMatchOutcome],
) -> list[dict[str, object]]:
    return [
        {
            "rule_name": outcome.rule_name,
            "matched": outcome.matched,
            "would_have_acted_action": outcome.would_have_acted_action,
            "suppressed_by": outcome.suppressed_by,
        }
        for outcome in outcomes
    ]

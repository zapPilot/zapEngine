"""Unit tests for the ``resolve_portfolio_rules_intent`` engine.

These exercise engine-level invariants (rule selection, allowlist/blocklist,
fallback) independently of any specific portfolio rule. Rule-specific
behavior is covered by per-rule test files in this directory.
"""

from __future__ import annotations

from datetime import date
from typing import cast

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    RuleExecutionContext,
    RulesEvaluator,
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


class _FakeRule:
    """Minimal PortfolioRule used to isolate engine behavior from rule logic.

    Real rules carry domain-specific match conditions; for engine-level tests
    we only need a rule that deterministically does or does not match.
    """

    def __init__(
        self,
        *,
        name: str,
        priority: int = 10,
        matches_value: bool = True,
        action: DecisionAction = "buy",
        cooldown_days: int = 0,
    ) -> None:
        self._name: str = name
        self._priority: int = priority
        self._matches: bool = matches_value
        self._action: DecisionAction = action
        self._cooldown_days: int = cooldown_days

    @property
    def name(self) -> str:
        return self._name

    @property
    def priority(self) -> int:
        return self._priority

    @property
    def cooldown_days(self) -> int:
        return self._cooldown_days

    @property
    def rule_group(self) -> RuleGroup:
        return "none"

    @property
    def description(self) -> str:
        return f"fake rule {self._name}"

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        return self._matches

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        return AllocationIntent(
            action=self._action,
            target_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 1.0,
                "alt": 0.0,
            },
            allocation_name=f"fake_{self._name}",
            immediate=False,
            reason=f"fake_{self._name}_reason",
            rule_group="none",
            decision_score=0.0,
            diagnostics={},
        )


def _as_rules(*fakes: _FakeRule) -> tuple[PortfolioRule, ...]:
    return tuple(cast(PortfolioRule, fake) for fake in fakes)


def test_first_matching_rule_in_tuple_order_wins() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="alpha", action="buy"),
            _FakeRule(name="beta", action="sell"),
        ),
    )

    assert intent.action == "buy"
    assert intent.reason == "fake_alpha_reason"
    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "alpha"


def test_no_matching_rule_returns_regime_no_signal_hold() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(_FakeRule(name="never", matches_value=False)),
    )

    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"
    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "regime_no_signal_hold"


def test_disabled_rule_is_skipped_and_next_eligible_match_wins() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="alpha"),
            _FakeRule(name="beta"),
        ),
        disabled_rules=frozenset({"alpha"}),
    )

    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "beta"


def test_enabled_rules_acts_as_allowlist() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="alpha"),
            _FakeRule(name="beta"),
        ),
        enabled_rules=frozenset({"beta"}),
    )

    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "beta"


def test_resolver_uses_injected_cooldown_tracker() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(current_date=date(2025, 5, 8)),
        rules=_as_rules(_FakeRule(name="alpha", cooldown_days=7)),
        cooldown_tracker=RuleCooldownTracker({"alpha": date(2025, 5, 7)}),
    )

    assert intent.reason == "regime_no_signal"
    assert intent.diagnostics is not None
    assert intent.diagnostics["cooldown_skipped_rules"] == [
        {
            "rule": "alpha",
            "last_executed_at": "2025-05-07",
            "cooldown_days": 7,
            "remaining_days": 6,
        }
    ]


def test_rules_evaluator_isolated_from_policy_state_mutation() -> None:
    ctx = RuleExecutionContext(previous_fgi_regime={"BTC": "greed"})
    evaluator = RulesEvaluator(rules=_as_rules(_FakeRule(name="alpha")))

    intent = evaluator.evaluate(
        FlatMinimumState(
            spy_dma_state=None,
            btc_dma_state=state(symbol="BTC", fgi_regime="neutral"),
            eth_dma_state=None,
            current_asset_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 1.0,
                "alt": 0.0,
            },
        ),
        ctx,
    )

    assert intent.reason == "fake_alpha_reason"
    assert ctx.previous_fgi_regime == {"BTC": "greed"}


def test_rule_trace_records_all_outcomes_including_non_matches() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="winner"),
            _FakeRule(name="non_match", matches_value=False),
        ),
    )

    assert intent.diagnostics is not None
    trace = intent.diagnostics["portfolio_rule_matches"]
    names = [entry["rule_name"] for entry in trace]
    assert names == ["winner", "non_match"]

    winner_entry = trace[0]
    assert winner_entry["matched"] is True
    assert winner_entry["would_have_acted_action"] == "buy"

    non_match_entry = trace[1]
    assert non_match_entry["matched"] is False
    assert non_match_entry["would_have_acted_action"] is None

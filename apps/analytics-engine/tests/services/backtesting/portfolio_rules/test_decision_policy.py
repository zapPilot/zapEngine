"""Unit tests for the ``resolve_portfolio_rules_intent`` engine.

These exercise engine-level invariants (rule selection, allowlist/blocklist,
fallback) independently of any specific portfolio rule. Rule-specific
behavior is covered by per-rule test files in this directory.
"""

from __future__ import annotations

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
from src.services.backtesting.portfolio_rules.decision_policy import (
    resolve_portfolio_rules_intent,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot


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
    ) -> None:
        self._name: str = name
        self._priority: int = priority
        self._matches: bool = matches_value
        self._action: DecisionAction = action

    @property
    def name(self) -> str:
        return self._name

    @property
    def priority(self) -> int:
        return self._priority

    @property
    def cooldown_days(self) -> int:
        return 0

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

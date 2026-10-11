"""Unit tests for the ``resolve_portfolio_rules_intent`` engine.

These exercise engine-level invariants (rule selection, allowlist/blocklist,
fallback) independently of any specific portfolio rule. Rule-specific
behavior is covered by per-rule test files in this directory.
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import cast

import pytest

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.portfolio_rules.base import (
    DIAG_SIGNALS_CONSULTED,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    RuleBasedPortfolioDecisionPolicy,
    RuleExecutionContext,
    RulesEvaluator,
    build_portfolio_snapshot,
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


class _ObservingRule(_FakeRule):
    def __init__(self, *, name: str) -> None:
        super().__init__(name=name)
        self.observed = False

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        del snapshot, config
        self.observed = True


class _ResettableRule(_ObservingRule):
    def __init__(self, *, name: str) -> None:
        super().__init__(name=name)
        self.reset_called = False

    def reset(self) -> None:
        self.reset_called = True


class _PostAdjustmentRule(_FakeRule):
    def apply_post_intent_adjustments(
        self,
        *,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del snapshot, config
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["post_adjusted"] = True
        return AllocationIntent(
            action=intent.action,
            target_allocation=intent.target_allocation,
            allocation_name=intent.allocation_name,
            immediate=intent.immediate,
            reason="post_adjusted_reason",
            rule_group=intent.rule_group,
            decision_score=intent.decision_score,
            diagnostics=diagnostics,
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


def test_resolver_preserves_cooldown_skips_when_later_rule_wins() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(current_date=date(2025, 5, 8)),
        rules=_as_rules(
            _FakeRule(name="alpha", cooldown_days=7),
            _FakeRule(name="beta", action="sell"),
        ),
        cooldown_tracker=RuleCooldownTracker({"alpha": date(2025, 5, 7)}),
    )

    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "beta"
    assert intent.diagnostics["cooldown_skipped_rules"][0]["rule"] == "alpha"


def test_rules_evaluator_isolated_from_policy_state_mutation() -> None:
    ctx = RuleExecutionContext(previous_fgi_regime={"BTC": "greed"})
    evaluator = RulesEvaluator(rules=_as_rules(_FakeRule(name="alpha")))

    intent = evaluator.evaluate(
        snapshot(
            assets={"BTC": state(symbol="BTC", fgi_regime="neutral")},
            previous=dict(ctx.previous_fgi_regime),
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


def test_rule_trace_marks_lower_priority_matches_as_shadowed_by_winner() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="cross_down_exit", priority=10),
            _FakeRule(name="cross_up_equal_weight", priority=20),
        ),
    )

    assert intent.diagnostics is not None
    trace = intent.diagnostics["portfolio_rule_matches"]
    assert trace[1]["suppressed_by"] == "cross_down_exit"


def test_shadowing_follows_the_priorities_of_the_rules_evaluated() -> None:
    """A rule named like a default rule gets no priority from the registry."""
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="cross_up_equal_weight", priority=5),
            _FakeRule(name="cross_down_exit", priority=9),
        ),
    )

    assert intent.diagnostics is not None
    trace = intent.diagnostics["portfolio_rule_matches"]
    assert [row["suppressed_by"] for row in trace] == [None, "cross_up_equal_weight"]


def test_hold_intent_emits_signals_consulted_when_enabled() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(_FakeRule(name="never", matches_value=False)),
        config=PortfolioRuleConfig(emit_signals_consulted=True),
    )

    assert intent.action == "hold"
    assert intent.diagnostics is not None
    assert intent.diagnostics[DIAG_SIGNALS_CONSULTED]["btc.zone"] == "above"


def test_rules_evaluator_lets_each_rule_observe_the_day() -> None:
    rule = _ObservingRule(name="alpha")
    evaluator = RulesEvaluator(rules=(cast(PortfolioRule, rule),))

    evaluator.evaluate(
        snapshot(assets={"BTC": state(symbol="BTC")}),
        RuleExecutionContext(),
    )

    assert rule.observed is True


def test_rules_evaluator_applies_post_intent_adjustment_hooks() -> None:
    intent = RulesEvaluator(
        rules=(cast(PortfolioRule, _PostAdjustmentRule(name="alpha")),),
    ).evaluate(
        snapshot(assets={"BTC": state(symbol="BTC")}),
        RuleExecutionContext(),
    )

    assert intent.reason == "post_adjusted_reason"
    assert intent.diagnostics is not None
    assert intent.diagnostics["post_adjusted"] is True


def test_policy_record_execution_ignores_non_executed_or_unmatched_intents() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(rules=_as_rules(_FakeRule(name="alpha")))
    context = SimpleNamespace(date=date(2025, 5, 1))
    intent = AllocationIntent(
        action="buy",
        target_allocation={"btc": 1.0, "stable": 0.0},
        allocation_name="test",
        immediate=False,
        reason="test",
        rule_group="dma_fgi",
        decision_score=0.0,
        diagnostics={"matched_rule_name": "missing"},
    )

    policy.record_execution(
        context=context, intent=intent, execution=SimpleNamespace(transfers=())
    )
    policy.record_execution(
        context=context,
        intent=AllocationIntent(
            action="buy",
            target_allocation={"btc": 1.0, "stable": 0.0},
            allocation_name="test",
            immediate=False,
            reason="test",
            rule_group="dma_fgi",
            decision_score=0.0,
            diagnostics=None,
        ),
        execution=SimpleNamespace(transfers=[object()]),
    )
    policy.record_execution(
        context=context,
        intent=intent,
        execution=SimpleNamespace(transfers=[object()]),
    )

    assert policy._ctx.cooldown_tracker.last_executed == {}


def test_policy_record_execution_records_known_matched_rule() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(
        rules=_as_rules(_FakeRule(name="alpha", cooldown_days=7))
    )

    policy.record_execution(
        context=SimpleNamespace(date=date(2025, 5, 1)),
        intent=AllocationIntent(
            action="buy",
            target_allocation={"btc": 1.0, "stable": 0.0},
            allocation_name="test",
            immediate=False,
            reason="test",
            rule_group="dma_fgi",
            decision_score=0.0,
            diagnostics={"matched_rule_name": "alpha"},
        ),
        execution=SimpleNamespace(transfers=[object()]),
    )

    assert policy._ctx.cooldown_tracker.last_executed == {"alpha": date(2025, 5, 1)}


def test_policy_reset_clears_context_and_resets_components() -> None:
    rule = _ResettableRule(name="alpha")
    policy = RuleBasedPortfolioDecisionPolicy(rules=(cast(PortfolioRule, rule),))
    policy.decide(
        FlatMinimumState(
            spy_dma_state=None,
            btc_dma_state=state(symbol="BTC"),
            eth_dma_state=None,
            current_asset_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 1.0,
                "alt": 0.0,
            },
            current_date=date(2025, 5, 1),
        )
    )

    policy.reset()

    assert policy._ctx.previous_fgi_regime == {}
    assert policy._ctx.cycle_open_per_symbol == {}
    assert policy._ctx.cooldown_tracker.last_executed == {}
    assert rule.reset_called is True


def test_policy_updates_cycle_state_from_spy_and_crypto_crosses() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(rules=())

    policy.decide(
        FlatMinimumState(
            spy_dma_state=state(
                symbol="SPY",
                zone="below",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
            btc_dma_state=state(
                symbol="BTC",
                zone="below",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
            eth_dma_state=state(symbol="ETH", zone="below"),
            current_asset_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 1.0,
                "stable": 0.0,
                "alt": 0.0,
            },
        )
    )

    assert policy._ctx.cycle_open_per_symbol == {
        "SPY": True,
        "BTC": True,
        "ETH": True,
    }

    policy.decide(
        FlatMinimumState(
            spy_dma_state=state(
                symbol="SPY",
                zone="above",
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            btc_dma_state=state(
                symbol="BTC",
                zone="above",
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            eth_dma_state=state(symbol="ETH", zone="above"),
            current_asset_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 1.0,
                "stable": 0.0,
                "alt": 0.0,
            },
        )
    )

    assert policy._ctx.cycle_open_per_symbol == {
        "SPY": False,
        "BTC": False,
        "ETH": False,
    }


def test_build_portfolio_snapshot_reports_missing_crypto_summary_as_none() -> None:
    portfolio_snapshot = build_portfolio_snapshot(
        FlatMinimumState(
            spy_dma_state=state(
                symbol="SPY",
                macro_fear_greed_regime="greed",
                macro_fear_greed_value=75.0,
            ),
            btc_dma_state=None,
            eth_dma_state=None,
            current_asset_allocation={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 1.0,
                "stable": 0.0,
                "alt": 0.0,
            },
        ),
        previous_fgi_regime={},
    )

    assert portfolio_snapshot.macro_fgi_regime == "greed"
    assert portfolio_snapshot.macro_fgi_value == pytest.approx(75.0)
    assert portfolio_snapshot.crypto_fgi_regime is None
    assert portfolio_snapshot.crypto_fgi_value is None

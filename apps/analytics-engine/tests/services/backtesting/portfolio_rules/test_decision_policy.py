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
    DmaFgiPortfolioRulesDecisionPolicy,
    RuleExecutionContext,
    RuleExecutionState,
    RulesEvaluator,
    _matched_rule_priority,
    _rule_with_public_params,
    assert_known_rule_names,
    build_portfolio_rules_for_params,
    build_portfolio_snapshot,
    build_risk_guards_for_params,
    required_rule,
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaGatedFgiParams,
)
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
        self.recorded: AllocationIntent | None = None

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        del snapshot, config
        self.observed = True

    def record_intent(self, intent: AllocationIntent) -> None:
        self.recorded = intent


class _ResettableRule(_ObservingRule):
    def __init__(self, *, name: str) -> None:
        super().__init__(name=name)
        self.reset_called = False

    def reset(self) -> None:
        self.reset_called = True


class _BlockingGuard:
    name = "blocking_guard"
    priority = 35
    description = "would block if invoked"
    called = False

    def allow(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent | None:
        del snapshot, config
        self.called = True
        return AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="blocked",
            rule_group="none",
            decision_score=0.0,
            diagnostics=dict(intent.diagnostics or {}),
        )


class _TraceReplacingGuard:
    name = "trace_replacing_guard"
    priority = 0
    description = "blocks and emits replacement diagnostics"

    def allow(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent | None:
        del intent, snapshot, config
        return AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="blocked_by_trace_guard",
            rule_group="none",
            decision_score=0.0,
            diagnostics={"replacement": True},
        )


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


class _PublicParamsNoSectionRule(_FakeRule):
    @classmethod
    def public_params_section(cls) -> str | None:
        return None

    @classmethod
    def with_public_params(cls, section: object) -> _PublicParamsNoSectionRule:
        del section
        return cls(name="configured")


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


def test_rule_trace_marks_lower_priority_matches_as_shadowed_by_winner() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(
            _FakeRule(name="cross_down_exit"),
            _FakeRule(name="cross_up_equal_weight"),
        ),
    )

    assert intent.diagnostics is not None
    trace = intent.diagnostics["portfolio_rule_matches"]
    assert trace[1]["suppressed_by"] == "cross_down_exit"


def test_hold_intent_emits_signals_consulted_when_enabled() -> None:
    intent = resolve_portfolio_rules_intent(
        snapshot(),
        rules=_as_rules(_FakeRule(name="never", matches_value=False)),
        config=PortfolioRuleConfig(emit_signals_consulted=True),
    )

    assert intent.action == "hold"
    assert intent.diagnostics is not None
    assert intent.diagnostics[DIAG_SIGNALS_CONSULTED]["btc.zone"] == "above"


def test_rules_evaluator_observes_and_records_components() -> None:
    rule = _ObservingRule(name="alpha")
    evaluator = RulesEvaluator(rules=(cast(PortfolioRule, rule),))

    intent = evaluator.evaluate(
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
        ),
        RuleExecutionContext(),
    )

    assert rule.observed is True
    assert rule.recorded is intent


def test_rules_evaluator_applies_post_intent_adjustment_hooks() -> None:
    intent = RulesEvaluator(
        rules=(cast(PortfolioRule, _PostAdjustmentRule(name="alpha")),),
    ).evaluate(
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
        ),
        RuleExecutionContext(),
    )

    assert intent.reason == "post_adjusted_reason"
    assert intent.diagnostics is not None
    assert intent.diagnostics["post_adjusted"] is True


def test_rules_evaluator_skips_lower_priority_guard_for_known_matched_rule() -> None:
    rule = _FakeRule(name="cross_down_exit")
    guard = _BlockingGuard()

    intent = RulesEvaluator(
        rules=(cast(PortfolioRule, rule),),
        risk_guards=(guard,),
    ).evaluate(
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
        ),
        RuleExecutionContext(),
    )

    assert intent.reason == "fake_cross_down_exit_reason"
    assert guard.called is False


def test_rules_evaluator_preserves_rule_trace_when_guard_replaces_intent() -> None:
    intent = RulesEvaluator(
        rules=(cast(PortfolioRule, _FakeRule(name="cross_up_equal_weight")),),
        risk_guards=(_TraceReplacingGuard(),),
    ).evaluate(
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
        ),
        RuleExecutionContext(),
    )

    assert intent.reason == "blocked_by_trace_guard"
    assert intent.diagnostics is not None
    assert intent.diagnostics["replacement"] is True
    assert intent.diagnostics["portfolio_rule_matches"][0]["rule_name"] == (
        "cross_up_equal_weight"
    )


def test_rules_evaluator_applies_guard_when_matched_rule_priority_is_unknown() -> None:
    intent = RulesEvaluator(
        rules=(cast(PortfolioRule, _FakeRule(name="unknown_rule")),),
        risk_guards=(_TraceReplacingGuard(),),
    ).evaluate(
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
        ),
        RuleExecutionContext(),
    )

    assert intent.reason == "blocked_by_trace_guard"


def test_policy_record_execution_ignores_non_executed_or_unmatched_intents() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=_as_rules(_FakeRule(name="alpha"))
    )
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
    policy = DmaFgiPortfolioRulesDecisionPolicy(
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
    policy = DmaFgiPortfolioRulesDecisionPolicy(rules=(cast(PortfolioRule, rule),))
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
    assert policy._ctx.execution_state == RuleExecutionState()
    assert rule.reset_called is True


def test_policy_tracks_local_execution_state_when_no_provider_is_set() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=_as_rules(_FakeRule(name="alpha"))
    )

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
            current_date=date(2025, 5, 2),
        )
    )

    assert policy._ctx.execution_state == RuleExecutionState(
        last_trade_date=date(2025, 5, 2),
        trade_dates=(date(2025, 5, 2),),
    )


def test_policy_uses_external_execution_state_without_mutating_local_trade_dates() -> (
    None
):
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=_as_rules(_FakeRule(name="alpha")),
        execution_state_provider=lambda: RuleExecutionState(
            last_trade_date=date(2025, 5, 1),
            trade_dates=(date(2025, 5, 1),),
        ),
    )

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
            current_date=date(2025, 5, 2),
        )
    )

    assert policy._ctx.execution_state.trade_dates == (date(2025, 5, 1),)


def test_policy_updates_cycle_state_from_spy_and_crypto_crosses() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(rules=())

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


def test_build_portfolio_rules_applies_public_params_and_include_inactive() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {
            "disabled_rules": ["cross_down_exit"],
            "overextension_threshold_multiplier_greed": 0.67,
            "overextension_threshold_multiplier_extreme_greed": 0.50,
        }
    )

    active_rules = build_portfolio_rules_for_params(params)
    all_rules = build_portfolio_rules_for_params(params, include_inactive=True)

    assert "cross_down_exit" not in [rule.name for rule in active_rules]
    overextension_rule = next(
        rule for rule in all_rules if rule.name == "dma_overextension_dca_sell"
    )
    assert overextension_rule.overextension_threshold_multiplier_greed == 0.67
    assert overextension_rule.overextension_threshold_multiplier_extreme_greed == 0.50
    assert "spy_latch" in [rule.name for rule in all_rules]


def test_public_params_rule_with_no_section_is_returned_unchanged() -> None:
    rule = _PublicParamsNoSectionRule(name="no_section")

    assert _rule_with_public_params(rule, object()) is rule


def test_build_risk_guards_for_params_only_enables_trade_quota_when_configured() -> (
    None
):
    assert build_risk_guards_for_params(DmaGatedFgiParams()) == ()

    guards = build_risk_guards_for_params(DmaGatedFgiParams(min_trade_interval_days=3))

    assert [guard.name for guard in guards] == ["trade_quota"]


def test_decision_policy_validation_helpers_raise_for_unknown_names() -> None:
    found = required_rule(
        _as_rules(_FakeRule(name="alpha")),
        _FakeRule,
    )
    assert found.name == "alpha"

    with pytest.raises(ValueError, match="Missing required portfolio rule"):
        required_rule((), type(cast(PortfolioRule, _FakeRule(name="alpha"))))

    with pytest.raises(ValueError, match="Unsupported portfolio rule names"):
        assert_known_rule_names(frozenset({"missing"}), field_name="disabled_rules")


def test_matched_rule_priority_returns_none_without_matched_rule_diagnostic() -> None:
    assert (
        _matched_rule_priority(
            AllocationIntent(
                action="hold",
                target_allocation=None,
                allocation_name=None,
                immediate=False,
                reason="hold",
                rule_group="none",
                decision_score=0.0,
                diagnostics=None,
            )
        )
        is None
    )

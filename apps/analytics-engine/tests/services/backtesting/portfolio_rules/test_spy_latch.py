from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.spy_latch import SpyLatchRule
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def _intent(target: dict[str, float]) -> AllocationIntent:
    return AllocationIntent(
        action="hold",
        target_allocation=target,
        allocation_name="test_target",
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
    )


def test_spy_latch_redeploys_existing_stable_on_activation_day() -> None:
    rule = SpyLatchRule()
    current_date = date(2025, 5, 12)
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            "BTC": state(symbol="BTC"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.30, "eth": 0.10, "spy": 0.20, "stable": 0.40, "alt": 0.0},
        current_date=current_date,
    )

    rule.observe(rule_snapshot, config=PortfolioRuleConfig())
    adjusted = rule.apply_post_intent_adjustments(
        intent=_intent({"btc": 0.30, "eth": 0.10, "spy": 0.20, "stable": 0.40}),
        snapshot=rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.30, "eth": 0.10, "spy": 0.60, "stable": 0.0, "alt": 0.0}
    )
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == [
        "spy_latch_redeploy_existing_stable"
    ]
    assert adjusted.diagnostics["spy_latch_redeployed_stable"] == pytest.approx(0.40)


def test_spy_latch_absorbs_fresh_stable_during_follow_through_window() -> None:
    rule = SpyLatchRule()
    activation_date = date(2025, 5, 12)
    activation_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            )
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0},
        current_date=activation_date,
    )
    rule.observe(activation_snapshot, config=PortfolioRuleConfig())

    follow_through_snapshot = snapshot(
        assets={"SPY": state(symbol="SPY", zone="above")},
        current={"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0},
        current_date=activation_date + timedelta(days=3),
    )
    rule.observe(follow_through_snapshot, config=PortfolioRuleConfig())
    adjusted = rule.apply_post_intent_adjustments(
        intent=_intent({"btc": 0.0, "eth": 0.0, "spy": 0.70, "stable": 0.30}),
        snapshot=follow_through_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0}
    )
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == [
        "spy_latch_absorb_fresh_stable"
    ]
    assert adjusted.diagnostics["spy_latch_redeployed_stable"] == pytest.approx(0.30)


def test_spy_latch_expires_after_follow_through_window() -> None:
    rule = SpyLatchRule(follow_through_days=14)
    activation_date = date(2025, 5, 12)
    rule.observe(
        snapshot(
            assets={
                "SPY": state(
                    symbol="SPY",
                    zone="above",
                    cross_event="cross_up",
                    actionable_cross_event="cross_up",
                )
            },
            current={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.20,
                "stable": 0.80,
                "alt": 0.0,
            },
            current_date=activation_date,
        ),
        config=PortfolioRuleConfig(),
    )
    expired_snapshot = snapshot(
        assets={"SPY": state(symbol="SPY", zone="above")},
        current={"btc": 0.0, "eth": 0.0, "spy": 0.80, "stable": 0.20, "alt": 0.0},
        current_date=activation_date + timedelta(days=15),
    )

    rule.observe(expired_snapshot, config=PortfolioRuleConfig())
    adjusted = rule.apply_post_intent_adjustments(
        intent=_intent(
            {"btc": 0.0, "eth": 0.0, "spy": 0.80, "stable": 0.20, "alt": 0.0}
        ),
        snapshot=expired_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.80, "stable": 0.20, "alt": 0.0}
    )
    assert adjusted.diagnostics is None

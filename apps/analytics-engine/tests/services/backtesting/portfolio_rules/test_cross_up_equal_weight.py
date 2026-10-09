from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaCooldownState
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state
from tests.services.backtesting.support.reference_rules import reference_rule


def test_first_cross_up_deploys_all_stable_to_the_crossing_asset() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "buy"
    assert intent.reason == "portfolio_cross_up_equal_weight"
    assert intent.immediate is True
    assert intent.target_allocation == pytest.approx(
        {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["BTC"],
        "portfolio_rule_trigger_assets": ["BTC"],
    }


def test_second_cross_up_rebalances_to_equal_weight() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(
                symbol="ETH",
                zone="above",
                dma_distance=0.03,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
        },
        current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["BTC", "ETH"],
        "portfolio_rule_trigger_assets": ["ETH"],
    }


def test_third_cross_up_rebalances_all_three_eligible_assets() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                dma_distance=0.02,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.03),
        },
        current={"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {
            "btc": 1 / 3,
            "eth": 1 / 3,
            "spy": 1 / 3,
            "stable": 0.0,
            "alt": 0.0,
        }
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["SPY", "BTC", "ETH"],
        "portfolio_rule_trigger_assets": ["SPY"],
    }


def test_cross_up_excludes_assets_not_above_dma() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(
                symbol="ETH",
                zone="above",
                dma_distance=0.03,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
        },
        current={"btc": 0.70, "eth": 0.0, "spy": 0.30, "stable": 0.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )


def test_cross_up_equal_weight_does_not_fire_during_cooldown() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event=None,
                cooldown_state=DmaCooldownState(
                    active=True,
                    remaining_days=10,
                    blocked_zone="above",
                ),
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is False


def test_cross_up_equal_weight_excludes_assets_in_reentry_cooldown() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                dma_distance=0.02,
                actionable_cross_event="cross_up",
            ),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cooldown_state=DmaCooldownState(
                    active=True,
                    remaining_days=14,
                    blocked_zone="above",
                ),
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["SPY"],
        "portfolio_rule_trigger_assets": ["SPY"],
    }


def test_actionable_cross_up_bypasses_reentry_cooldown() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                dma_distance=0.02,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
                cooldown_state=DmaCooldownState(
                    active=True,
                    remaining_days=10,
                    blocked_zone="above",
                ),
            ),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.25, "stable": 0.75, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["SPY"],
        "portfolio_rule_trigger_assets": ["SPY"],
    }


def test_cross_up_equal_weight_fires_when_actionable_cross_resumes() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                actionable_cross_event="cross_up",
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.action == "buy"
    assert intent.reason == "portfolio_cross_up_equal_weight"
    assert intent.rule_group == "cross"
    assert intent.immediate is True
    assert intent.target_allocation == pytest.approx(
        {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["BTC"],
        "portfolio_rule_trigger_assets": ["BTC"],
    }


def test_cross_up_equal_weight_emits_trigger_assets_diagnostic() -> None:
    rule = reference_rule("cross_up_equal_weight")
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.02),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(
                symbol="ETH",
                zone="above",
                dma_distance=0.03,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
        },
        current={"btc": 0.5, "eth": 0.0, "spy": 0.5, "stable": 0.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {
            "btc": 1 / 3,
            "eth": 1 / 3,
            "spy": 1 / 3,
            "stable": 0.0,
            "alt": 0.0,
        }
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["SPY", "BTC", "ETH"],
        "portfolio_rule_trigger_assets": ["ETH"],
    }


def _two_above_after_a_trim() -> PortfolioSnapshot:
    return snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(
                symbol="ETH",
                zone="above",
                dma_distance=0.03,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
        },
        current={"btc": 0.60, "eth": 0.0, "spy": 0.10, "stable": 0.30, "alt": 0.0},
    )


def test_the_reference_re_weights_the_whole_portfolio() -> None:
    rule = reference_rule("cross_up_equal_weight")

    intent = rule.build_intent(_two_above_after_a_trim(), config=PortfolioRuleConfig())

    assert rule.deploy_stable_only is False
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )


def test_deploying_only_the_stable_keeps_every_holding() -> None:
    rule = reference_rule("cross_up_equal_weight", deploy_stable_only=True)

    intent = rule.build_intent(_two_above_after_a_trim(), config=PortfolioRuleConfig())

    assert intent.action == "buy"
    assert intent.reason == "portfolio_cross_up_equal_weight"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.75, "eth": 0.15, "spy": 0.10, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics == {
        "portfolio_rule_assets": ["BTC", "ETH"],
        "portfolio_rule_trigger_assets": ["ETH"],
    }


def test_deploying_with_no_stable_changes_nothing() -> None:
    rule = reference_rule("cross_up_equal_weight", deploy_stable_only=True)
    day = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
        },
        current={"btc": 0.60, "eth": 0.0, "spy": 0.40, "stable": 0.0, "alt": 0.0},
    )

    intent = rule.build_intent(day, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.60, "eth": 0.0, "spy": 0.40, "stable": 0.0, "alt": 0.0}
    )

from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaCooldownState
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_first_cross_up_deploys_all_stable_to_the_crossing_asset() -> None:
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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
    rule = CrossUpEqualWeightRule()
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


def test_cross_up_equal_weight_filters_cross_up_when_fgi_slope_is_too_low() -> None:
    rule = CrossUpEqualWeightRule(fgi_slope_min=0.0)
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                actionable_cross_event="cross_up",
                fgi_slope=-0.01,
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is False


def test_cross_up_equal_weight_allows_cross_up_at_fgi_slope_threshold() -> None:
    rule = CrossUpEqualWeightRule(fgi_slope_min=0.05)
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                actionable_cross_event="cross_up",
                fgi_slope=0.05,
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())


def test_cross_up_equal_weight_amplifies_deeper_drawdown_weights() -> None:
    rule = CrossUpEqualWeightRule(
        drawdown_amplifier_alpha=1.0,
        drawdown_amplifier_threshold=0.20,
    )
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                actionable_cross_event="cross_up",
                peak_distance_60d=-0.30,
            ),
            "ETH": state(
                symbol="ETH",
                zone="above",
                dma_distance=0.03,
                peak_distance_60d=-0.10,
            ),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {
            "btc": 1.1 / 2.1,
            "eth": 1.0 / 2.1,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        }
    )


def test_cross_up_equal_weight_combines_fgi_filter_and_drawdown_amplifier() -> None:
    rule = CrossUpEqualWeightRule(
        fgi_slope_min=0.0,
        drawdown_amplifier_alpha=0.5,
        drawdown_amplifier_threshold=0.20,
    )
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="below", dma_distance=-0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                actionable_cross_event="cross_up",
                fgi_slope=0.02,
                peak_distance_60d=-0.40,
            ),
            "ETH": state(
                symbol="ETH",
                zone="above",
                dma_distance=0.03,
                fgi_slope=-0.20,
                peak_distance_60d=None,
            ),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.target_allocation == pytest.approx(
        {
            "btc": 1.1 / 2.1,
            "eth": 1.0 / 2.1,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        }
    )

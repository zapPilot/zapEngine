from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
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
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC"]}


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
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC", "ETH"]}


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
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY", "BTC", "ETH"]}


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
            ),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is False


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
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC"]}

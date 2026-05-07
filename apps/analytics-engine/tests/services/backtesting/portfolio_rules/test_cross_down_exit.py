from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_btc_cross_down_liquidates_crypto_peers_to_stable() -> None:
    rule = CrossDownExitRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(
                symbol="BTC",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.40, "eth": 0.30, "spy": 0.20, "stable": 0.10, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.action == "sell"
    assert intent.reason == "portfolio_cross_down_exit"
    assert intent.rule_group == "cross"
    assert intent.immediate is True
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC", "ETH"]
    assert intent.diagnostics["portfolio_rule_trigger_assets"] == ["BTC"]


def test_eth_cross_down_liquidates_crypto_peers_to_stable() -> None:
    rule = CrossDownExitRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC"),
            "ETH": state(
                symbol="ETH",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
        },
        current={"btc": 0.40, "eth": 0.30, "spy": 0.20, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC", "ETH"]
    assert intent.diagnostics["portfolio_rule_trigger_assets"] == ["ETH"]


def test_spy_cross_down_liquidates_only_spy_to_stable() -> None:
    rule = CrossDownExitRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
            "BTC": state(symbol="BTC"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.40, "eth": 0.30, "spy": 0.20, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.40, "eth": 0.30, "spy": 0.0, "stable": 0.30, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["SPY"]
    assert intent.diagnostics["portfolio_rule_trigger_assets"] == ["SPY"]


def test_cross_down_exit_ignores_non_cross_down_days() -> None:
    rule = CrossDownExitRule()

    assert not rule.matches(snapshot(), config=PortfolioRuleConfig())


def test_cross_down_exit_does_not_fire_when_actionable_cross_is_suppressed() -> None:
    rule = CrossDownExitRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(
                symbol="BTC",
                cross_event="cross_down",
                actionable_cross_event=None,
            ),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.40, "eth": 0.30, "spy": 0.20, "stable": 0.10, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is False

from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    ProceedsRouting,
)
from src.services.backtesting.spec import compile_spec, parse_spec
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state
from tests.services.backtesting.spec.helpers import reference_raw, rule_index
from tests.services.backtesting.support.reference_rules import reference_rule


def test_btc_cross_down_liquidates_crypto_peers_to_stable() -> None:
    rule = reference_rule("cross_down_exit")
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


def test_btc_cross_down_marks_crypto_group_for_cooldown_even_without_btc_position() -> (
    None
):
    rule = reference_rule("cross_down_exit")
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
        current={"btc": 0.0, "eth": 0.30, "spy": 0.20, "stable": 0.50, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["ETH"]
    assert intent.diagnostics["portfolio_rule_trigger_assets"] == ["BTC"]
    assert intent.diagnostics["portfolio_rule_exit_assets"] == ["BTC", "ETH"]
    assert intent.diagnostics["portfolio_rule_cooldown_assets"] == ["BTC", "ETH"]
    assert intent.diagnostics["portfolio_rule_forced_cross_events"] == {
        "BTC": "cross_down",
        "ETH": "cross_down",
    }


def test_eth_cross_down_liquidates_crypto_peers_to_stable() -> None:
    rule = reference_rule("cross_down_exit")
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


def test_eth_cross_down_marks_crypto_group_for_cooldown_even_without_eth_position() -> (
    None
):
    rule = reference_rule("cross_down_exit")
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
        current={"btc": 0.40, "eth": 0.0, "spy": 0.20, "stable": 0.40, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]
    assert intent.diagnostics["portfolio_rule_trigger_assets"] == ["ETH"]
    assert intent.diagnostics["portfolio_rule_exit_assets"] == ["BTC", "ETH"]
    assert intent.diagnostics["portfolio_rule_cooldown_assets"] == ["BTC", "ETH"]
    assert intent.diagnostics["portfolio_rule_forced_cross_events"] == {
        "BTC": "cross_down",
        "ETH": "cross_down",
    }


def test_spy_cross_down_liquidates_only_spy_to_stable() -> None:
    rule = reference_rule("cross_down_exit")
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
    assert intent.diagnostics["portfolio_rule_exit_assets"] == ["SPY"]
    assert intent.diagnostics["portfolio_rule_cooldown_assets"] == ["SPY"]
    assert intent.diagnostics["portfolio_rule_forced_cross_events"] == {
        "SPY": "cross_down"
    }


def test_cross_down_exit_ignores_non_cross_down_days() -> None:
    rule = reference_rule("cross_down_exit")

    assert not rule.matches(snapshot(), config=PortfolioRuleConfig())


def test_cross_down_exit_does_not_fire_when_actionable_cross_is_suppressed() -> None:
    rule = reference_rule("cross_down_exit")
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


def test_peer_groups_decide_who_leaves_together() -> None:
    rule = reference_rule("cross_down_exit", peer_groups=(("SPY", "BTC", "ETH"),))
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
        current={"btc": 0.30, "eth": 0.30, "spy": 0.30, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_exit_assets"] == ["SPY", "BTC", "ETH"]


def test_an_asset_in_no_peer_group_leaves_alone() -> None:
    rule = reference_rule("cross_down_exit", peer_groups=())
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

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.30, "spy": 0.20, "stable": 0.50, "alt": 0.0}
    )


def test_proceeds_can_be_routed_instead_of_kept_in_stable() -> None:
    rule = reference_rule(
        "cross_down_exit", proceeds=ProceedsRouting(to=(("SPY", 0.5),))
    )
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

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.55, "stable": 0.45, "alt": 0.0}
    )


def test_the_reference_keeps_one_exit_cooldown_per_asset() -> None:
    rule_scoped = reference_raw()
    del rule_scoped["rules"][rule_index(rule_scoped, "dma_cross_down_exit")][
        "cooldown_scope"
    ]

    assert reference_rule("cross_down_exit").cooldown_keyed_by_trigger_symbol is True
    assert (
        compile_spec(parse_spec(rule_scoped)).rules[0].cooldown_keyed_by_trigger_symbol
        is False
    )


def test_a_per_asset_cooldown_is_tracked_for_the_assets_that_crossed() -> None:
    rule = reference_rule("cross_down_exit", cooldown_keyed_by_trigger_symbol=True)
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
    )

    assert rule.trigger_symbols_for_cooldown(rule_snapshot) == ["SPY"]
    assert rule.trigger_symbols_for_cooldown(snapshot()) == []

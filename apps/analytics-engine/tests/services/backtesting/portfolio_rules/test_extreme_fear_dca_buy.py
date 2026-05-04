from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.extreme_fear_dca_buy import (
    ExtremeFearDcaBuyRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_extreme_fear_buy_uses_macro_fgi_for_spy() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="neutral",
                macro_fear_greed_regime="extreme_fear",
            ),
            "BTC": state(symbol="BTC"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        macro_regime="extreme_fear",
        crypto_regime="neutral",
        cycle_open={"SPY": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "buy"
    assert intent.reason == "portfolio_extreme_fear_dca_buy"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.05, "stable": 0.95, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY"]}


def test_extreme_fear_buy_uses_crypto_fgi_for_btc_and_eth() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                macro_fear_greed_regime="neutral",
            ),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.04),
        },
        current={"btc": 0.10, "eth": 0.20, "spy": 0.0, "stable": 0.70, "alt": 0.0},
        macro_regime="neutral",
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True, "ETH": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.15, "eth": 0.25, "spy": 0.0, "stable": 0.60, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC", "ETH"]}


def test_extreme_fear_buy_caps_by_available_stable() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.04),
        },
        current={"btc": 0.48, "eth": 0.48, "spy": 0.0, "stable": 0.04, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True, "ETH": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.50, "eth": 0.50, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )


def test_extreme_fear_buy_includes_above_dma_assets() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                dma_distance=0.05,
                fgi_regime="neutral",
                macro_fear_greed_regime="extreme_fear",
            ),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        macro_regime="extreme_fear",
        crypto_regime="neutral",
        cycle_open={"SPY": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "buy"
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY"]}


def test_extreme_fear_buy_excludes_non_extreme_fear_assets() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                macro_fear_greed_regime="neutral",
            ),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        macro_regime="neutral",
        crypto_regime="neutral",
        cycle_open={"BTC": True, "ETH": True, "SPY": True},
    )

    assert not rule.matches(rule_snapshot, config=PortfolioRuleConfig())


def test_extreme_fear_buy_blocked_when_cycle_closed() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="extreme_fear"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.10, "eth": 0.0, "spy": 0.0, "stable": 0.90, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": False},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is False


def test_extreme_fear_buy_fires_when_cycle_open() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="extreme_fear"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.10, "eth": 0.0, "spy": 0.0, "stable": 0.90, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is True
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())
    assert (
        intent.target_allocation["btc"] > rule_snapshot.current_asset_allocation["btc"]
    )


def test_extreme_fear_buy_per_asset_gate() -> None:
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="extreme_fear"),
            "ETH": state(symbol="ETH", fgi_regime="extreme_fear"),
        },
        current={"btc": 0.10, "eth": 0.10, "spy": 0.0, "stable": 0.80, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True, "ETH": False},
    )

    intent = ExtremeFearDcaBuyRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )
    diagnostics_assets = intent.diagnostics["portfolio_rule_assets"]
    assert "BTC" in diagnostics_assets
    assert "ETH" not in diagnostics_assets

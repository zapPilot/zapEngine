from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_btc_overextension_routes_50_50_spy_stable() -> None:
    rule = DmaOverextensionDcaSellRule()
    initial_spy = 0.20
    initial_stable = 0.10
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.10),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.21),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.49),
        },
        current={
            "btc": 0.40,
            "eth": 0.30,
            "spy": initial_spy,
            "stable": initial_stable,
            "alt": 0.0,
        },
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "sell"
    assert intent.reason == "portfolio_dma_overextension_dca_sell"
    assert intent.target_allocation == pytest.approx(
        {
            "btc": 0.35,
            "eth": 0.30,
            "spy": initial_spy + 0.025,
            "stable": initial_stable + 0.025,
            "alt": 0.0,
        }
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC"]}


def test_spy_overextension_self_rebuys_half() -> None:
    rule = DmaOverextensionDcaSellRule()
    initial_stable = 0.10
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.11),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.19),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.50),
        },
        current={"btc": 0.30, "eth": 0.30, "spy": 0.30, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    # SPY sells 0.05 but receives half of the proceeds, so the net sell is 0.025.
    assert intent.target_allocation == pytest.approx(
        {
            "btc": 0.30,
            "eth": 0.30,
            "spy": 0.275,
            "stable": initial_stable + 0.025,
            "alt": 0.0,
        }
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY"]}

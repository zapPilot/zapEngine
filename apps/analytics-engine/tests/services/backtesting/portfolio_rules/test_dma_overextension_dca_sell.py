from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_overextension_sell_uses_per_asset_thresholds() -> None:
    rule = DmaOverextensionDcaSellRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.10),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.21),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.49),
        },
        current={"btc": 0.40, "eth": 0.30, "spy": 0.20, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "sell"
    assert intent.reason == "portfolio_dma_overextension_dca_sell"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.35, "eth": 0.30, "spy": 0.20, "stable": 0.15, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC"]}


def test_overextension_sell_matches_spy_above_its_lower_threshold() -> None:
    rule = DmaOverextensionDcaSellRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.11),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.19),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.50),
        },
        current={"btc": 0.30, "eth": 0.30, "spy": 0.30, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.30, "eth": 0.30, "spy": 0.25, "stable": 0.15, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY"]}

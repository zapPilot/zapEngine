from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.decision_policy import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.portfolio_rules.greed_sell_suppression import (
    GreedSellSuppressionRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_above_dma_extreme_greed_over_threshold_suppresses_sell() -> None:
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.05),
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.21,
                fgi_regime="extreme_greed",
            ),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.49),
        },
        current={"btc": 0.40, "eth": 0.10, "spy": 0.20, "stable": 0.30, "alt": 0.0},
    )

    intent = resolve_portfolio_rules_intent(
        rule_snapshot,
        rules=(GreedSellSuppressionRule(), DmaOverextensionDcaSellRule()),
        config=PortfolioRuleConfig(),
    )

    assert intent.action == "hold"
    assert intent.reason == "portfolio_greed_sell_suppression"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.40, "eth": 0.10, "spy": 0.20, "stable": 0.30, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "greed_sell_suppression"


def test_greed_without_extreme_greed_does_not_match() -> None:
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.21,
                fgi_regime="greed",
            )
        }
    )

    assert (
        GreedSellSuppressionRule().matches(
            rule_snapshot,
            config=PortfolioRuleConfig(),
        )
        is False
    )


def test_extreme_greed_below_dma_does_not_match() -> None:
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.21,
                fgi_regime="extreme_greed",
            )
        }
    )

    assert (
        GreedSellSuppressionRule().matches(
            rule_snapshot,
            config=PortfolioRuleConfig(),
        )
        is False
    )

from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.fgi_downshift_dca_sell import (
    FgiDownshiftDcaSellRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_downshift_sell_matches_greed_to_neutral_transition() -> None:
    rule = FgiDownshiftDcaSellRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="neutral"),
            "ETH": state(symbol="ETH", fgi_regime="greed"),
        },
        current={"btc": 0.40, "eth": 0.30, "spy": 0.0, "stable": 0.30, "alt": 0.0},
        previous={"BTC": "greed", "ETH": "greed"},
        crypto_regime="neutral",
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "sell"
    assert intent.reason == "portfolio_fgi_downshift_dca_sell"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.35, "eth": 0.25, "spy": 0.0, "stable": 0.40, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC", "ETH"]}


def test_downshift_sell_uses_macro_fgi_for_spy() -> None:
    rule = FgiDownshiftDcaSellRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                fgi_regime="greed",
                macro_fear_greed_regime="fear",
            ),
            "BTC": state(symbol="BTC", fgi_regime="greed"),
            "ETH": state(symbol="ETH", fgi_regime="greed"),
        },
        current={"btc": 0.20, "eth": 0.20, "spy": 0.20, "stable": 0.40, "alt": 0.0},
        previous={"SPY": "extreme_greed", "BTC": "greed", "ETH": "greed"},
        macro_regime="fear",
        crypto_regime="greed",
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.20, "eth": 0.20, "spy": 0.15, "stable": 0.45, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY"]}


def test_downshift_sell_ignores_non_transition_days() -> None:
    rule = FgiDownshiftDcaSellRule()
    rule_snapshot = snapshot(
        assets={"BTC": state(symbol="BTC", fgi_regime="greed")},
        previous={"BTC": "greed"},
        crypto_regime="greed",
    )

    assert not rule.matches(rule_snapshot, config=PortfolioRuleConfig())

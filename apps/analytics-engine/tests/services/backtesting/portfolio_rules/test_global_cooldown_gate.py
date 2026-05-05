from __future__ import annotations

from datetime import date

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.global_cooldown_gate import (
    GlobalCooldownGateRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot


def test_global_cooldown_matches_before_window_expires() -> None:
    rule = GlobalCooldownGateRule()
    rule_snapshot = snapshot(
        current={"btc": 0.20, "eth": 0.10, "spy": 0.30, "stable": 0.40, "alt": 0.0},
        last_trade_date=date(2025, 3, 8),
        current_date=date(2025, 3, 14),
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "hold"
    assert intent.reason == "global_cooldown_active"
    assert intent.target_allocation == {
        "btc": 0.20,
        "eth": 0.10,
        "spy": 0.30,
        "stable": 0.40,
        "alt": 0.0,
    }
    assert intent.diagnostics == {"matched_rule_name": "global_cooldown_gate"}


def test_global_cooldown_expires_on_window_boundary() -> None:
    rule = GlobalCooldownGateRule()
    rule_snapshot = snapshot(
        last_trade_date=date(2025, 3, 8),
        current_date=date(2025, 3, 15),
    )

    assert not rule.matches(
        rule_snapshot,
        config=PortfolioRuleConfig(global_cooldown_days=7),
    )


def test_global_cooldown_does_not_match_without_trade_history() -> None:
    rule = GlobalCooldownGateRule()

    assert not rule.matches(
        snapshot(current_date=date(2025, 3, 14)),
        config=PortfolioRuleConfig(),
    )

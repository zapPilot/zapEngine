"""Tests for trade quota portfolio rule."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.trade_quota_rule import TradeQuotaRule
from tests.services.backtesting.portfolio_rules.helpers import snapshot


def test_trade_quota_rule_is_inactive_without_limits() -> None:
    rule = TradeQuotaRule()
    snap = snapshot(
        current_date=date(2025, 1, 5),
        trade_dates=(date(2025, 1, 4),),
    )

    assert rule.matches(snap, config=PortfolioRuleConfig()) is False


def test_trade_quota_rule_blocks_min_trade_interval() -> None:
    rule = TradeQuotaRule(min_trade_interval_days=3)
    snap = snapshot(
        current_date=date(2025, 1, 2),
        trade_dates=(date(2025, 1, 1),),
    )

    assert rule.matches(snap, config=PortfolioRuleConfig()) is True
    intent = rule.build_intent(snap, config=PortfolioRuleConfig())

    assert intent.action == "hold"
    assert intent.reason == "trade_quota_min_interval_active"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["next_trade_date"] == "2025-01-04"
    assert intent.diagnostics["days_since_last_trade"] == 1


def test_trade_quota_rule_blocks_rolling_7d_limit() -> None:
    rule = TradeQuotaRule(max_trades_7d=2)
    snap = snapshot(
        current_date=date(2025, 1, 5),
        trade_dates=(date(2025, 1, 1), date(2025, 1, 4)),
    )

    assert rule.matches(snap, config=PortfolioRuleConfig()) is True
    intent = rule.build_intent(snap, config=PortfolioRuleConfig())

    assert intent.reason == "trade_quota_7d_limit_reached"
    assert intent.diagnostics is not None
    assert intent.diagnostics["trades_7d"] == 2
    assert intent.diagnostics["next_trade_date"] == "2025-01-08"


def test_trade_quota_rule_blocks_rolling_30d_limit() -> None:
    rule = TradeQuotaRule(max_trades_30d=2)
    snap = snapshot(
        current_date=date(2025, 1, 21),
        trade_dates=(date(2025, 1, 1), date(2025, 1, 20)),
    )

    assert rule.matches(snap, config=PortfolioRuleConfig()) is True
    intent = rule.build_intent(snap, config=PortfolioRuleConfig())

    assert intent.reason == "trade_quota_30d_limit_reached"
    assert intent.diagnostics is not None
    assert intent.diagnostics["trades_30d"] == 2
    assert intent.diagnostics["next_trade_date"] == "2025-01-31"

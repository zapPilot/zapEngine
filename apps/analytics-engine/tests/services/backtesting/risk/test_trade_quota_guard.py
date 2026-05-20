"""Tests for trade-quota risk guard."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    DIAG_SIGNALS_CONSULTED,
    PortfolioRuleConfig,
)
from src.services.backtesting.risk.trade_quota_guard import TradeQuotaGuard
from src.services.backtesting.trade_quota import TradeQuotaLimits, normalize_limit
from tests.services.backtesting.portfolio_rules.helpers import snapshot


def _buy_intent() -> AllocationIntent:
    return AllocationIntent(
        action="buy",
        target_allocation={
            "btc": 0.05,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.95,
            "alt": 0.0,
        },
        allocation_name="test_rebalance_buy",
        immediate=False,
        reason="test_rebalance_buy",
        rule_group="dma_fgi",
        decision_score=1.0,
        diagnostics={"matched_rule_name": "test_rebalance_buy"},
    )


def test_trade_quota_guard_allows_when_inactive_without_limits() -> None:
    guard = TradeQuotaGuard()
    snap = snapshot(
        current_date=date(2025, 1, 5),
        trade_dates=(date(2025, 1, 4),),
    )

    assert guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig()) is None


def test_trade_quota_guard_blocks_min_trade_interval() -> None:
    guard = TradeQuotaGuard(min_trade_interval_days=3)
    snap = snapshot(
        current_date=date(2025, 1, 2),
        trade_dates=(date(2025, 1, 1),),
    )

    intent = guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig())

    assert intent is not None
    assert intent.action == "hold"
    assert intent.reason == "trade_quota_min_interval_active"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "trade_quota"
    assert intent.diagnostics["next_trade_date"] == "2025-01-04"
    assert intent.diagnostics["days_since_last_trade"] == 1


def test_trade_quota_guard_blocks_rolling_7d_limit() -> None:
    guard = TradeQuotaGuard(max_trades_7d=2)
    snap = snapshot(
        current_date=date(2025, 1, 5),
        trade_dates=(date(2025, 1, 1), date(2025, 1, 4)),
    )

    intent = guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig())

    assert intent is not None
    assert intent.reason == "trade_quota_7d_limit_reached"
    assert intent.diagnostics is not None
    assert intent.diagnostics["trades_7d"] == 2
    assert intent.diagnostics["next_trade_date"] == "2025-01-08"


def test_trade_quota_guard_blocks_rolling_30d_limit() -> None:
    guard = TradeQuotaGuard(max_trades_30d=2)
    snap = snapshot(
        current_date=date(2025, 1, 21),
        trade_dates=(date(2025, 1, 1), date(2025, 1, 20)),
    )

    intent = guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig())

    assert intent is not None
    assert intent.reason == "trade_quota_30d_limit_reached"
    assert intent.diagnostics is not None
    assert intent.diagnostics["trades_30d"] == 2
    assert intent.diagnostics["next_trade_date"] == "2025-01-31"


def test_trade_quota_guard_preserves_quota_precedence_over_existing_hold() -> None:
    guard = TradeQuotaGuard(min_trade_interval_days=3)
    hold = AllocationIntent(
        action="hold",
        target_allocation={"stable": 1.0},
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
        diagnostics={"matched_rule_name": "regime_no_signal_hold"},
    )
    snap = snapshot(
        current_date=date(2025, 1, 2),
        trade_dates=(date(2025, 1, 1),),
    )

    intent = guard.allow(hold, snap, config=PortfolioRuleConfig())

    assert intent is not None
    assert intent.action == "hold"
    assert intent.reason == "trade_quota_min_interval_active"


def test_trade_quota_guard_allows_when_enabled_but_not_blocked() -> None:
    guard = TradeQuotaGuard(min_trade_interval_days=3, max_trades_7d=3)
    snap = snapshot(
        current_date=date(2025, 1, 5),
        trade_dates=(date(2025, 1, 1),),
    )

    assert guard.allow(_buy_intent(), snap, config=PortfolioRuleConfig()) is None


def test_trade_quota_guard_diagnostic_includes_signals_when_requested() -> None:
    guard = TradeQuotaGuard(min_trade_interval_days=3)
    snap = snapshot(
        current_date=date(2025, 1, 2),
        trade_dates=(date(2025, 1, 1),),
    )

    intent = guard.allow(
        _buy_intent(),
        snap,
        config=PortfolioRuleConfig(emit_signals_consulted=True),
    )

    assert intent is not None
    assert intent.diagnostics is not None
    assert "btc.zone" in intent.diagnostics[DIAG_SIGNALS_CONSULTED]


def test_trade_quota_limit_validation_rejects_bool_and_nonpositive_values() -> None:
    with pytest.raises(ValueError, match="max_trades_7d must be greater than 0"):
        normalize_limit(True, field_name="max_trades_7d")
    with pytest.raises(ValueError, match="max_trades_30d must be greater than 0"):
        normalize_limit(0, field_name="max_trades_30d")


def test_trade_quota_disabled_limits_have_zero_lookback_and_no_release_date() -> None:
    limits = TradeQuotaLimits()

    assert limits.history_lookback_days == 0
    assert (
        limits.window_release_date(
            date(2025, 1, 5),
            (),
            window_days=7,
        )
        is None
    )

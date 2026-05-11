from __future__ import annotations

from dataclasses import fields

import pytest

from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULES,
)
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    add_split_proceeds,
    cross_down_cooldown_days_for,
)
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.risk import DmaBuyGateGuard, TradeQuotaGuard


def test_default_rule_priorities_leave_room_for_new_rule_layers() -> None:
    assert [(rule.name, rule.priority) for rule in DEFAULT_PORTFOLIO_RULES] == [
        ("cross_down_exit", 10),
        ("cross_up_equal_weight", 20),
        ("eth_btc_ratio_rotation", 21),
        ("dma_overextension_dca_sell", 30),
        ("fgi_downshift_dca_sell", 50),
    ]


def test_risk_guard_priorities_preserve_existing_ordering() -> None:
    assert TradeQuotaGuard().priority == 0
    assert DmaBuyGateGuard().priority == 35


def test_add_split_proceeds_default_50_50() -> None:
    target = {"spy": 0.10, "stable": 0.20}

    add_split_proceeds(target, 0.10)

    assert target["spy"] == pytest.approx(0.15)
    assert target["stable"] == pytest.approx(0.25)


def test_add_split_proceeds_custom_share() -> None:
    target = {"spy": 0.0, "stable": 0.0}

    add_split_proceeds(target, 0.10, spy_share=0.25)

    assert target["spy"] == pytest.approx(0.025)
    assert target["stable"] == pytest.approx(0.075)


def test_add_split_proceeds_skips_zero_amount() -> None:
    target = {"spy": 0.10, "stable": 0.20}

    add_split_proceeds(target, 0.0)

    assert target["spy"] == pytest.approx(0.10)
    assert target["stable"] == pytest.approx(0.20)


def test_portfolio_rule_config_only_contains_cross_cutting_diagnostics_flag() -> None:
    assert [field.name for field in fields(PortfolioRuleConfig)] == [
        "emit_signals_consulted"
    ]


def test_cross_down_cooldown_default_map() -> None:
    rule = CrossDownExitRule()

    assert rule.cooldown_days_for("BTC") == 30
    assert rule.cooldown_days_for("ETH") == 30
    assert rule.cooldown_days_for("SPY") == 14


def test_cross_down_cooldown_unknown_symbol_falls_back_to_default() -> None:
    rule = CrossDownExitRule()

    assert rule.cooldown_days_for("DOGE") == 30


def test_cross_down_cooldown_normalizes_symbol_case() -> None:
    rule = CrossDownExitRule()

    assert rule.cooldown_days_for("spy") == 14
    assert rule.cooldown_days_for(" btc ") == 30


def test_cross_down_cooldown_custom_override() -> None:
    rule = CrossDownExitRule(
        cross_down_cooldown_days_per_symbol={"SPY": 14, "BTC": 21},
        cooldown_days=10,
    )

    assert rule.cooldown_days_for("SPY") == 14
    assert rule.cooldown_days_for("BTC") == 21
    assert rule.cooldown_days_for("ETH") == 10


def test_cross_down_cooldown_helper_accepts_rule_local_values() -> None:
    assert (
        cross_down_cooldown_days_for(
            "spy",
            per_symbol={"SPY": 14},
            default=30,
        )
        == 14
    )

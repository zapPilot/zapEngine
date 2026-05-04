from __future__ import annotations

from dataclasses import replace

import pytest

from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    add_split_proceeds,
    cross_down_cooldown_days_for,
)


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


def test_cross_down_cooldown_default_map() -> None:
    config = PortfolioRuleConfig()

    assert cross_down_cooldown_days_for("BTC", config=config) == 30
    assert cross_down_cooldown_days_for("ETH", config=config) == 30
    assert cross_down_cooldown_days_for("SPY", config=config) == 7


def test_cross_down_cooldown_unknown_symbol_falls_back_to_default() -> None:
    config = PortfolioRuleConfig()

    assert cross_down_cooldown_days_for("DOGE", config=config) == 30


def test_cross_down_cooldown_normalizes_symbol_case() -> None:
    config = PortfolioRuleConfig()

    assert cross_down_cooldown_days_for("spy", config=config) == 7
    assert cross_down_cooldown_days_for(" btc ", config=config) == 30


def test_cross_down_cooldown_custom_override() -> None:
    config = replace(
        PortfolioRuleConfig(),
        cross_down_cooldown_days_per_symbol={"SPY": 14, "BTC": 21},
        default_cross_down_cooldown_days=10,
    )

    assert cross_down_cooldown_days_for("SPY", config=config) == 14
    assert cross_down_cooldown_days_for("BTC", config=config) == 21
    assert cross_down_cooldown_days_for("ETH", config=config) == 10

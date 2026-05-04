from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import add_split_proceeds


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

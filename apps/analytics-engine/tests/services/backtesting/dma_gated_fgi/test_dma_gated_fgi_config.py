"""Tests for DmaGatedFgiConfig with regime/ATH gating."""

import pytest

from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiParams,
)


def test_default_values() -> None:
    cfg = DmaGatedFgiConfig()

    assert cfg.cross_cooldown_days == 30
    assert cfg.cross_on_touch is True


def test_immutability() -> None:
    cfg = DmaGatedFgiConfig()

    with pytest.raises(AttributeError):
        cfg.cross_cooldown_days = 10  # type: ignore[misc]


def test_custom_values() -> None:
    cfg = DmaGatedFgiConfig(
        cross_cooldown_days=7,
        cross_on_touch=False,
    )

    assert cfg.cross_cooldown_days == 7
    assert cfg.cross_on_touch is False


def test_trade_quota_plugin_params_omit_disabled_limits() -> None:
    assert DmaGatedFgiParams().build_trade_quota_plugin_params() == {}


def test_trade_quota_plugin_params_include_enabled_limits() -> None:
    params = DmaGatedFgiParams(
        min_trade_interval_days=2,
        max_trades_7d=3,
        max_trades_30d=9,
    )

    assert params.build_trade_quota_plugin_params() == {
        "min_trade_interval_days": 2,
        "max_trades_7d": 3,
        "max_trades_30d": 9,
    }


def test_dma_params_reject_unknown_public_param() -> None:
    with pytest.raises(ValueError, match="Unsupported dma_gated_fgi params"):
        DmaGatedFgiParams.from_public_params({"unknown": 1})


def test_dma_params_validate_disabled_rule_names() -> None:
    with pytest.raises(ValueError, match="must be an array of rule names"):
        DmaGatedFgiParams.from_public_params({"disabled_rules": "cross_down_exit"})

    with pytest.raises(ValueError, match="contains unsupported rule names"):
        DmaGatedFgiParams.from_public_params({"disabled_rules": ["not_a_rule"]})


def test_dma_params_public_serialization_sorts_disabled_rules() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {"disabled_rules": ["greed_sell_suppression", "cross_down_exit"]}
    )

    assert params.to_public_params()["disabled_rules"] == [
        "cross_down_exit",
        "greed_sell_suppression",
    ]


def test_dma_params_public_serialization_sorts_enabled_portfolio_rules() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {"enabled_rules": ["dma_stable_gating", "cross_down_exit"]}
    )

    assert params.to_public_params()["enabled_rules"] == [
        "cross_down_exit",
        "dma_stable_gating",
    ]

"""Tests for DmaGatedFgiConfig with regime/ATH gating."""

import pytest

from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.strategies.rule_based_portfolio import (
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


def test_trade_quota_limits_default_to_off() -> None:
    params = DmaGatedFgiParams()

    assert params.min_trade_interval_days is None
    assert params.max_trades_7d is None
    assert params.max_trades_30d is None
    assert params.to_public_params() == {
        "overextension_threshold_multiplier_greed": 0.5,
        "overextension_threshold_multiplier_extreme_greed": 0.33,
    }


def test_trade_quota_limits_are_public_params() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {"min_trade_interval_days": 2, "max_trades_7d": 3, "max_trades_30d": 9}
    )

    assert params.to_public_params() == {
        "min_trade_interval_days": 2,
        "max_trades_7d": 3,
        "max_trades_30d": 9,
        "overextension_threshold_multiplier_greed": 0.5,
        "overextension_threshold_multiplier_extreme_greed": 0.33,
    }


@pytest.mark.parametrize(
    "removed",
    [
        "cross_cooldown_days",
        "cross_on_touch",
        "pacing_k",
        "pacing_r_max",
        "buy_sideways_window_days",
        "buy_sideways_max_range",
        "buy_leg_caps",
        "dma_overextension_threshold",
        "fgi_slope_reversal_threshold",
        "fgi_slope_recovery_threshold",
    ],
)
def test_parameters_that_never_changed_a_decision_are_rejected(removed: str) -> None:
    with pytest.raises(ValueError, match="Unsupported dma_gated_fgi params"):
        DmaGatedFgiParams.from_public_params({removed: 1})


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
        {"disabled_rules": ["spy_latch", "cross_down_exit"]}
    )

    assert params.to_public_params()["disabled_rules"] == [
        "cross_down_exit",
        "spy_latch",
    ]


def test_dma_params_public_serialization_sorts_enabled_portfolio_rules() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {"enabled_rules": ["spy_latch", "cross_down_exit"]}
    )

    assert params.to_public_params()["enabled_rules"] == [
        "cross_down_exit",
        "spy_latch",
    ]

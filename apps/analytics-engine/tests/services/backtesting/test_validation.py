"""Validation tests for DMA-first backtesting request models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.backtesting import (
    Allocation,
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
)


def _dma_public_params(**overrides: object) -> dict[str, object]:
    params: dict[str, object] = {
        "signal": {
            "cross_cooldown_days": 30,
            "cross_on_touch": True,
        },
        "pacing": {
            "k": 5.0,
            "r_max": 1.0,
        },
        "buy_gate": {
            "window_days": 5,
            "sideways_max_range": 0.04,
            "leg_caps": [0.05, 0.10, 0.20],
        },
        "trade_quota": {
            "min_trade_interval_days": None,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
    }
    params.update(overrides)
    return params


def _eth_public_params(**overrides: object) -> dict[str, object]:
    params = _dma_public_params(
        signal={
            "cross_cooldown_days": 30,
            "cross_on_touch": True,
            "ratio_cross_cooldown_days": 30,
            "rotation_neutral_band": 0.05,
            "rotation_max_deviation": 0.20,
        },
        rotation={
            "drift_threshold": 0.03,
            "cooldown_days": 7,
        },
    )
    params.update(overrides)
    return params


# ---------------------------------------------------------------------------
# BacktestCompareConfigV3 saved_config_id branch coverage (lines 166, 168, 173)
# ---------------------------------------------------------------------------


def test_compare_config_rejects_saved_config_id_combined_with_strategy_id() -> None:
    """Line 166: saved_config_id cannot be combined with strategy_id."""
    with pytest.raises(
        ValidationError, match="saved_config_id cannot be combined with strategy_id"
    ):
        BacktestCompareConfigV3(
            config_id="combo",
            saved_config_id="dma_gated_fgi_default",
            strategy_id="dca_classic",
        )


def test_compare_config_rejects_saved_config_id_combined_with_params() -> None:
    """Line 168: saved_config_id cannot be combined with inline params."""
    with pytest.raises(
        ValidationError, match="saved_config_id cannot be combined with inline params"
    ):
        BacktestCompareConfigV3(
            config_id="combo_params",
            saved_config_id="dma_gated_fgi_default",
            params=_dma_public_params(),
        )


def test_compare_config_rejects_missing_both_saved_config_id_and_strategy_id() -> None:
    """Line 173: must provide either saved_config_id or strategy_id."""
    with pytest.raises(
        ValidationError,
        match="compare config must provide either saved_config_id or strategy_id",
    ):
        BacktestCompareConfigV3(config_id="no_strategy")


def test_allocation_rejects_invalid_sum() -> None:
    with pytest.raises(ValidationError, match="allocation must sum to 1.0"):
        Allocation(spot=0.6, stable=0.3)


def test_compare_config_rejects_dca_params() -> None:
    with pytest.raises(ValidationError, match="dca_classic does not accept params"):
        BacktestCompareConfigV3(
            config_id="dca_with_params",
            strategy_id="dca_classic",
            params=_dma_public_params(),
        )


def test_compare_config_rejects_legacy_simple_regime_params() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="legacy",
            strategy_id="dma_gated_fgi",
            params={"pacing_policy": "fgi_exponential"},
        )


def test_compare_config_rejects_unknown_dma_param() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="bad_param",
            strategy_id="dma_gated_fgi",
            params={"signal_id": "mayer"},
        )


def test_compare_request_requires_unique_config_ids() -> None:
    with pytest.raises(ValidationError, match="config_id values must be unique"):
        BacktestCompareRequestV3(
            token_symbol="BTC",
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dup", strategy_id="dca_classic", params={}
                ),
                BacktestCompareConfigV3(
                    config_id="dup", strategy_id="dca_classic", params={}
                ),
            ],
        )


def test_compare_config_rejects_invalid_scalar_types() -> None:
    with pytest.raises(ValidationError, match="Input should be a valid integer"):
        BacktestCompareConfigV3(
            config_id="bad_scalar",
            strategy_id="dma_gated_fgi",
            params={"signal": {"cross_cooldown_days": True}},
        )


def test_compare_config_rejects_invalid_array_types() -> None:
    with pytest.raises(ValidationError, match="Input should be a valid list"):
        BacktestCompareConfigV3(
            config_id="bad_array",
            strategy_id="dma_gated_fgi",
            params={"buy_gate": {"leg_caps": 123}},
        )


def test_compare_config_rejects_flat_dma_params() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="dma_flat",
            strategy_id="dma_gated_fgi",
            params={
                "cross_cooldown_days": 30,
                "cross_on_touch": True,
                "pacing_k": 5.0,
                "pacing_r_max": 1.0,
                "buy_sideways_window_days": 5,
                "buy_sideways_max_range": 0.04,
                "buy_leg_caps": [0.05, 0.10, 0.20],
                "dma_overextension_threshold": 0.3,
                "fgi_slope_reversal_threshold": -0.05,
            },
        )


def test_compare_config_accepts_nested_dma_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="dma_nested",
        strategy_id="dma_gated_fgi",
        params=_dma_public_params(),
    )
    assert config.params["cross_cooldown_days"] == 30
    assert config.params["buy_leg_caps"] == [0.05, 0.10, 0.20]


def test_compare_config_accepts_trade_quota_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="dma_quota",
        strategy_id="dma_gated_fgi",
        params=_dma_public_params(
            trade_quota={
                "min_trade_interval_days": 3,
                "max_trades_7d": 2,
                "max_trades_30d": 8,
            }
        ),
    )

    assert config.params["min_trade_interval_days"] == 3
    assert config.params["max_trades_7d"] == 2
    assert config.params["max_trades_30d"] == 8


def test_compare_config_rejects_unknown_eth_btc_rotation_params() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="eth_rotation_bad",
            strategy_id="eth_btc_rotation",
            params={"foo": "bar"},
        )


def test_compare_config_accepts_eth_btc_rotation_empty_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="eth_rotation_ok",
        strategy_id="eth_btc_rotation",
        params={},
    )
    assert config.params["cross_cooldown_days"] == 30
    assert config.params["ratio_cross_cooldown_days"] == 30
    assert config.params["buy_leg_caps"] == [0.05, 0.1, 0.2]


def test_compare_config_accepts_eth_btc_rotation_nested_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="eth_rotation_dma",
        strategy_id="eth_btc_rotation",
        params=_eth_public_params(
            signal={
                "cross_cooldown_days": 12,
                "cross_on_touch": False,
                "ratio_cross_cooldown_days": 9,
                "rotation_neutral_band": 0.05,
                "rotation_max_deviation": 0.20,
            },
            pacing={
                "k": 4.0,
                "r_max": 1.2,
            },
            buy_gate={
                "window_days": 7,
                "sideways_max_range": 0.03,
                "leg_caps": [0.04, 0.08],
            },
        ),
    )
    assert config.params["cross_cooldown_days"] == 12
    assert config.params["ratio_cross_cooldown_days"] == 9
    assert config.params["buy_leg_caps"] == [0.04, 0.08]


def test_compare_request_rejects_invalid_date_range() -> None:
    with pytest.raises(ValidationError, match="start_date must be before end_date"):
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date="2025-01-03",
            end_date="2025-01-01",
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dca_classic",
                    strategy_id="dca_classic",
                    params={},
                )
            ],
        )


def test_compare_request_requires_non_empty_configs() -> None:
    with pytest.raises(
        ValidationError, match="configs must contain at least one config"
    ):
        BacktestCompareRequestV3(
            token_symbol="BTC",
            total_capital=10_000.0,
            configs=[],
        )


def test_compare_request_accepts_dma_and_baseline_configs() -> None:
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="dca_classic", strategy_id="dca_classic", params={}
            ),
            BacktestCompareConfigV3(
                config_id="dma_gated_fgi_default",
                strategy_id="dma_gated_fgi",
                params=_dma_public_params(),
            ),
        ],
    )
    assert len(request.configs) == 2

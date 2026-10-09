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
        "top_escape": {
            "overextension_threshold_multiplier_greed": 0.5,
            "overextension_threshold_multiplier_extreme_greed": 0.33,
        },
        "trade_quota": {
            "min_trade_interval_days": None,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
    }
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
            saved_config_id="dma_fgi_portfolio_rules_default",
            strategy_id="dma_fgi_portfolio_rules",
        )


def test_compare_config_rejects_saved_config_id_combined_with_params() -> None:
    """Line 168: saved_config_id cannot be combined with inline params."""
    with pytest.raises(
        ValidationError, match="saved_config_id cannot be combined with inline params"
    ):
        BacktestCompareConfigV3(
            config_id="combo_params",
            saved_config_id="dma_fgi_portfolio_rules_default",
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


def test_compare_config_rejects_unknown_strategy_id() -> None:
    with pytest.raises(ValidationError, match="Unknown strategy_id 'unknown_strategy'"):
        BacktestCompareConfigV3(
            config_id="unknown_with_params",
            strategy_id="unknown_strategy",
            params=_dma_public_params(),
        )


def test_compare_config_rejects_legacy_simple_regime_params() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="legacy",
            strategy_id="dma_fgi_portfolio_rules",
            params={"pacing_policy": "fgi_exponential"},
        )


def test_compare_config_rejects_unknown_dma_param() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="bad_param",
            strategy_id="dma_fgi_portfolio_rules",
            params={"signal_id": "mayer"},
        )


def test_compare_request_requires_unique_config_ids() -> None:
    with pytest.raises(ValidationError, match="config_id values must be unique"):
        BacktestCompareRequestV3(
            token_symbol="BTC",
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dup", strategy_id="dma_fgi_portfolio_rules", params={}
                ),
                BacktestCompareConfigV3(
                    config_id="dup", strategy_id="dma_fgi_portfolio_rules", params={}
                ),
            ],
        )


def test_compare_config_rejects_invalid_scalar_types() -> None:
    with pytest.raises(ValidationError, match="Input should be a valid integer"):
        BacktestCompareConfigV3(
            config_id="bad_scalar",
            strategy_id="dma_fgi_portfolio_rules",
            params={"trade_quota": {"max_trades_7d": True}},
        )


def test_compare_config_rejects_invalid_array_types() -> None:
    with pytest.raises(ValidationError, match="Input should be a valid list"):
        BacktestCompareConfigV3(
            config_id="bad_array",
            strategy_id="dma_fgi_portfolio_rules",
            params={"disabled_rules": 123},
        )


@pytest.mark.parametrize(
    "removed",
    [
        {"signal": {"cross_cooldown_days": 30}},
        {"signal": {"cross_on_touch": False}},
        {"pacing": {"k": 5.0}},
        {"buy_gate": {"window_days": 5}},
        {"top_escape": {"dma_overextension_threshold": 0.3}},
        {"top_escape": {"fgi_slope_reversal_threshold": -0.05}},
        {"top_escape": {"fgi_slope_recovery_threshold": 0.05}},
    ],
)
def test_compare_config_rejects_parameters_that_never_changed_a_decision(
    removed: dict[str, object],
) -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="removed_param",
            strategy_id="dma_fgi_portfolio_rules",
            params=removed,
        )


def test_compare_config_rejects_flat_dma_params() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="dma_flat",
            strategy_id="dma_fgi_portfolio_rules",
            params={
                "min_trade_interval_days": 3,
                "max_trades_7d": 2,
                "overextension_threshold_multiplier_greed": 0.5,
            },
        )


def test_compare_config_accepts_nested_dma_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="dma_nested",
        strategy_id="dma_fgi_portfolio_rules",
        params=_dma_public_params(),
    )
    assert config.params["overextension_threshold_multiplier_greed"] == 0.5
    assert config.params["overextension_threshold_multiplier_extreme_greed"] == 0.33
    assert "cross_cooldown_days" not in config.params
    assert "buy_leg_caps" not in config.params


def test_compare_config_accepts_trade_quota_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="dma_quota",
        strategy_id="dma_fgi_portfolio_rules",
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


def test_compare_config_rejects_unknown_dma_fgi_portfolio_rules_params() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        BacktestCompareConfigV3(
            config_id="portfolio_rules_bad",
            strategy_id="dma_fgi_portfolio_rules",
            params={"foo": "bar"},
        )


def test_compare_config_accepts_dma_fgi_portfolio_rules_empty_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="portfolio_rules_ok",
        strategy_id="dma_fgi_portfolio_rules",
        params={},
    )
    assert config.params == {
        "overextension_threshold_multiplier_greed": 0.5,
        "overextension_threshold_multiplier_extreme_greed": 0.33,
    }


def test_compare_config_accepts_dma_fgi_portfolio_rules_nested_params() -> None:
    config = BacktestCompareConfigV3(
        config_id="portfolio_rules_custom",
        strategy_id="dma_fgi_portfolio_rules",
        params=_dma_public_params(
            top_escape={
                "overextension_threshold_multiplier_greed": 0.4,
                "overextension_threshold_multiplier_extreme_greed": 0.2,
            },
            disabled_rules=["fgi_downshift_dca_sell"],
        ),
    )
    assert config.params["overextension_threshold_multiplier_greed"] == 0.4
    assert config.params["overextension_threshold_multiplier_extreme_greed"] == 0.2
    assert config.params["disabled_rules"] == ["fgi_downshift_dca_sell"]


def test_compare_request_rejects_invalid_date_range() -> None:
    with pytest.raises(ValidationError, match="start_date must be before end_date"):
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date="2025-01-03",
            end_date="2025-01-01",
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="portfolio_rules",
                    strategy_id="dma_fgi_portfolio_rules",
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


def test_compare_request_accepts_multiple_portfolio_rules_configs() -> None:
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="portfolio_rules_default",
                strategy_id="dma_fgi_portfolio_rules",
                params={},
            ),
            BacktestCompareConfigV3(
                config_id="portfolio_rules_runtime",
                strategy_id="dma_fgi_portfolio_rules",
                params=_dma_public_params(),
            ),
        ],
    )
    assert len(request.configs) == 2

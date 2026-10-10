"""Validation tests for DMA-first backtesting request models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.backtesting import (
    Allocation,
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
)

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
            params={"anything": 1},
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
            params={"anything": 1},
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


@pytest.mark.parametrize("strategy_id", ["dma_fgi_portfolio_rules", "dca_classic"])
@pytest.mark.parametrize(
    "params",
    [
        {"anything": 1},
        {"trade_quota": {"max_trades_7d": 2}},
        {"top_escape": {"overextension_threshold_multiplier_greed": 0.4}},
        {"disabled_rules": ["fgi_downshift_dca_sell"]},
        {"enabled_rules": ["cross_down_exit"]},
        {"min_trade_interval_days": 3},
    ],
    ids=["unknown", "trade-quota", "greed", "disabled", "enabled", "flat"],
)
def test_a_strategy_takes_no_params(
    strategy_id: str, params: dict[str, object]
) -> None:
    """What a strategy does is stated by its spec, so there is nothing to tune."""
    with pytest.raises(ValidationError, match=f"{strategy_id} does not accept params"):
        BacktestCompareConfigV3(
            config_id="with_params", strategy_id=strategy_id, params=params
        )


@pytest.mark.parametrize("strategy_id", ["dma_fgi_portfolio_rules", "dca_classic"])
def test_a_strategy_accepts_empty_or_omitted_params(strategy_id: str) -> None:
    given = BacktestCompareConfigV3(
        config_id="empty", strategy_id=strategy_id, params={}
    )
    omitted = BacktestCompareConfigV3(config_id="omitted", strategy_id=strategy_id)

    assert given.params == {} and omitted.params == {}


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
                params={},
            ),
        ],
    )
    assert len(request.configs) == 2

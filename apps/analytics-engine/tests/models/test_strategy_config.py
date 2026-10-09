"""Tests for DMA-first strategy configuration models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.strategy_config import (
    BacktestDefaults,
    SavedStrategyConfig,
    StrategyComponentRef,
    StrategyComposition,
    StrategyConfigsResponse,
    StrategyPreset,
)


def test_backtest_defaults_use_dma_first_defaults() -> None:
    defaults = BacktestDefaults()
    assert defaults.days == 500
    assert defaults.total_capital == 10000


def test_strategy_preset_accepts_any_strategy_id() -> None:
    preset = StrategyPreset(
        config_id="dma_fgi_portfolio_rules_default",
        display_name="DMA/FGI Portfolio Rules Default",
        strategy_id="dma_fgi_portfolio_rules",
        params={"top_escape": {"overextension_threshold_multiplier_greed": 0.4}},
        is_default=True,
    )
    assert preset.strategy_id == "dma_fgi_portfolio_rules"
    assert (
        preset.params["top_escape"]["overextension_threshold_multiplier_greed"] == 0.4
    )

    # strategy_id is str — any valid string is accepted
    preset2 = StrategyPreset(
        config_id="legacy_simple_regime",
        display_name="Legacy",
        strategy_id="simple_regime",
    )
    assert preset2.strategy_id == "simple_regime"


def test_strategy_preset_validates_config_id() -> None:
    with pytest.raises(ValidationError):
        StrategyPreset(
            config_id="invalid config id",
            display_name="Bad",
            strategy_id="dma_fgi_portfolio_rules",
        )


def test_strategy_configs_response_round_trips() -> None:
    response = StrategyConfigsResponse(
        strategies=[
            {
                "strategy_id": "dma_fgi_portfolio_rules",
                "display_name": "DMA/FGI Portfolio Rules",
                "description": "ETH/BTC relative-strength rotation",
                "param_schema": {"type": "object"},
                "default_params": {"trade_quota": {"max_trades_7d": 3}},
                "supports_daily_suggestion": True,
            }
        ],
        presets=[
            StrategyPreset(
                config_id="dma_fgi_portfolio_rules_default",
                display_name="DMA/FGI Portfolio Rules Default",
                strategy_id="dma_fgi_portfolio_rules",
                params={"trade_quota": {"max_trades_7d": 3}},
                is_default=True,
            )
        ],
        backtest_defaults=BacktestDefaults(days=365, total_capital=25000.0),
    )

    restored = StrategyConfigsResponse.model_validate(response.model_dump())
    assert restored.strategies[0].strategy_id == "dma_fgi_portfolio_rules"
    assert restored.presets[0].config_id == "dma_fgi_portfolio_rules_default"
    assert restored.backtest_defaults.days == 365
    assert restored.backtest_defaults.total_capital == 25000.0


def test_removed_parameters_are_rejected_by_the_saved_config_contract() -> None:
    for removed in (
        {"signal": {"cross_cooldown_days": 12}},
        {"pacing": {"k": 1.0}},
        {"buy_gate": {"window_days": 3}},
        {"top_escape": {"dma_overextension_threshold": 0.3}},
    ):
        with pytest.raises(ValidationError):
            StrategyPreset(
                config_id="dma_fgi_portfolio_rules_default",
                display_name="Default",
                strategy_id="dma_fgi_portfolio_rules",
                params=removed,
            )


# ---------------------------------------------------------------------------
# StrategyComposition validation (line 67)
# ---------------------------------------------------------------------------


def test_strategy_composition_rejects_benchmark_with_signal() -> None:
    """Line 67: benchmark composition must not declare signal/policy/pacing/execution."""
    with pytest.raises(
        ValidationError,
        match="benchmark composition must not declare signal/policy/pacing/execution components",
    ):
        StrategyComposition(
            kind="benchmark",
            bucket_mapper_id="two_bucket_spot_stable",
            signal=StrategyComponentRef(component_id="dma_gated_fgi_signal"),
        )


# ---------------------------------------------------------------------------
# SavedStrategyConfig validation (line 93)
# ---------------------------------------------------------------------------


def test_saved_strategy_config_rejects_both_default_and_benchmark() -> None:
    """Line 93: saved config cannot be both default and benchmark."""
    with pytest.raises(
        ValidationError,
        match="saved config cannot be both default and benchmark",
    ):
        SavedStrategyConfig(
            config_id="both_flags",
            display_name="Both Flags",
            strategy_id="legacy_benchmark",
            composition=StrategyComposition(
                kind="benchmark",
                bucket_mapper_id="two_bucket_spot_stable",
            ),
            is_default=True,
            is_benchmark=True,
        )

"""Tests for DMA-first strategy configuration models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.strategy_config import (
    BacktestDefaults,
    SavedStrategyConfig,
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
        spec_ref="reference/dma_fgi",
        is_default=True,
    )
    assert preset.strategy_id == "dma_fgi_portfolio_rules"
    assert preset.spec_ref == "reference/dma_fgi"

    # strategy_id is str: any valid string is accepted, and a benchmark runs no spec.
    preset2 = StrategyPreset(
        config_id="legacy_simple_regime",
        display_name="Legacy",
        strategy_id="simple_regime",
    )
    assert preset2.strategy_id == "simple_regime"
    assert preset2.spec_ref is None


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
                "default_params": {},
                "supports_daily_suggestion": True,
            }
        ],
        presets=[
            StrategyPreset(
                config_id="dma_fgi_portfolio_rules_default",
                display_name="DMA/FGI Portfolio Rules Default",
                strategy_id="dma_fgi_portfolio_rules",
                spec_ref="reference/dma_fgi",
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


def test_a_config_names_a_spec_instead_of_taking_params() -> None:
    for model in (StrategyPreset, SavedStrategyConfig):
        with pytest.raises(ValidationError, match="params"):
            model(
                config_id="dma_fgi_portfolio_rules_default",
                display_name="Default",
                strategy_id="dma_fgi_portfolio_rules",
                params={"trade_quota": {"max_trades_7d": 3}},
            )


def test_a_saved_config_projects_its_spec_into_the_public_preset() -> None:
    saved = SavedStrategyConfig(
        config_id="dma_fgi_portfolio_rules_default",
        display_name="Default",
        strategy_id="dma_fgi_portfolio_rules",
        spec_ref="reference/dma_fgi",
        is_default=True,
    )

    preset = saved.to_public_preset()

    assert preset.spec_ref == "reference/dma_fgi"
    assert "params" not in preset.model_dump()


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
            strategy_id="dca_classic",
            is_default=True,
            is_benchmark=True,
        )

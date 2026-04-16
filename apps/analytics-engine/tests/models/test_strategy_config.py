"""Tests for DMA-first strategy configuration models."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.strategy_config import (
    BacktestDefaults,
    CreateSavedStrategyConfigRequest,
    SavedStrategyConfig,
    SavedStrategyConfigListResponse,
    SavedStrategyConfigResponse,
    StrategyComponentRef,
    StrategyComposition,
    StrategyConfigsResponse,
    StrategyPreset,
    UpdateSavedStrategyConfigRequest,
)


def test_backtest_defaults_use_dma_first_defaults() -> None:
    defaults = BacktestDefaults()
    assert defaults.days == 500
    assert defaults.total_capital == 10000


def test_strategy_preset_accepts_any_strategy_id() -> None:
    preset = StrategyPreset(
        config_id="dma_gated_fgi_default",
        display_name="DMA Gated FGI Default",
        strategy_id="dma_gated_fgi",
        params={"signal": {"cross_cooldown_days": 30}},
        is_default=True,
    )
    assert preset.strategy_id == "dma_gated_fgi"
    assert preset.params["signal"]["cross_cooldown_days"] == 30

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
            strategy_id="dca_classic",
        )


def test_strategy_configs_response_round_trips() -> None:
    response = StrategyConfigsResponse(
        strategies=[
            {
                "strategy_id": "dma_gated_fgi",
                "display_name": "DMA Gated FGI",
                "description": "DMA-first strategy",
                "param_schema": {"type": "object"},
                "default_params": {"signal": {"cross_cooldown_days": 30}},
                "supports_daily_suggestion": True,
            }
        ],
        presets=[
            StrategyPreset(
                config_id="dma_gated_fgi_default",
                display_name="DMA Gated FGI Default",
                strategy_id="dma_gated_fgi",
                params={"signal": {"cross_cooldown_days": 30}},
                is_default=True,
            )
        ],
        backtest_defaults=BacktestDefaults(days=365, total_capital=25000.0),
    )

    restored = StrategyConfigsResponse.model_validate(response.model_dump())
    assert restored.strategies[0].strategy_id == "dma_gated_fgi"
    assert restored.presets[0].config_id == "dma_gated_fgi_default"
    assert restored.backtest_defaults.days == 365
    assert restored.backtest_defaults.total_capital == 25000.0


def test_saved_strategy_config_admin_requests_validate_full_composition() -> None:
    request = CreateSavedStrategyConfigRequest(
        config_id="dma_custom",
        display_name="DMA Custom",
        strategy_id="dma_gated_fgi",
        primary_asset="btc",
        params={"signal": {"cross_cooldown_days": 12}},
        composition=StrategyComposition(
            kind="composed",
            bucket_mapper_id="two_bucket_spot_stable",
            signal=StrategyComponentRef(component_id="dma_gated_fgi_signal"),
            decision_policy=StrategyComponentRef(component_id="dma_fgi_policy"),
            pacing_policy=StrategyComponentRef(component_id="fgi_exponential"),
            execution_profile=StrategyComponentRef(component_id="two_bucket_rebalance"),
        ),
        supports_daily_suggestion=True,
    )

    assert request.primary_asset == "BTC"
    assert request.composition.signal is not None
    assert request.params["signal"]["cross_cooldown_days"] == 12

    update = UpdateSavedStrategyConfigRequest.model_validate(
        request.model_dump(exclude={"config_id"})
    )
    assert update.strategy_id == "dma_gated_fgi"


def test_saved_strategy_config_admin_responses_round_trip() -> None:
    config = CreateSavedStrategyConfigRequest(
        config_id="dma_custom",
        display_name="DMA Custom",
        strategy_id="dma_gated_fgi",
        primary_asset="BTC",
        composition=StrategyComposition(
            kind="composed",
            bucket_mapper_id="two_bucket_spot_stable",
            signal=StrategyComponentRef(component_id="dma_gated_fgi_signal"),
            decision_policy=StrategyComponentRef(component_id="dma_fgi_policy"),
            pacing_policy=StrategyComponentRef(component_id="fgi_exponential"),
            execution_profile=StrategyComponentRef(component_id="two_bucket_rebalance"),
        ),
    )

    response = SavedStrategyConfigResponse(
        config={
            **config.model_dump(),
            "is_default": False,
            "is_benchmark": False,
        }
    )
    list_response = SavedStrategyConfigListResponse(configs=[response.config])

    assert list_response.configs[0].config_id == "dma_custom"


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
            strategy_id="dca_classic",
            composition=StrategyComposition(
                kind="benchmark",
                bucket_mapper_id="two_bucket_spot_stable",
            ),
            is_default=True,
            is_benchmark=True,
        )

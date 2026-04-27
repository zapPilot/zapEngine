"""Tests for DMA-first preset configuration."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from src.config.strategy_presets import (
    DMA_DEFAULT_CONFIG_ID,
    ETH_BTC_ROTATION_CONFIG_ID,
    SPY_ETH_BTC_ROTATION_CONFIG_ID,
    STRATEGY_PRESETS,
    STRATEGY_TUNING_OVERRIDES,
    get_backtest_defaults,
    get_benchmark_seed_strategy_config,
    get_benchmark_strategy_preset,
    get_default_seed_strategy_config,
    get_default_strategy_preset,
    list_strategy_presets,
    resolve_seed_strategy_config,
    resolve_strategy_default_params,
    resolve_strategy_preset,
)
from src.services.backtesting.constants import (
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_ROTATION,
)


def test_list_strategy_presets_returns_live_non_benchmark_presets() -> None:
    presets = list_strategy_presets()
    assert [preset.config_id for preset in presets] == [
        DMA_DEFAULT_CONFIG_ID,
        ETH_BTC_ROTATION_CONFIG_ID,
        SPY_ETH_BTC_ROTATION_CONFIG_ID,
    ]
    assert {preset.strategy_id for preset in presets} == {
        "dma_gated_fgi",
        "eth_btc_rotation",
        "spy_eth_btc_rotation",
    }
    assert (
        presets[1].params["signal"]["cross_cooldown_days"]
        == presets[0].params["signal"]["cross_cooldown_days"]
    )


def test_default_and_benchmark_presets_are_distinct() -> None:
    default = get_default_strategy_preset()
    benchmark = get_benchmark_strategy_preset()
    assert default.config_id == ETH_BTC_ROTATION_CONFIG_ID
    assert default.strategy_id == "eth_btc_rotation"
    assert benchmark.config_id == "dca_classic"
    assert benchmark.strategy_id == "dca_classic"


def test_resolve_strategy_preset_supports_default_and_explicit_ids() -> None:
    assert resolve_strategy_preset(None).config_id == ETH_BTC_ROTATION_CONFIG_ID
    assert resolve_strategy_preset("").config_id == ETH_BTC_ROTATION_CONFIG_ID
    assert resolve_strategy_preset("dca_classic").strategy_id == "dca_classic"
    assert resolve_strategy_preset(DMA_DEFAULT_CONFIG_ID).strategy_id == "dma_gated_fgi"


def test_resolve_strategy_preset_rejects_unknown_id() -> None:
    with pytest.raises(ValueError, match="Unknown config_id"):
        resolve_strategy_preset("optimized_default")


def test_backtest_defaults_match_public_contract() -> None:
    defaults = get_backtest_defaults()
    assert defaults.days == 500
    assert defaults.total_capital == 10000


def test_curated_presets_have_single_default_and_single_benchmark() -> None:
    defaults = [preset for preset in STRATEGY_PRESETS if preset.is_default]
    benchmarks = [preset for preset in STRATEGY_PRESETS if preset.is_benchmark]
    assert len(defaults) == 1
    assert len(benchmarks) == 1


def test_seed_live_configs_expose_nested_tuned_params() -> None:
    dma_config = resolve_seed_strategy_config(DMA_DEFAULT_CONFIG_ID)
    eth_config = resolve_seed_strategy_config(ETH_BTC_ROTATION_CONFIG_ID)

    assert dma_config.params == resolve_strategy_default_params(STRATEGY_DMA_GATED_FGI)
    assert eth_config.params == resolve_strategy_default_params(
        STRATEGY_ETH_BTC_ROTATION
    )
    assert isinstance(dma_config.params["signal"], dict)
    assert isinstance(eth_config.params["rotation"], dict)


def test_seed_live_configs_attach_trade_quota_plugin() -> None:
    dma_config = resolve_seed_strategy_config(DMA_DEFAULT_CONFIG_ID)
    eth_config = resolve_seed_strategy_config(ETH_BTC_ROTATION_CONFIG_ID)

    assert [plugin.component_id for plugin in dma_config.composition.plugins] == [
        "dma_buy_gate",
        "trade_quota_guard",
    ]
    assert [plugin.component_id for plugin in eth_config.composition.plugins] == [
        "dma_buy_gate",
        "trade_quota_guard",
    ]
    for config in (dma_config, eth_config):
        expected_quota_params = {
            key: value
            for key, value in config.params["trade_quota"].items()
            if value is not None
        }
        assert config.composition.plugins[1].params == expected_quota_params


def test_resolve_strategy_default_params_applies_nested_tuning_overrides() -> None:
    with patch.dict(
        STRATEGY_TUNING_OVERRIDES,
        {
            STRATEGY_DMA_GATED_FGI: {"trade_quota": {"min_trade_interval_days": 4}},
            STRATEGY_ETH_BTC_ROTATION: {
                "trade_quota": {"min_trade_interval_days": 2},
                "rotation": {"cooldown_days": 9},
            },
        },
    ):
        dma_params = resolve_strategy_default_params(STRATEGY_DMA_GATED_FGI)
        eth_params = resolve_strategy_default_params(STRATEGY_ETH_BTC_ROTATION)

    assert dma_params["signal"]["cross_cooldown_days"] == 30
    assert dma_params["trade_quota"]["min_trade_interval_days"] == 4
    assert eth_params["trade_quota"]["min_trade_interval_days"] == 2
    assert eth_params["rotation"]["cooldown_days"] == 9


def test_resolve_strategy_default_params_rejects_unsupported_tuning_keys() -> None:
    with patch.dict(
        STRATEGY_TUNING_OVERRIDES,
        {STRATEGY_DMA_GATED_FGI: {"unsupported_group": {"value": 1}}},
    ):
        with pytest.raises(ValueError, match="Extra inputs are not permitted"):
            resolve_strategy_default_params(STRATEGY_DMA_GATED_FGI)


def test_get_default_seed_strategy_config_raises_when_no_default() -> None:
    """Line 135: get_default_seed_strategy_config raises ValueError when no default."""
    non_default_configs = [
        c.model_copy(update={"is_default": False}) for c in STRATEGY_PRESETS
    ]
    with patch(
        "src.config.strategy_presets.SEED_STRATEGY_CONFIGS", non_default_configs
    ):
        with pytest.raises(ValueError, match="No default strategy config configured"):
            get_default_seed_strategy_config()


def test_get_benchmark_seed_strategy_config_raises_when_no_benchmark() -> None:
    """Line 142: get_benchmark_seed_strategy_config raises ValueError when no benchmark."""
    non_benchmark_configs = [
        c.model_copy(update={"is_benchmark": False}) for c in STRATEGY_PRESETS
    ]
    with patch(
        "src.config.strategy_presets.SEED_STRATEGY_CONFIGS", non_benchmark_configs
    ):
        with pytest.raises(ValueError, match="No benchmark strategy config configured"):
            get_benchmark_seed_strategy_config()

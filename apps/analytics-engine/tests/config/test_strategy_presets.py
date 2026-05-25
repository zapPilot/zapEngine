"""Tests for DMA-first preset configuration."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from src.config.strategy_presets import (
    DMA_FGI_PORTFOLIO_RULES_CONFIG_ID,
    STRATEGY_PRESETS,
    STRATEGY_TUNING_OVERRIDES,
    _get_params_model,
    get_backtest_defaults,
    get_benchmark_seed_strategy_config,
    get_default_seed_strategy_config,
    get_default_strategy_preset,
    list_strategy_presets,
    resolve_seed_strategy_config,
    resolve_strategy_default_params,
    resolve_strategy_default_runtime_params,
    resolve_strategy_preset,
)
from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES


def test_list_strategy_presets_returns_live_non_benchmark_presets() -> None:
    presets = list_strategy_presets()
    assert [preset.config_id for preset in presets] == [
        DMA_FGI_PORTFOLIO_RULES_CONFIG_ID,
        "fixed_interval_balanced_30d",
        "fixed_interval_conservative_30d",
        "fixed_interval_aggressive_90d",
    ]
    assert presets[0].strategy_id == "dma_fgi_portfolio_rules"
    assert presets[0].params["signal"]["cross_cooldown_days"] == 30
    assert all(
        preset.strategy_id == "fixed_interval_rebalance" for preset in presets[1:]
    )


def test_default_preset_is_dma_fgi_portfolio_rules() -> None:
    default = get_default_strategy_preset()
    assert default.config_id == DMA_FGI_PORTFOLIO_RULES_CONFIG_ID
    assert default.strategy_id == "dma_fgi_portfolio_rules"


def test_resolve_strategy_preset_supports_default_and_explicit_ids() -> None:
    assert resolve_strategy_preset(None).config_id == DMA_FGI_PORTFOLIO_RULES_CONFIG_ID
    assert resolve_strategy_preset("").config_id == DMA_FGI_PORTFOLIO_RULES_CONFIG_ID
    assert (
        resolve_strategy_preset(DMA_FGI_PORTFOLIO_RULES_CONFIG_ID).strategy_id
        == "dma_fgi_portfolio_rules"
    )


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


def test_seed_live_configs_expose_nested_params() -> None:
    config = resolve_seed_strategy_config(DMA_FGI_PORTFOLIO_RULES_CONFIG_ID)

    assert config.params == resolve_strategy_default_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES
    )
    assert isinstance(config.params["signal"], dict)


def test_seed_live_configs_attach_rule_based_composition_refs() -> None:
    config = resolve_seed_strategy_config(DMA_FGI_PORTFOLIO_RULES_CONFIG_ID)

    assert config.composition.signal is not None
    assert config.composition.signal.component_id == "dma_fgi_portfolio_rules_signal"
    assert config.composition.decision_policy is not None
    assert (
        config.composition.decision_policy.component_id
        == "dma_fgi_portfolio_rules_policy"
    )
    assert config.composition.bucket_mapper_id == "spy_eth_btc_stable"
    assert config.composition.plugins == []


def test_resolve_strategy_default_params_applies_nested_tuning_overrides() -> None:
    with patch.dict(
        STRATEGY_TUNING_OVERRIDES,
        {
            STRATEGY_DMA_FGI_PORTFOLIO_RULES: {
                "trade_quota": {"min_trade_interval_days": 2},
            },
        },
    ):
        params = resolve_strategy_default_params(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    assert params["trade_quota"]["min_trade_interval_days"] == 2


def test_resolve_strategy_default_params_rejects_unsupported_tuning_keys() -> None:
    with patch.dict(
        STRATEGY_TUNING_OVERRIDES,
        {STRATEGY_DMA_FGI_PORTFOLIO_RULES: {"unsupported_group": {"value": 1}}},
    ):
        with pytest.raises(ValueError, match="Extra inputs are not permitted"):
            resolve_strategy_default_params(STRATEGY_DMA_FGI_PORTFOLIO_RULES)


def test_get_params_model_rejects_unknown_strategy_id() -> None:
    with pytest.raises(ValueError, match="does not define preset params"):
        _get_params_model("unknown_strategy")


def test_resolve_strategy_default_runtime_params_returns_flat_contract() -> None:
    params = resolve_strategy_default_runtime_params(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    assert "cross_cooldown_days" in params
    assert "signal" not in params


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


def test_seed_strategy_config_invariants_reject_duplicate_default_or_benchmark() -> (
    None
):
    duplicate_defaults = [
        c.model_copy(update={"is_default": True, "is_benchmark": False})
        for c in STRATEGY_PRESETS
    ]
    with patch(
        "src.config.strategy_presets.SEED_STRATEGY_CONFIGS",
        duplicate_defaults,
    ):
        with pytest.raises(ValueError, match="multiple defaults"):
            resolve_seed_strategy_config(None)

    duplicate_benchmarks = [
        c.model_copy(update={"is_default": False, "is_benchmark": True})
        for c in STRATEGY_PRESETS
    ]
    with patch(
        "src.config.strategy_presets.SEED_STRATEGY_CONFIGS",
        duplicate_benchmarks,
    ):
        with pytest.raises(ValueError, match="multiple benchmarks"):
            resolve_seed_strategy_config(None)

from __future__ import annotations

import pytest

from src.config.strategy_presets import (
    ETH_BTC_ROTATION_CONFIG_ID,
    resolve_seed_strategy_config,
)
from src.models.strategy_config import (
    SavedStrategyConfig,
    StrategyComponentRef,
    StrategyComposition,
)
from src.services.backtesting.composition import (
    build_saved_config_from_legacy,
    resolve_saved_strategy_config,
)
from src.services.backtesting.composition_catalog import (
    StrategyFamilySpec,
    build_default_composition_catalog,
)
from src.services.backtesting.features import DMA_200_FEATURE
from src.services.backtesting.strategy_registry import StrategyBuildRequest
from tests.services.backtesting.support import (
    MOCK_COMPOSED_STRATEGY_ID,
    build_mock_composed_catalog,
    build_mock_saved_config,
)


def test_resolve_seed_saved_config_builds_composed_eth_rotation_runtime() -> None:
    resolved = resolve_saved_strategy_config(
        resolve_seed_strategy_config(ETH_BTC_ROTATION_CONFIG_ID)
    )

    assert resolved.saved_config_id == ETH_BTC_ROTATION_CONFIG_ID
    assert resolved.strategy_id == "eth_btc_rotation"
    assert resolved.summary_signal_id == "eth_btc_rs_signal"
    assert resolved.primary_asset == "BTC"
    assert resolved.market_data_requirements.requires_sentiment is True
    assert DMA_200_FEATURE in resolved.market_data_requirements.required_price_features


def test_legacy_eth_btc_rotation_config_uses_dma_component_shape() -> None:
    saved_config = build_saved_config_from_legacy(
        strategy_id="eth_btc_rotation",
        params={
            "cross_cooldown_days": 8,
            "cross_on_touch": False,
            "ratio_cross_cooldown_days": 11,
            "pacing_k": 3.5,
            "pacing_r_max": 1.3,
            "buy_sideways_window_days": 6,
            "buy_sideways_max_range": 0.02,
            "buy_leg_caps": [0.04, 0.08],
        },
        config_id="eth_btc_legacy",
    )

    assert saved_config.composition.signal is not None
    assert saved_config.composition.signal.params["cross_cooldown_days"] == 8
    assert saved_config.composition.signal.params["ratio_cross_cooldown_days"] == 11
    assert saved_config.composition.pacing_policy is not None
    assert saved_config.composition.pacing_policy.params["k"] == 3.5
    assert saved_config.composition.plugins[0].component_id == "dma_buy_gate"
    assert saved_config.composition.plugins[0].params["window_days"] == 6
    assert saved_config.composition.plugins[1].component_id == "trade_quota_guard"
    # Tuning defaults are now applied from the shared preset tuning map.
    assert saved_config.composition.plugins[1].params == {
        "min_trade_interval_days": 1,
    }


def test_resolved_seed_eth_btc_rotation_strategy_uses_default_rotation_cooldown() -> (
    None
):
    resolved = resolve_saved_strategy_config(
        resolve_seed_strategy_config(ETH_BTC_ROTATION_CONFIG_ID)
    )

    strategy = resolved.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            total_capital=10_000.0,
            config_id=resolved.request_config_id,
        )
    )

    assert strategy.execution_engine.rotation_cooldown_days == 14
    assert strategy.signal_component.ratio_cross_cooldown_days == 30


def test_resolved_legacy_eth_btc_rotation_strategy_uses_custom_rotation_cooldown() -> (
    None
):
    saved_config = build_saved_config_from_legacy(
        strategy_id="eth_btc_rotation",
        params={
            "ratio_cross_cooldown_days": 9,
            "rotation_cooldown_days": 9,
        },
        config_id="eth_btc_rotation_custom_cooldown",
    )
    resolved = resolve_saved_strategy_config(saved_config)

    strategy = resolved.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            total_capital=10_000.0,
            config_id=resolved.request_config_id,
        )
    )

    assert strategy.execution_engine.rotation_cooldown_days == 9
    assert strategy.signal_component.ratio_cross_cooldown_days == 9


def test_registered_mock_family_resolves_with_injected_catalog() -> None:
    resolved = resolve_saved_strategy_config(
        build_mock_saved_config(),
        catalog=build_mock_composed_catalog(),
    )

    assert resolved.strategy_id == MOCK_COMPOSED_STRATEGY_ID
    assert resolved.summary_signal_id == "mock_signal"
    assert resolved.market_data_requirements.requires_sentiment is False


def test_registered_mock_family_reports_missing_slot_from_family_spec() -> None:
    catalog = build_mock_composed_catalog()
    broken = build_mock_saved_config().model_copy(
        update={
            "composition": build_mock_saved_config().composition.model_copy(
                update={"decision_policy": None},
                deep=True,
            )
        },
        deep=True,
    )

    with pytest.raises(
        ValueError,
        match=(
            "Strategy family 'mock_signal_family' is missing required component slots: "
            "decision_policy"
        ),
    ):
        resolve_saved_strategy_config(broken, catalog=catalog)


def test_legacy_adapter_rejects_family_without_legacy_support() -> None:
    with pytest.raises(
        ValueError,
        match=(
            "Strategy family 'mock_signal_family' does not support legacy inline "
            "compare config"
        ),
    ):
        build_saved_config_from_legacy(
            strategy_id=MOCK_COMPOSED_STRATEGY_ID,
            params={},
            config_id="mock_legacy",
            catalog=build_mock_composed_catalog(),
        )


# --- targeted coverage tests for composition_catalog.py ---


def test_build_decision_policy_with_params_raises() -> None:
    catalog = build_default_composition_catalog()
    factory = catalog.resolve_decision_policy_factory("dma_fgi_policy")
    with pytest.raises(ValueError, match="does not accept params"):
        factory({"unexpected": "param"})


def test_build_two_bucket_execution_profile_with_params_raises() -> None:
    catalog = build_default_composition_catalog()
    factory = catalog.resolve_execution_profile_factory("two_bucket_rebalance")
    with pytest.raises(ValueError, match="does not accept params"):
        factory({"unexpected": "param"})


def test_resolve_bucket_mapper_raises_for_unknown_id() -> None:
    catalog = build_default_composition_catalog()
    with pytest.raises(ValueError, match="Unsupported bucket_mapper_id"):
        catalog.resolve_bucket_mapper("nonexistent_mapper")


def test_resolve_signal_component_factory_raises_for_unknown_id() -> None:
    catalog = build_default_composition_catalog()
    with pytest.raises(ValueError, match="Unsupported signal component"):
        catalog.resolve_signal_component_factory("nonexistent_signal")


def test_resolve_decision_policy_factory_raises_for_unknown_id() -> None:
    catalog = build_default_composition_catalog()
    with pytest.raises(ValueError, match="Unsupported decision policy"):
        catalog.resolve_decision_policy_factory("nonexistent_policy")


def test_strategy_family_spec_validates_unsupported_plugins() -> None:
    family = StrategyFamilySpec(
        strategy_id="test_family",
        composition_kind="composed",
        mutable_via_admin=False,
        supports_plugins=False,
    )
    saved_config = SavedStrategyConfig(
        config_id="test_config",
        display_name="Test Config",
        strategy_id="test_family",
        primary_asset="BTC",
        params={},
        composition=StrategyComposition(
            kind="composed",
            bucket_mapper_id="two_bucket_spot_stable",
            plugins=[StrategyComponentRef(component_id="dma_buy_gate", params={})],
        ),
        supports_daily_suggestion=False,
        is_default=False,
        is_benchmark=False,
    )
    with pytest.raises(ValueError, match="does not support execution plugins"):
        family.validate_saved_config(saved_config)

from __future__ import annotations

from datetime import date

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
from src.services.backtesting.constants import STRATEGY_DCA_CLASSIC
from src.services.backtesting.features import DMA_200_FEATURE
from src.services.backtesting.strategy_registry import StrategyBuildRequest
from tests.services.backtesting.support import (
    MOCK_COMPOSED_STRATEGY_ID,
    build_mock_composed_catalog,
    build_mock_saved_config,
)


def test_resolve_seed_saved_config_builds_composed_dma_runtime() -> None:
    resolved = resolve_saved_strategy_config(
        resolve_seed_strategy_config("dma_gated_fgi_default")
    )

    assert resolved.saved_config_id == "dma_gated_fgi_default"
    assert resolved.strategy_id == "dma_gated_fgi"
    assert resolved.summary_signal_id == "dma_gated_fgi"
    assert resolved.primary_asset == "BTC"
    assert resolved.market_data_requirements.requires_sentiment is True
    assert DMA_200_FEATURE in resolved.market_data_requirements.required_price_features


def test_legacy_dma_compare_config_is_converted_to_saved_config_shape() -> None:
    saved_config = build_saved_config_from_legacy(
        strategy_id="dma_gated_fgi",
        params={
            "cross_cooldown_days": 12,
            "cross_on_touch": False,
            "pacing_k": 4.0,
            "pacing_r_max": 1.5,
            "buy_sideways_window_days": 7,
            "buy_sideways_max_range": 0.02,
            "buy_leg_caps": [0.1, 0.2],
        },
        config_id="dma_legacy",
    )

    assert saved_config.params["signal"]["cross_cooldown_days"] == 12
    assert saved_config.params["pacing"]["k"] == 4.0
    assert saved_config.composition.signal is not None
    assert saved_config.composition.signal.params["cross_cooldown_days"] == 12
    assert saved_config.composition.pacing_policy is not None
    assert saved_config.composition.pacing_policy.params["k"] == 4.0
    assert saved_config.composition.plugins[0].params["window_days"] == 7
    assert saved_config.composition.plugins[1].component_id == "trade_quota_guard"
    assert saved_config.composition.plugins[1].params == {}


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


def test_legacy_dma_compare_config_maps_trade_quota_params_to_plugin() -> None:
    saved_config = build_saved_config_from_legacy(
        strategy_id="dma_gated_fgi",
        params={
            "min_trade_interval_days": 3,
            "max_trades_7d": 2,
            "max_trades_30d": 6,
        },
        config_id="dma_quota_legacy",
    )

    assert saved_config.params["trade_quota"]["min_trade_interval_days"] == 3
    assert saved_config.params["trade_quota"]["max_trades_7d"] == 2
    assert saved_config.params["trade_quota"]["max_trades_30d"] == 6
    assert saved_config.composition.plugins[1].component_id == "trade_quota_guard"
    assert saved_config.composition.plugins[1].params == {
        "min_trade_interval_days": 3,
        "max_trades_7d": 2,
        "max_trades_30d": 6,
    }


def test_composed_saved_config_rejects_strategy_family_mismatch() -> None:
    with pytest.raises(
        ValueError,
        match="Strategy family 'dca_classic' must use composition.kind='benchmark'",
    ):
        resolve_saved_strategy_config(
            resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
                update={"strategy_id": "dca_classic"}
            )
        )


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


def test_build_dca_saved_config_from_legacy_with_params_raises() -> None:
    with pytest.raises(ValueError, match="dca_classic does not accept params"):
        build_saved_config_from_legacy(
            strategy_id=STRATEGY_DCA_CLASSIC,
            params={"unexpected": "param"},
            config_id="dca_test",
        )


def _make_dca_saved_config() -> SavedStrategyConfig:
    return SavedStrategyConfig(
        config_id="dca_test",
        display_name="DCA Test",
        strategy_id=STRATEGY_DCA_CLASSIC,
        primary_asset="BTC",
        params={},
        composition=StrategyComposition(
            kind="benchmark",
            bucket_mapper_id="two_bucket_spot_stable",
        ),
        supports_daily_suggestion=False,
        is_default=False,
        is_benchmark=True,
    )


def test_dca_strategy_builder_rejects_non_compare_mode() -> None:
    catalog = build_default_composition_catalog()
    family = catalog.resolve_family(STRATEGY_DCA_CLASSIC)
    assert family.benchmark_strategy_builder_factory is not None
    builder = family.benchmark_strategy_builder_factory(_make_dca_saved_config())
    with pytest.raises(ValueError, match="does not support daily suggestion"):
        builder(
            StrategyBuildRequest(
                mode="daily_suggestion",
                total_capital=10_000.0,
            )
        )


def test_dca_strategy_builder_rejects_missing_initial_allocation() -> None:
    catalog = build_default_composition_catalog()
    family = catalog.resolve_family(STRATEGY_DCA_CLASSIC)
    assert family.benchmark_strategy_builder_factory is not None
    builder = family.benchmark_strategy_builder_factory(_make_dca_saved_config())
    with pytest.raises(ValueError, match="requires initial allocation"):
        builder(
            StrategyBuildRequest(
                mode="compare",
                total_capital=10_000.0,
                user_prices=[{"date": date(2025, 1, 1), "price": 100.0}],
            )
        )


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

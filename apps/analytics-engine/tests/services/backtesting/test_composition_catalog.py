from __future__ import annotations

import pytest

from src.services.backtesting.composition_catalog import (
    build_default_composition_catalog,
)
from src.services.backtesting.execution.pacing import FgiExponentialPacingPolicy
from src.services.backtesting.execution.trade_quota_guard_plugin import (
    TradeQuotaGuardExecutionPlugin,
)
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
)


def test_resolve_signal_component_factory_builds_portfolio_rules_signal_component() -> (
    None
):
    factory = build_default_composition_catalog().resolve_signal_component_factory(
        "dma_fgi_portfolio_rules_signal"
    )

    component = factory({"cross_cooldown_days": 7, "cross_on_touch": False})

    assert isinstance(component, FlatMinimumSignalComponent)
    assert component.config.cross_cooldown_days == 7
    assert component.config.cross_on_touch is False


def test_resolve_pacing_policy_factory_builds_configured_policy() -> None:
    factory = build_default_composition_catalog().resolve_pacing_policy_factory(
        "fgi_exponential"
    )

    policy = factory({"k": 2.5, "r_max": 0.75})

    assert isinstance(policy, FgiExponentialPacingPolicy)
    assert policy.k == pytest.approx(2.5)
    assert policy.r_max == pytest.approx(0.75)


def test_trade_quota_guard_plugin_factory_rejects_unknown_params() -> None:
    factory = build_default_composition_catalog().resolve_plugin_factory(
        "trade_quota_guard"
    )

    with pytest.raises(ValueError, match="does not accept params: unexpected"):
        factory({"unexpected": 1})


def test_trade_quota_guard_plugin_factory_coerces_limits() -> None:
    factory = build_default_composition_catalog().resolve_plugin_factory(
        "trade_quota_guard"
    )

    plugin = factory(
        {
            "min_trade_interval_days": 3.0,
            "max_trades_7d": None,
            "max_trades_30d": 5.0,
        }
    )

    assert isinstance(plugin, TradeQuotaGuardExecutionPlugin)
    assert plugin.min_trade_interval_days == 3
    assert plugin.max_trades_7d is None
    assert plugin.max_trades_30d == 5


def test_decision_policy_and_execution_profile_factories_reject_params() -> None:
    catalog = build_default_composition_catalog()

    with pytest.raises(ValueError, match="does not accept params"):
        catalog.resolve_decision_policy_factory("dma_fgi_portfolio_rules_policy")(
            {"unexpected": 1}
        )
    with pytest.raises(ValueError, match="does not accept params"):
        catalog.resolve_execution_profile_factory("two_bucket_rebalance")(
            {"unexpected": 1}
        )


def test_dma_buy_gate_plugin_factory_coerces_leg_caps() -> None:
    plugin = build_default_composition_catalog().resolve_plugin_factory("dma_buy_gate")(
        {"window_days": 3, "sideways_max_range": 0.02, "leg_caps": [0.1, 0.2]}
    )

    assert plugin.window_days == 3
    assert plugin.sideways_max_range == pytest.approx(0.02)
    assert plugin.leg_caps == pytest.approx((0.1, 0.2))


def test_catalog_resolvers_reject_unknown_ids() -> None:
    catalog = build_default_composition_catalog()

    with pytest.raises(ValueError, match="Unsupported strategy family"):
        catalog.resolve_family("missing")
    with pytest.raises(ValueError, match="Unsupported decision policy"):
        catalog.resolve_decision_policy_factory("missing")
    with pytest.raises(ValueError, match="Unsupported execution profile"):
        catalog.resolve_execution_profile_factory("missing")
    with pytest.raises(ValueError, match="Unsupported bucket_mapper_id"):
        catalog.resolve_bucket_mapper("missing")

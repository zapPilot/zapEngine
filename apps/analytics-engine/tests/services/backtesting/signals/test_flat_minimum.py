from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
    FlatMinimumState,
    _coerce_optional_float,
    _forced_cross_events,
    build_initial_flat_minimum_asset_allocation,
)
from src.services.backtesting.strategies.base import StrategyContext
from tests.services.backtesting.support.reference_rules import reference_signals


def _component(**fields: Any) -> FlatMinimumSignalComponent:
    """A flat-minimum signal with the reference spec's DMA cross cooldowns."""
    return FlatMinimumSignalComponent(
        cross_down_cooldown_days_by_symbol=reference_signals().dma_cross_cooldown_days,
        **fields,
    )


def _context(
    *,
    context_date: date,
    portfolio: Portfolio,
    ratio: float,
    ratio_dma: float,
) -> StrategyContext:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    return StrategyContext(
        date=context_date,
        price=prices["btc"],
        sentiment={"label": "neutral", "value": 50},
        portfolio=portfolio,
        price_map=prices,
        extra_data={
            DMA_200_FEATURE: 90.0,
            ETH_DMA_200_FEATURE: 90.0,
            SPY_DMA_200_FEATURE: 90.0,
            ETH_BTC_RATIO_FEATURE: ratio,
            ETH_BTC_RATIO_DMA_200_FEATURE: ratio_dma,
        },
    )


def test_signal_component_emits_ratio_state_with_cross_up() -> None:
    component = _component()
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.05,
        ratio_dma=0.06,
    )
    live_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        ratio=0.07,
        ratio_dma=0.06,
    )

    component.initialize(warmup_context)
    component.warmup(warmup_context)
    state = component.observe(live_context)

    assert state.eth_btc_ratio_state is not None
    assert state.eth_btc_ratio_state.zone == "above"
    assert state.eth_btc_ratio_state.cross_event == "cross_up"
    assert state.eth_btc_ratio_state.actionable_cross_event == "cross_up"


@pytest.mark.parametrize(
    ("cross_on_touch", "expected_cross"), [(True, "cross_up"), (False, None)]
)
def test_the_touch_setting_decides_whether_a_ratio_touching_its_dma_crosses(
    cross_on_touch: bool,
    expected_cross: str | None,
) -> None:
    component = _component(cross_on_touch=cross_on_touch)
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )
    below = _context(
        context_date=date(2025, 1, 1), portfolio=portfolio, ratio=0.05, ratio_dma=0.06
    )
    touching = _context(
        context_date=date(2025, 1, 2), portfolio=portfolio, ratio=0.06, ratio_dma=0.06
    )

    component.initialize(below)
    component.warmup(below)
    ratio_state = component.observe(touching).eth_btc_ratio_state

    assert ratio_state is not None
    assert ratio_state.zone == "at"
    assert ratio_state.cross_event == expected_cross


def test_signal_component_declares_ratio_price_features() -> None:
    requirements = _component().market_data_requirements

    assert ETH_BTC_RATIO_FEATURE not in requirements.required_price_features
    assert ETH_BTC_RATIO_DMA_200_FEATURE not in requirements.required_price_features
    assert ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES in requirements.required_aux_series


def test_flat_minimum_state_rejects_unknown_asset_key() -> None:
    state_snapshot = FlatMinimumState(
        spy_dma_state=None,
        btc_dma_state=None,
        eth_dma_state=None,
        current_asset_allocation={"stable": 1.0},
    )

    with pytest.raises(ValueError, match="Unsupported flat-minimum asset"):
        state_snapshot.dma_state_for("doge")


def test_each_asset_gets_its_own_cooldown_and_the_touch_setting() -> None:
    component = FlatMinimumSignalComponent(
        cross_down_cooldown_days_by_symbol={"SPY": 3, "BTC": 4, "ETH": 5},
        cross_on_touch=False,
    )

    assert component._signal_for("spy").config == DmaGatedFgiConfig(
        cross_cooldown_days=3, cross_on_touch=False
    )
    assert component._signal_for("btc").config == DmaGatedFgiConfig(
        cross_cooldown_days=4, cross_on_touch=False
    )
    assert component._signal_for("eth").config == DmaGatedFgiConfig(
        cross_cooldown_days=5, cross_on_touch=False
    )


def test_the_touch_setting_defaults_to_on() -> None:
    component = _component()

    assert component.cross_on_touch is True
    assert component._config_for_symbol("BTC").cross_on_touch is True


def test_a_symbol_without_a_cooldown_has_no_fallback() -> None:
    component = _component()

    with pytest.raises(KeyError, match="DOGE"):
        component._config_for_symbol("DOGE")


def test_every_observed_asset_needs_a_cooldown() -> None:
    with pytest.raises(KeyError, match="ETH"):
        FlatMinimumSignalComponent(
            cross_down_cooldown_days_by_symbol={"SPY": 14, "BTC": 30}
        )


def test_the_cooldown_mapping_is_required() -> None:
    with pytest.raises(TypeError, match="cross_down_cooldown_days_by_symbol"):
        FlatMinimumSignalComponent()  # type: ignore[call-arg]


def test_signal_component_reset_and_invalid_signal_key_contracts() -> None:
    component = _component()
    component._ratio_cooldown_remaining = 3
    component._ratio_cooldown_blocked_zone = "above"

    component.reset()

    assert component._ratio_cooldown_state().active is False
    with pytest.raises(ValueError, match="Unsupported flat-minimum asset"):
        component._signal_for("doge")


def test_build_initial_flat_minimum_allocation_handles_zero_total_and_primary_btc() -> (
    None
):
    all_stable = build_initial_flat_minimum_asset_allocation(
        aggregate_allocation={"spot": 0.0, "stable": 0.0},
        extra_data={DMA_200_FEATURE: 90.0},
        price_map={},
        primary_price=100.0,
    )
    assert all_stable == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )

    primary_btc = build_initial_flat_minimum_asset_allocation(
        aggregate_allocation={"spot": 1.0, "stable": 0.0},
        extra_data={DMA_200_FEATURE: 90.0},
        price_map={},
        primary_price=100.0,
    )
    assert primary_btc == pytest.approx(
        {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )

    no_above = build_initial_flat_minimum_asset_allocation(
        aggregate_allocation={"spot": 1.0, "stable": 0.0},
        extra_data={DMA_200_FEATURE: 110.0},
        price_map={"btc": 100.0},
        primary_price=100.0,
    )
    assert no_above == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )


def test_signal_component_handles_ratio_cooldown_and_empty_observation() -> None:
    component = _component(ratio_cross_cooldown_days=3)
    component._start_ratio_cooldown(None)
    assert component._ratio_cooldown_state().active is False
    component._start_ratio_cooldown("cross_up")
    component._decrement_ratio_cooldown()

    cooldown = component._ratio_cooldown_state()
    assert cooldown.active is True
    assert cooldown.remaining_days == 2
    assert cooldown.blocked_zone == "above"

    empty = FlatMinimumState(
        spy_dma_state=None,
        btc_dma_state=None,
        eth_dma_state=None,
        current_asset_allocation={"stable": 1.0},
    )
    intent = AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
    )

    observation = component.build_signal_observation(snapshot=empty, intent=intent)

    assert observation.regime == "neutral"
    assert observation.dma is None
    assert observation.ratio is None


def test_forced_cross_events_ignore_invalid_entries() -> None:
    intent = AllocationIntent(
        action="sell",
        target_allocation={"stable": 1.0},
        allocation_name="forced",
        immediate=True,
        reason="forced",
        rule_group="cross",
        decision_score=-1.0,
        diagnostics={
            "portfolio_rule_forced_cross_events": {
                "BTC": "cross_down",
                "ETH": "sideways",
                10: "cross_up",
            }
        },
    )

    assert _forced_cross_events(intent) == {"BTC": "cross_down"}
    assert _coerce_optional_float("not-a-number") is None


def _observed_ratio_cross_up(component: FlatMinimumSignalComponent) -> FlatMinimumState:
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )
    before = _context(
        context_date=date(2025, 1, 1), portfolio=portfolio, ratio=0.05, ratio_dma=0.06
    )
    after = _context(
        context_date=date(2025, 1, 2), portfolio=portfolio, ratio=0.07, ratio_dma=0.06
    )
    component.initialize(before)
    component.warmup(before)
    return component.observe(after)


def _ratio_move(
    *,
    allocation_name: str,
    diagnostics: dict[str, object] | None,
) -> AllocationIntent:
    return AllocationIntent(
        action="sell",
        target_allocation={"eth": 1.0},
        allocation_name=allocation_name,
        immediate=True,
        reason=allocation_name,
        rule_group="cross",
        decision_score=0.0,
        diagnostics=diagnostics,
    )


def test_an_intent_that_starts_the_ratio_cooldown_blocks_the_next_ratio_cross() -> None:
    component = _component(ratio_cross_cooldown_days=5)
    observed = _observed_ratio_cross_up(component)

    committed = component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=observed,
        intent=_ratio_move(
            allocation_name="any_name_at_all",
            diagnostics={"starts_ratio_cooldown": True},
        ),
    )

    assert committed.eth_btc_ratio_state is not None
    assert committed.eth_btc_ratio_state.cooldown_state.active is True
    assert committed.eth_btc_ratio_state.cooldown_state.blocked_zone == "above"
    assert committed.eth_btc_ratio_state.cooldown_state.remaining_days == 5


@pytest.mark.parametrize(
    "diagnostics",
    [None, {}, {"starts_ratio_cooldown": False}, {"starts_ratio_cooldown": "yes"}],
)
def test_a_ratio_named_intent_without_the_marker_does_not_start_the_cooldown(
    diagnostics: dict[str, object] | None,
) -> None:
    component = _component(ratio_cross_cooldown_days=5)
    observed = _observed_ratio_cross_up(component)

    committed = component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=observed,
        intent=_ratio_move(
            allocation_name="portfolio_eth_btc_ratio_rotation_to_eth",
            diagnostics=diagnostics,
        ),
    )

    assert committed.eth_btc_ratio_state is not None
    assert committed.eth_btc_ratio_state.cooldown_state.active is False

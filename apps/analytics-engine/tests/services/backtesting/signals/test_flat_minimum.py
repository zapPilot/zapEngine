from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    DMA_ASSET_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.signals.dma_gated_fgi.component import (
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
    FlatMinimumState,
    _coerce_optional_float,
    _forced_cross_events,
    build_initial_flat_minimum_asset_allocation,
)
from src.services.backtesting.strategies.base import StrategyContext


def _context(
    *,
    context_date: date,
    portfolio: Portfolio,
    ratio: float,
    ratio_dma: float,
    price_history_map: dict[str, list[float]] | None = None,
) -> StrategyContext:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    return StrategyContext(
        date=context_date,
        price=prices["btc"],
        sentiment={"label": "neutral", "value": 50},
        price_history=[200.0] * 60,
        portfolio=portfolio,
        price_map=prices,
        price_history_map=price_history_map or {},
        extra_data={
            DMA_200_FEATURE: 90.0,
            ETH_DMA_200_FEATURE: 90.0,
            SPY_DMA_200_FEATURE: 90.0,
            ETH_BTC_RATIO_FEATURE: ratio,
            ETH_BTC_RATIO_DMA_200_FEATURE: ratio_dma,
        },
    )


def test_signal_component_emits_ratio_state_with_cross_up() -> None:
    component = FlatMinimumSignalComponent()
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


def test_signal_component_passes_asset_specific_price_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    component = FlatMinimumSignalComponent()
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )
    observed_history: dict[str, list[float]] = {}

    def observe_asset_context(
        self: DmaGatedFgiSignalComponent,
        context: StrategyContext,
    ) -> DmaMarketState:
        del self
        symbol = str(context.extra_data[DMA_ASSET_FEATURE])
        observed_history[symbol] = list(context.price_history)
        dma_200 = float(context.extra_data[DMA_200_FEATURE])
        return DmaMarketState(
            signal_id="dma_gated_fgi",
            dma_200=dma_200,
            dma_distance=(context.price / dma_200) - 1.0,
            zone="above",
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=DmaCooldownState(False, 0, None),
            fgi_value=50.0,
            fgi_slope=0.0,
            fgi_regime="neutral",
            regime_source="label",
            ath_event=None,
            asset_symbol=symbol,
        )

    monkeypatch.setattr(
        DmaGatedFgiSignalComponent,
        "observe",
        observe_asset_context,
    )
    context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        ratio=0.07,
        ratio_dma=0.06,
        price_history_map={
            "btc": [100.0] * 60,
            "eth": [110.0] * 59 + [100.0],
            "spy": [90.0] * 58 + [120.0, 100.0],
        },
    )

    state = component.observe(context)

    assert state.btc_dma_state is not None
    assert state.eth_dma_state is not None
    assert state.spy_dma_state is not None
    assert observed_history == {
        "BTC": [100.0] * 60,
        "ETH": [110.0] * 59 + [100.0],
        "SPY": [90.0] * 58 + [120.0, 100.0],
    }


def test_signal_component_declares_ratio_price_features() -> None:
    requirements = FlatMinimumSignalComponent().market_data_requirements

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


def test_signal_component_symbol_config_falls_back_when_override_missing() -> None:
    component = FlatMinimumSignalComponent(
        cross_down_cooldown_days_by_symbol={"BTC": 7}
    )

    assert component._config_for_symbol("ETH") is component.config
    assert component._config_for_symbol("BTC").cross_cooldown_days == 7


def test_signal_component_reset_and_invalid_signal_key_contracts() -> None:
    component = FlatMinimumSignalComponent()
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
    component = FlatMinimumSignalComponent(ratio_cross_cooldown_days=3)
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
    hints = component.build_execution_hints(
        snapshot=empty,
        intent=intent,
        signal_confidence=0.5,
    )

    assert observation.regime == "neutral"
    assert observation.dma is None
    assert observation.ratio is None
    assert hints.current_regime == "neutral"
    assert hints.enable_buy_gate is False


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

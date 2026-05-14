from __future__ import annotations

from datetime import date

import pytest

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
from src.services.backtesting.signals.flat_minimum import FlatMinimumSignalComponent
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

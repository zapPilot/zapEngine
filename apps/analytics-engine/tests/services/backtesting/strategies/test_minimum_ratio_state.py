from __future__ import annotations

from datetime import date

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.minimum import FlatMinimumSignalComponent


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
        price_history=[prices["btc"]],
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


def test_signal_component_declares_ratio_price_features() -> None:
    requirements = FlatMinimumSignalComponent().market_data_requirements

    assert ETH_BTC_RATIO_FEATURE in requirements.required_price_features
    assert ETH_BTC_RATIO_DMA_200_FEATURE in requirements.required_price_features

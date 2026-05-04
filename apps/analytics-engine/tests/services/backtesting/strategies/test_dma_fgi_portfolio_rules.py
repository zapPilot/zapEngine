from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaFgiPortfolioRulesDecisionPolicy,
    DmaFgiPortfolioRulesStrategy,
)
from src.services.backtesting.strategies.minimum import FlatMinimumState
from tests.services.backtesting.portfolio_rules.helpers import state


def _context(
    *,
    context_date: date,
    portfolio: Portfolio,
    prices: dict[str, float],
    dma: dict[str, float],
    sentiment: dict[str, object] | None = None,
    macro_fgi: dict[str, object] | None = None,
) -> StrategyContext:
    extra_data: dict[str, object] = {
        DMA_200_FEATURE: dma["btc"],
        ETH_DMA_200_FEATURE: dma["eth"],
        SPY_DMA_200_FEATURE: dma["spy"],
    }
    if macro_fgi is not None:
        extra_data["macro_fear_greed"] = macro_fgi
    return StrategyContext(
        date=context_date,
        price=prices["btc"],
        sentiment=sentiment or {"label": "neutral", "value": 50},
        price_history=[prices["btc"]],
        portfolio=portfolio,
        price_map=prices,
        extra_data=extra_data,
    )


def test_strategy_cross_down_exits_only_crossed_asset_to_stable() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 110.0, "spy": 110.0},
    )
    live_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 110.0, "eth": 110.0, "spy": 110.0},
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    action = strategy.on_day(live_context)

    assert action.snapshot.decision.reason == "portfolio_cross_down_exit"
    assert action.snapshot.decision.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )
    assert action.transfers is not None
    assert action.transfers[0].from_bucket == "btc"
    assert action.transfers[0].to_bucket == "stable"


def test_strategy_cross_up_equal_weights_currently_above_assets() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 110.0, "spy": 110.0},
    )
    live_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 90.0, "spy": 110.0},
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    action = strategy.on_day(live_context)

    assert action.snapshot.decision.reason == "portfolio_cross_up_equal_weight"
    assert action.snapshot.decision.target_allocation == pytest.approx(
        {"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )
    assert action.transfers is not None
    assert action.transfers[0].from_bucket == "btc"
    assert action.transfers[0].to_bucket == "eth"


def test_decision_policy_persists_previous_fgi_regimes_for_downshift_rule() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy()
    first_snapshot = _flat_state(
        btc=state(symbol="BTC", fgi_regime="greed"),
        current={"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0},
    )
    second_snapshot = _flat_state(
        btc=state(symbol="BTC", fgi_regime="neutral"),
        current={"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0},
    )

    assert policy.decide(first_snapshot).reason == "regime_no_signal"
    second_intent = policy.decide(second_snapshot)

    assert second_intent.reason == "portfolio_fgi_downshift_dca_sell"
    assert second_intent.target_allocation == pytest.approx(
        {"btc": 0.45, "eth": 0.0, "spy": 0.0, "stable": 0.55, "alt": 0.0}
    )


def _flat_state(
    *,
    btc: DmaMarketState,
    current: dict[str, float],
) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=state(symbol="SPY"),
        btc_dma_state=btc,
        eth_dma_state=state(symbol="ETH"),
        current_asset_allocation=current,
    )

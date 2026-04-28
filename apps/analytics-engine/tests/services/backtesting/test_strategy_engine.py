"""Tests for the DMA-first strategy engine."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.execution.engine import EngineConfig, StrategyEngine
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
)
from tests.services.backtesting.support import make_strategy_snapshot


class BuySpotStrategy(BaseStrategy):
    strategy_id = "buy_spot"
    display_name = "Buy Spot"
    canonical_strategy_id = "dca_classic"

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        target = {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="buy",
                reason="test_buy",
                target_allocation=target,
                event="rebalance",
            ),
            target_allocations=target,
        )


class HoldStableStrategy(BaseStrategy):
    strategy_id = "hold_stable"
    display_name = "Hold Stable"
    canonical_strategy_id = "dca_classic"

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        target = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="hold",
                reason="stay_stable",
                target_allocation=target,
            ),
            target_allocations=target,
        )


class RotateToEthStrategy(BaseStrategy):
    strategy_id = "rotate_eth"
    display_name = "Rotate ETH"
    canonical_strategy_id = "eth_btc_rotation"

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        target = {"btc": 0.0, "eth": 1.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="buy",
                reason="rotate_eth",
                target_allocation=target,
                event="rebalance",
            ),
            target_allocations=target,
        )


class BuySpyStrategy(BaseStrategy):
    strategy_id = "buy_spy"
    display_name = "Buy SPY"
    canonical_strategy_id = "spy_eth_btc_rotation"

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        target = {"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0}
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="buy",
                reason="test_buy_spy",
                target_allocation=target,
                event="rebalance",
            ),
            target_allocations=target,
        )


def test_engine_applies_slippage_to_spot_rebalance() -> None:
    prices = [{"date": date(2025, 1, 1), "price": 100.0}]
    sentiments = {date(2025, 1, 1): {"label": "neutral", "value": 50}}

    no_slip = StrategyEngine(
        EngineConfig(trading_slippage_percent=0.0, apr_by_regime={})
    )
    with_slip = StrategyEngine(
        EngineConfig(trading_slippage_percent=0.01, apr_by_regime={})
    )

    result_no_slip = no_slip.run(
        prices=prices,
        sentiments=sentiments,
        strategies=[BuySpotStrategy()],
        initial_allocation={"spot": 0.0, "stable": 1.0},
        total_capital=1_000.0,
        token_symbol="BTC",
    )
    result_with_slip = with_slip.run(
        prices=prices,
        sentiments=sentiments,
        strategies=[BuySpotStrategy()],
        initial_allocation={"spot": 0.0, "stable": 1.0},
        total_capital=1_000.0,
        token_symbol="BTC",
    )

    no_slip_spot = result_no_slip.timeline[0].strategies["buy_spot"].portfolio.spot_usd
    slip_spot = result_with_slip.timeline[0].strategies["buy_spot"].portfolio.spot_usd
    assert slip_spot < no_slip_spot
    assert (
        result_no_slip.timeline[0].strategies["buy_spot"].decision.reason == "test_buy"
    )


def test_engine_applies_daily_yield_to_stable_bucket() -> None:
    prices = [{"date": date(2025, 1, 1), "price": 100.0}]
    sentiments = {date(2025, 1, 1): {"label": "neutral", "value": 50}}
    apr = {"neutral": {"spot": 0.0, "stable": 0.365}}

    engine = StrategyEngine(
        EngineConfig(trading_slippage_percent=0.0, apr_by_regime=apr)
    )
    result = engine.run(
        prices=prices,
        sentiments=sentiments,
        strategies=[HoldStableStrategy()],
        initial_allocation={"spot": 0.0, "stable": 1.0},
        total_capital=1_000.0,
        token_symbol="BTC",
    )

    state = result.timeline[0].strategies["hold_stable"]
    assert state.portfolio.stable_usd > 1_000.0
    assert state.execution.event is None
    assert state.signal is None


def test_engine_executes_canonical_spy_target_without_spot_routing() -> None:
    prices = [
        {
            "date": date(2025, 1, 1),
            "price": 100_000.0,
            "prices": {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0},
        }
    ]
    sentiments = {date(2025, 1, 1): {"label": "neutral", "value": 50}}
    engine = StrategyEngine(
        EngineConfig(trading_slippage_percent=0.0, apr_by_regime={})
    )

    result = engine.run(
        prices=prices,
        sentiments=sentiments,
        strategies=[BuySpyStrategy()],
        initial_allocation={"spot": 0.0, "stable": 1.0},
        total_capital=1_200.0,
        token_symbol="BTC",
    )

    state = result.timeline[0].strategies["buy_spy"]
    assert state.portfolio.asset_allocation.spy == pytest.approx(1.0)
    assert state.portfolio.asset_allocation.stable == pytest.approx(0.0)
    assert state.decision.target_allocation.spy == pytest.approx(1.0)


def test_engine_values_strategy_by_active_spot_asset_price_map() -> None:
    prices = [
        {
            "date": date(2025, 1, 1),
            "price": 100_000.0,
            "prices": {"btc": 100_000.0, "eth": 5_000.0},
        },
        {
            "date": date(2025, 1, 2),
            "price": 100_000.0,
            "prices": {"btc": 100_000.0, "eth": 6_000.0},
        },
    ]
    sentiments = {
        date(2025, 1, 1): {"label": "neutral", "value": 50},
        date(2025, 1, 2): {"label": "neutral", "value": 50},
    }

    engine = StrategyEngine(
        EngineConfig(trading_slippage_percent=0.0, apr_by_regime={})
    )
    result = engine.run(
        prices=prices,
        sentiments=sentiments,
        strategies=[RotateToEthStrategy()],
        initial_allocation={"spot": 1.0, "stable": 0.0},
        total_capital=1_000.0,
        token_symbol="BTC",
    )

    assert result.strategies["rotate_eth"].trade_count == 1
    assert result.strategies["rotate_eth"].final_value == 1_200.0
    assert result.timeline[-1].strategies["rotate_eth"].portfolio.spot_usd == 1_200.0

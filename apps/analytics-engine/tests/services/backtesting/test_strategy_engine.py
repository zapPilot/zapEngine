"""Tests for the DMA-first strategy engine under explicit assumptions."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.models.backtesting import BacktestAssumptions
from src.services.backtesting.execution.engine import StrategyEngine
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    Order,
    StrategyAction,
    StrategyContext,
    TransferIntent,
)
from tests.services.backtesting.support import make_strategy_snapshot

ALL_BTC = {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
ALL_ETH = {"btc": 0.0, "eth": 1.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
ALL_SPY = {"btc": 0.0, "eth": 0.0, "spy": 1.0, "stable": 0.0, "alt": 0.0}
ALL_STABLE = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
START = date(2025, 1, 1)
NEUTRAL = {"label": "neutral", "value": 50}


def _no_cost(**overrides: float) -> BacktestAssumptions:
    """Assumptions with no slippage and no yield, so a test sees one effect."""
    fields = {"slippage_rate": 0.0, "stable_apr": 0.0, **overrides}
    return BacktestAssumptions(**fields)


class MoveToTarget(BaseStrategy):
    """Asks for ``target`` on every bar it is not already holding it."""

    def __init__(self, strategy_id: str, target: dict[str, float]) -> None:
        self.strategy_id = strategy_id
        self.display_name = strategy_id
        self.canonical_strategy_id = "dma_fgi_portfolio_rules"
        self.target = target
        self.orders_placed = 0

    def on_day(self, context: StrategyContext) -> StrategyAction:
        held = context.portfolio.asset_allocation_percentages(context.portfolio_price)
        at_target = all(
            abs(held.get(bucket, 0.0) - weight) < 1e-9
            for bucket, weight in (
                ("btc", self.target["btc"]),
                ("eth", self.target["eth"]),
                ("spy", self.target["spy"]),
                ("stable", self.target["stable"]),
            )
        )
        if at_target:
            return StrategyAction(
                snapshot=make_strategy_snapshot(
                    action="hold",
                    reason="at_target",
                    target_allocation=self.target,
                ),
            )
        self.orders_placed += 1
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="buy",
                reason="move_to_target",
                target_allocation=self.target,
                event="rebalance",
            ),
            order=Order(target_allocation=dict(self.target)),
        )


class Flip(BaseStrategy):
    """Alternates between all BTC and all stable, placing an order every bar."""

    strategy_id = "flip"
    display_name = "Flip"
    canonical_strategy_id = "dma_fgi_portfolio_rules"

    def __init__(self) -> None:
        self.day = 0

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        self.day += 1
        target = ALL_BTC if self.day % 2 else ALL_STABLE
        return StrategyAction(
            snapshot=make_strategy_snapshot(
                action="buy",
                reason="flip",
                target_allocation=target,
                event="rebalance",
            ),
            order=Order(target_allocation=dict(target)),
        )


class SpendOnce(BaseStrategy):
    """Asks, on its first bar only, to move exact amounts rather than a target."""

    strategy_id = "spend_once"
    display_name = "Spend Once"
    canonical_strategy_id = "dca_classic"

    def __init__(self, *amounts: float) -> None:
        self.amounts = amounts
        self.asked = False

    def on_day(self, context: StrategyContext) -> StrategyAction:
        del context
        snapshot = make_strategy_snapshot(action="buy", reason="spend")
        if self.asked:
            return StrategyAction(snapshot=snapshot)
        self.asked = True
        return StrategyAction(
            snapshot=snapshot,
            order=Order(
                transfers=tuple(
                    TransferIntent("stable", "btc", amount) for amount in self.amounts
                )
            ),
        )


def _bars(*btc_prices: float, start: date = START) -> list[dict[str, object]]:
    return [
        {
            "date": start + timedelta(days=offset),
            "price": price,
            "prices": {"btc": price, "eth": 5_000.0, "spy": 600.0},
        }
        for offset, price in enumerate(btc_prices)
    ]


def _sentiments(prices: list[dict[str, object]]) -> dict[date, dict[str, object]]:
    return {row["date"]: NEUTRAL for row in prices}  # type: ignore[misc]


def _run(
    strategy: BaseStrategy,
    prices: list[dict[str, object]],
    assumptions: BacktestAssumptions,
    *,
    initial_allocation: dict[str, float] | None = None,
    total_capital: float = 1_000.0,
):
    return StrategyEngine(assumptions).run(
        prices=prices,
        sentiments=_sentiments(prices),
        strategies=[strategy],
        initial_allocation=initial_allocation or {"spot": 0.0, "stable": 1.0},
        total_capital=total_capital,
        token_symbol="BTC",
    )


def test_an_order_fills_on_the_next_bar_at_that_bars_prices() -> None:
    strategy = MoveToTarget("buy_btc", ALL_BTC)
    result = _run(strategy, _bars(100.0, 110.0), _no_cost(fill_lag_days=1))

    placed, filled = (point.strategies["buy_btc"] for point in result.timeline)
    assert placed.decision.reason == "move_to_target"  # the order was placed on bar one
    assert placed.portfolio.spot_usd == 0.0  # ... and nothing moved yet
    # bought with 1,000 USD at 110, valued at 110: no price gain on the way in
    assert filled.portfolio.spot_usd == pytest.approx(1_000.0)
    assert result.strategies["buy_btc"].pnl_attribution.price_usd == pytest.approx(0.0)


def test_an_order_of_exact_transfers_moves_exactly_those_amounts() -> None:
    result = _run(SpendOnce(250.0), _bars(100.0, 100.0), _no_cost(fill_lag_days=1))

    final = result.timeline[-1].strategies["spend_once"].portfolio
    assert final.spot_usd == pytest.approx(250.0)
    assert final.stable_usd == pytest.approx(750.0)


def test_a_zero_amount_transfer_moves_nothing() -> None:
    result = _run(SpendOnce(0.0), _bars(100.0, 100.0), _no_cost(fill_lag_days=1))

    final = result.timeline[-1].strategies["spend_once"].portfolio
    assert final.spot_usd == 0.0
    assert final.stable_usd == pytest.approx(1_000.0)


def test_no_lag_fills_on_the_decision_bar() -> None:
    strategy = MoveToTarget("buy_btc", ALL_BTC)
    result = _run(strategy, _bars(100.0, 110.0), _no_cost(fill_lag_days=0))

    placed, later = (point.strategies["buy_btc"] for point in result.timeline)
    assert placed.portfolio.spot_usd == pytest.approx(1_000.0)
    assert later.portfolio.spot_usd == pytest.approx(1_100.0)
    assert result.strategies["buy_btc"].pnl_attribution.price_usd == pytest.approx(
        100.0
    )


def test_an_order_still_pending_when_the_data_ends_is_never_filled() -> None:
    result = _run(
        MoveToTarget("buy_btc", ALL_BTC), _bars(100.0), _no_cost(fill_lag_days=1)
    )

    summary = result.strategies["buy_btc"]
    assert summary.trade_count == 1  # the order was placed ...
    assert summary.final_value == pytest.approx(1_000.0)  # ... but never filled
    assert result.timeline[0].strategies["buy_btc"].portfolio.stable_usd == (
        pytest.approx(1_000.0)
    )


def test_trade_count_is_the_number_of_orders_placed() -> None:
    strategy = MoveToTarget("rotate_eth", ALL_ETH)
    result = _run(
        strategy,
        _bars(100.0, 100.0, 100.0, 100.0),
        _no_cost(),
        initial_allocation={"spot": 1.0, "stable": 0.0},
    )

    # one order on bar one; it fills on bar two, after which nothing is left to do
    assert result.strategies["rotate_eth"].trade_count == 1
    assert strategy.orders_placed == 1


def test_slippage_is_charged_on_every_fill() -> None:
    prices = _bars(100.0, 100.0)
    free = _run(MoveToTarget("buy_btc", ALL_BTC), prices, _no_cost())
    costly = _run(
        MoveToTarget("buy_btc", ALL_BTC), prices, _no_cost(slippage_rate=0.01)
    )

    free_spot = free.timeline[-1].strategies["buy_btc"].portfolio.spot_usd
    costly_spot = costly.timeline[-1].strategies["buy_btc"].portfolio.spot_usd
    assert free_spot == pytest.approx(1_000.0)
    assert costly_spot == pytest.approx(990.0)
    assert costly.strategies["buy_btc"].pnl_attribution.cost_usd == pytest.approx(-10.0)


def test_stable_yield_accrues_for_the_days_between_bars() -> None:
    prices = _bars(100.0, 100.0, start=START)
    # the second bar lands three days after the first
    prices[1]["date"] = START + timedelta(days=3)
    result = _run(
        MoveToTarget("hold_stable", ALL_STABLE),
        prices,
        _no_cost(stable_apr=0.365),
    )

    daily = 0.365 / 365.0
    expected = 1_000.0 * ((1.0 + daily) ** 3 - 1.0)
    summary = result.strategies["hold_stable"]
    assert summary.pnl_attribution.yield_usd == pytest.approx(expected)
    assert summary.final_value == pytest.approx(1_000.0 + expected)


def test_yield_is_credited_only_to_stablecoins() -> None:
    result = _run(
        MoveToTarget("hold_btc", ALL_BTC),
        _bars(100.0, 100.0, 100.0),
        _no_cost(stable_apr=0.5),
        initial_allocation={"spot": 1.0, "stable": 0.0},
    )

    summary = result.strategies["hold_btc"]
    assert summary.pnl_attribution.yield_usd == 0.0
    assert summary.final_value == pytest.approx(1_000.0)


def test_pnl_attribution_adds_up_to_the_total_pnl() -> None:
    prices = _bars(100.0, 120.0, 90.0, 130.0, 80.0, 110.0, 105.0)
    result = _run(
        Flip(),
        prices,
        BacktestAssumptions(fill_lag_days=1, slippage_rate=0.003, stable_apr=0.05),
        initial_allocation={"spot": 0.5, "stable": 0.5},
        total_capital=10_000.0,
    )

    summary = result.strategies["flip"]
    parts = summary.pnl_attribution
    assert parts.yield_usd > 0.0
    assert parts.cost_usd < 0.0
    assert parts.price_usd + parts.yield_usd + parts.cost_usd == pytest.approx(
        summary.final_value - summary.total_invested, abs=1e-6
    )


def test_the_response_echoes_the_assumptions_it_ran_under() -> None:
    assumptions = BacktestAssumptions(
        fill_lag_days=0, slippage_rate=0.001, stable_apr=0.02
    )

    result = _run(MoveToTarget("hold", ALL_STABLE), _bars(100.0), assumptions)

    assert result.assumptions == assumptions


def test_an_empty_price_series_still_echoes_the_assumptions() -> None:
    assumptions = BacktestAssumptions()

    result = StrategyEngine(assumptions).run(
        prices=[], sentiments={}, strategies=[MoveToTarget("hold", ALL_STABLE)]
    )

    assert result.assumptions == assumptions
    assert result.strategies == {}


def test_the_engine_defaults_to_the_honest_assumptions() -> None:
    assert StrategyEngine().assumptions == BacktestAssumptions()
    assert StrategyEngine().assumptions.fill_lag_days == 1


def test_engine_executes_canonical_spy_target_without_spot_routing() -> None:
    prices = [
        {
            "date": START,
            "price": 100_000.0,
            "prices": {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0},
        }
    ]

    result = _run(
        MoveToTarget("buy_spy", ALL_SPY),
        prices,
        _no_cost(fill_lag_days=0),
        total_capital=1_200.0,
    )

    state = result.timeline[0].strategies["buy_spy"]
    assert state.portfolio.asset_allocation.spy == pytest.approx(1.0)
    assert state.portfolio.asset_allocation.stable == pytest.approx(0.0)
    assert state.decision.target_allocation.spy == pytest.approx(1.0)


def test_engine_values_strategy_by_active_spot_asset_price_map() -> None:
    prices = [
        {
            "date": START,
            "price": 100_000.0,
            "prices": {"btc": 100_000.0, "eth": 5_000.0},
        },
        {
            "date": START + timedelta(days=1),
            "price": 100_000.0,
            "prices": {"btc": 100_000.0, "eth": 6_000.0},
        },
    ]

    result = _run(
        MoveToTarget("rotate_eth", ALL_ETH),
        prices,
        _no_cost(fill_lag_days=0),
        initial_allocation={"spot": 1.0, "stable": 0.0},
    )

    assert result.strategies["rotate_eth"].trade_count == 1
    assert result.strategies["rotate_eth"].final_value == 1_200.0
    assert result.timeline[-1].strategies["rotate_eth"].portfolio.spot_usd == 1_200.0

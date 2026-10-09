from __future__ import annotations

import pytest

from src.models.backtesting import BacktestAssumptions
from src.services.backtesting.execution.compare import (
    neutral_initial_allocation,
    simulate,
)
from src.services.backtesting.lab.benchmarks import (
    BENCHMARK_IDS,
    BUY_HOLD_BTC,
    BUY_HOLD_EQUAL_WEIGHT,
    DCA_CLASSIC,
    HoldStrategy,
    build_benchmarks,
)
from src.services.backtesting.lab.synthetic import synthetic_market

CAPITAL = 10_000.0


def _run(ids: tuple[str, ...], days: int = 120, **assumptions: float):
    market = synthetic_market(seed=4, days=days)
    start = market.user_start_date
    user_prices = [row for row in market.prices if row["date"] >= start]
    strategies = build_benchmarks(
        ids,
        total_capital=CAPITAL,
        total_days=len(user_prices),
        user_start_date=start,
        initial_allocation=neutral_initial_allocation(),
    )
    return market, simulate(
        strategies,
        prices=market.prices,
        sentiments=market.sentiments,
        user_start_date=start,
        total_capital=CAPITAL,
        token_symbol="BTC",
        assumptions=BacktestAssumptions(**assumptions),
    )


def test_every_benchmark_is_built_by_name() -> None:
    market = synthetic_market(seed=4, days=60)

    strategies = build_benchmarks(
        BENCHMARK_IDS,
        total_capital=CAPITAL,
        total_days=60,
        user_start_date=market.user_start_date,
        initial_allocation=neutral_initial_allocation(),
    )

    assert [strategy.strategy_id for strategy in strategies] == list(BENCHMARK_IDS)
    assert BENCHMARK_IDS == (DCA_CLASSIC, BUY_HOLD_BTC, BUY_HOLD_EQUAL_WEIGHT)


def test_an_unknown_benchmark_is_refused() -> None:
    with pytest.raises(ValueError, match="Unknown benchmark 'moon'"):
        build_benchmarks(
            ["moon"],
            total_capital=CAPITAL,
            total_days=10,
            user_start_date=synthetic_market(seed=1, days=5).user_start_date,
            initial_allocation=neutral_initial_allocation(),
        )


def test_holding_btc_follows_the_btc_price_and_never_trades() -> None:
    market, response = _run((BUY_HOLD_BTC,))
    first = next(row for row in market.prices if row["date"] >= market.user_start_date)
    last = market.prices[-1]

    summary = response.strategies[BUY_HOLD_BTC]

    assert summary.trade_count == 0
    assert summary.final_value == pytest.approx(
        CAPITAL * last["prices"]["btc"] / first["prices"]["btc"]
    )
    assert summary.pnl_attribution.cost_usd == 0.0
    assert summary.pnl_attribution.yield_usd == 0.0
    assert all(
        point.strategies[BUY_HOLD_BTC].portfolio.asset_allocation.stable == 0.0
        for point in response.timeline[:1]
    )


def test_the_equal_weight_hold_starts_with_a_third_in_each() -> None:
    _, response = _run((BUY_HOLD_EQUAL_WEIGHT,), days=30)

    allocation = (
        response.timeline[0]
        .strategies[BUY_HOLD_EQUAL_WEIGHT]
        .portfolio.asset_allocation
    )

    assert (allocation.btc, allocation.eth, allocation.spy) == pytest.approx(
        (1 / 3, 1 / 3, 1 / 3)
    )
    assert response.strategies[BUY_HOLD_EQUAL_WEIGHT].trade_count == 0


def test_a_hold_reports_its_weights() -> None:
    strategy = HoldStrategy(
        weights={"btc": 1.0},
        strategy_id="x",
        display_name="x",
    )

    assert strategy.parameters() == {
        "weights": {"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    }


def test_dca_deploys_every_day_of_the_window() -> None:
    _, response = _run((DCA_CLASSIC,), days=60)

    assert response.strategies[DCA_CLASSIC].trade_count == 60

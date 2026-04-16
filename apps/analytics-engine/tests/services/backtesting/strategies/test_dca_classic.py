from __future__ import annotations

from datetime import date

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.dca_classic import DcaClassicStrategy


def _context(
    *,
    current_date: date,
    portfolio: Portfolio | None = None,
) -> StrategyContext:
    runtime_portfolio = portfolio or Portfolio(spot_balance=0.0, stable_balance=100.0)
    return StrategyContext(
        date=current_date,
        price=100.0,
        sentiment=None,
        price_history=[100.0],
        portfolio=runtime_portfolio,
    )


def test_dca_classic_pre_start_returns_hold_snapshot() -> None:
    strategy = DcaClassicStrategy(
        total_days=2,
        total_capital=100.0,
        initial_allocation={"spot": 0.0, "stable": 1.0},
        user_start_date=date(2025, 1, 2),
    )
    context = _context(current_date=date(2025, 1, 1))
    strategy.initialize(context.portfolio, None, context)

    action = strategy.on_day(context)

    assert action.snapshot.decision.action == "hold"
    assert action.snapshot.decision.reason == "pre_start_hold"
    assert action.snapshot.signal is None


def test_dca_classic_capital_exhausted_returns_hold_snapshot() -> None:
    strategy = DcaClassicStrategy(
        total_days=1,
        total_capital=100.0,
        initial_allocation={"spot": 0.0, "stable": 1.0},
        user_start_date=date(2025, 1, 1),
    )
    context = _context(current_date=date(2025, 1, 1))
    strategy.initialize(context.portfolio, None, context)

    first_action = strategy.on_day(context)
    second_action = strategy.on_day(_context(current_date=date(2025, 1, 2)))

    assert first_action.snapshot.decision.reason == "daily_buy"
    assert second_action.snapshot.decision.action == "hold"
    assert second_action.snapshot.decision.reason == "capital_exhausted"


def test_dca_classic_daily_buy_returns_transfer_and_execution_event() -> None:
    strategy = DcaClassicStrategy(
        total_days=2,
        total_capital=100.0,
        initial_allocation={"spot": 0.0, "stable": 1.0},
        user_start_date=date(2025, 1, 1),
    )
    context = _context(current_date=date(2025, 1, 1))
    strategy.initialize(context.portfolio, None, context)

    action = strategy.on_day(context)

    assert action.transfers is not None
    assert action.transfers[0].amount_usd == 50.0
    assert action.snapshot.decision.action == "buy"
    assert action.snapshot.decision.reason == "daily_buy"
    assert action.snapshot.execution.event == "buy"
    assert action.snapshot.execution.transfers[0].amount_usd == 50.0


def test_dca_classic_no_cash_returns_hold_snapshot() -> None:
    strategy = DcaClassicStrategy(
        total_days=2,
        total_capital=0.0,
        initial_allocation={"spot": 1.0, "stable": 0.0},
        user_start_date=date(2025, 1, 1),
    )
    context = _context(
        current_date=date(2025, 1, 1),
        portfolio=Portfolio(spot_balance=1.0, stable_balance=0.0),
    )
    strategy.initialize(context.portfolio, None, context)

    action = strategy.on_day(context)

    assert action.transfers is None
    assert action.snapshot.decision.action == "hold"
    assert action.snapshot.decision.reason == "no_cash"
    assert action.snapshot.execution.event is None

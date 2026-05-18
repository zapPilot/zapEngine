from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
)


class _PlainStrategy(BaseStrategy):
    pass


class _RecordingStrategy(BaseStrategy):
    def __init__(self) -> None:
        self.daily_data: list[dict[str, object]] = []
        self.total_deployed = 123.0


def _context() -> StrategyContext:
    return StrategyContext(
        date=date(2025, 1, 5),
        price=50_000.0,
        sentiment=None,
        price_history=[50_000.0],
        portfolio=Portfolio(spot_balance=0.2, stable_balance=1_000.0),
    )


def test_base_strategy_default_hooks_are_noops_or_raise() -> None:
    strategy = _PlainStrategy()
    context = _context()

    strategy.warmup_day(context)
    assert strategy.finalize().metrics == {}
    assert strategy.parameters() == {}

    with pytest.raises(NotImplementedError):
        strategy.on_day(context)
    with pytest.raises(NotImplementedError):
        strategy.get_daily_recommendation(object())  # type: ignore[arg-type]


def test_base_strategy_record_day_appends_default_daily_record() -> None:
    strategy = _RecordingStrategy()
    context = _context()

    strategy.record_day(
        context,
        StrategyAction(snapshot=None),  # type: ignore[arg-type]
        yield_breakdown={},
        trade_executed=False,
    )

    assert strategy.daily_data == [
        {
            "date": date(2025, 1, 5),
            "deployed": 123.0,
            "holdings": 0.2,
            "value": 10_000.0,
            "remaining_capital": 1_000.0,
        }
    ]


def test_base_strategy_record_day_ignores_objects_without_daily_data_list() -> None:
    strategy = _PlainStrategy()

    strategy.record_day(
        _context(),
        StrategyAction(snapshot=None),  # type: ignore[arg-type]
        yield_breakdown={},
        trade_executed=False,
    )

    assert BaseStrategy._get_daily_data(strategy) is None
    assert BaseStrategy._get_total_deployed(strategy) == 0.0

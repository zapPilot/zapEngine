"""Tests for the rule-based allocation executor."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.cost_model import PercentageSlippageModel
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.rule_based.allocation_executor import (
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.strategies.base import StrategyContext


def _context(
    *,
    portfolio: Portfolio,
    prices: dict[str, float] | None = None,
    context_date: date = date(2025, 1, 2),
) -> StrategyContext:
    resolved_prices = prices or {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    return StrategyContext(
        date=context_date,
        price=resolved_prices["btc"],
        sentiment={"label": "neutral", "value": 50},
        price_history=[resolved_prices["btc"]] * 2,
        portfolio=portfolio,
        price_map=resolved_prices,
        extra_data={},
    )


def _intent(target: dict[str, float]) -> AllocationIntent:
    return AllocationIntent(
        action="buy",
        target_allocation=target,
        allocation_name="portfolio_extreme_fear_dca_buy",
        immediate=False,
        reason="portfolio_extreme_fear_dca_buy",
        rule_group="dma_fgi",
        decision_score=1.0,
    )


def _hints() -> ExecutionHints:
    return ExecutionHints(
        signal_id="dma_fgi_portfolio_rules_signal",
        current_regime="extreme_fear",
        signal_value=12.0,
        signal_confidence=1.0,
        decision_score=1.0,
        decision_action="buy",
    )


def test_executor_returns_noop_when_already_at_target() -> None:
    executor = RuleBasedAllocationExecutor()
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )

    result = executor.execute(
        context=_context(portfolio=portfolio),
        intent=_intent(
            {"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0}
        ),
        hints=_hints(),
    )

    assert result.event is None
    assert result.transfers is None
    assert result.immediate_execution is True
    assert executor.last_trade_date is None
    assert executor.trade_dates == []


def test_executor_applies_full_delta_atomically_in_one_bar() -> None:
    executor = RuleBasedAllocationExecutor()
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )

    result = executor.execute(
        context=_context(portfolio=portfolio),
        intent=_intent(
            {"btc": 0.05, "eth": 0.0, "spy": 0.0, "stable": 0.95, "alt": 0.0}
        ),
        hints=_hints(),
    )

    assert result.event == "rebalance"
    assert result.transfers is not None
    assert len(result.transfers) == 1
    assert result.transfers[0].from_bucket == "stable"
    assert result.transfers[0].to_bucket == "btc"
    assert result.transfers[0].amount_usd == pytest.approx(500.0)
    assert executor.last_trade_date == date(2025, 1, 2)
    assert executor.trade_dates == [date(2025, 1, 2)]


def test_executor_builds_all_required_multi_asset_transfers_at_once() -> None:
    executor = RuleBasedAllocationExecutor()
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.50, "eth": 0.30, "spy": 0.0, "stable": 0.20},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
    )

    result = executor.execute(
        context=_context(portfolio=portfolio),
        intent=_intent(
            {"btc": 0.0, "eth": 0.40, "spy": 0.0, "stable": 0.60, "alt": 0.0}
        ),
        hints=_hints(),
    )

    assert result.transfers is not None
    assert [(t.from_bucket, t.to_bucket, t.amount_usd) for t in result.transfers] == [
        ("btc", "eth", pytest.approx(1_000.0)),
        ("btc", "stable", pytest.approx(4_000.0)),
    ]


def test_executor_preserves_gross_amounts_for_portfolio_cost_model() -> None:
    executor = RuleBasedAllocationExecutor()
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        {"btc": 100.0, "eth": 100.0, "spy": 100.0},
        cost_model=PercentageSlippageModel(percent=0.01),
    )
    context = _context(portfolio=portfolio)

    result = executor.execute(
        context=context,
        intent=_intent(
            {"btc": 0.05, "eth": 0.0, "spy": 0.0, "stable": 0.95, "alt": 0.0}
        ),
        hints=_hints(),
    )

    assert result.transfers is not None
    transfer = result.transfers[0]
    assert transfer.amount_usd == pytest.approx(500.0)

    portfolio.execute_transfer(
        transfer.from_bucket,
        transfer.to_bucket,
        transfer.amount_usd,
        context.portfolio_price,
    )

    values = portfolio.asset_values(context.portfolio_price)
    assert values["stable"] == pytest.approx(9_500.0)
    assert values["btc"] == pytest.approx(495.0)

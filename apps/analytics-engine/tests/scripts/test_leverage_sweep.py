from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest

from scripts.research.leverage.config import LeverageConfig
from scripts.research.leverage.leverage_sweep import (
    experiment_configs,
    experiment_windows,
    leverage_config_id,
    main,
    resolved_leverage_config,
)
from scripts.research.leverage.strategy import LeveredRuleBasedPortfolioStrategy
from src.services.backtesting.execution.cost_model import PercentageSlippageModel
from src.services.backtesting.execution.engine import EngineConfig, StrategyEngine
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import (
    StrategyAction,
    StrategyContext,
    TransferIntent,
)
from src.services.backtesting.strategy_registry import list_strategy_recipes
from tests.services.backtesting.helpers import state as dma_state
from tests.services.backtesting.support import make_strategy_snapshot


def _flat_state(
    *,
    day: int,
    zone: str,
    regime: str = "neutral",
    cross_event: str | None = None,
) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=None,
        btc_dma_state=dma_state(
            symbol="BTC",
            zone=zone,
            fgi_regime=regime,
            cross_event=cross_event,
            actionable_cross_event=cross_event,
        ),
        eth_dma_state=None,
        current_asset_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        current_date=date(2025, 1, 1) + timedelta(days=day - 1),
    )


def _context(*, day: int, price: float, portfolio: Portfolio) -> StrategyContext:
    return StrategyContext(
        date=date(2025, 1, 1) + timedelta(days=day - 1),
        price=price,
        sentiment={"label": "extreme_fear", "value": 10},
        price_history=[price],
        portfolio=portfolio,
    )


def _hold_action() -> StrategyAction:
    return StrategyAction(snapshot=make_strategy_snapshot(reason="hold"))


def test_experiment_matrix_and_windows_are_pinned() -> None:
    configs = experiment_configs()

    assert len(configs) == 27
    assert len({leverage_config_id(config) for config in configs}) == 27
    assert [window.name for window in experiment_windows(date(2026, 8, 19))] == [
        "full_500d",
        "first_250d",
        "second_250d",
    ]


def test_research_strategy_is_not_registered() -> None:
    registered = {recipe.strategy_id for recipe in list_strategy_recipes()}
    resolved = resolved_leverage_config(LeverageConfig(mode="risk_on"))

    assert resolved.request_config_id not in registered
    assert resolved.strategy_id == "dma_fgi_portfolio_rules"


def test_invalid_ltv_threshold_order_is_rejected() -> None:
    with pytest.raises(ValueError, match="LTV thresholds"):
        LeverageConfig(target_ltv=0.70, max_ltv=0.60)


def test_risk_on_borrows_to_target_and_respects_releverage_band() -> None:
    strategy = LeveredRuleBasedPortfolioStrategy(
        total_capital=1_000.0,
        leverage=LeverageConfig(
            mode="risk_on",
            target_ltv=0.20,
            max_ltv=0.60,
            deleverage_trigger_ltv=0.70,
            liq_ltv=0.75,
            releverage_band=0.01,
        ),
    )
    portfolio = Portfolio(spot_balance=10.0)

    action = strategy.apply_leverage_overlay(
        context=_context(day=1, price=100.0, portfolio=portfolio),
        base_action=_hold_action(),
        state=_flat_state(day=1, zone="above"),
    )

    assert action.debt_delta_usd == pytest.approx(250.0)
    assert action.transfers == [TransferIntent("stable", "btc", 250.0)]

    portfolio = Portfolio(spot_balance=10.0, stable_balance=200.0, debt_balance=200.0)
    in_band = strategy.apply_leverage_overlay(
        context=_context(day=2, price=100.0, portfolio=portfolio),
        base_action=_hold_action(),
        state=_flat_state(day=2, zone="above", cross_event="cross_up"),
    )
    assert in_band.debt_delta_usd == pytest.approx(0.0)


def test_fear_dip_respects_cooldown_and_sell_decision_repayment_priority() -> None:
    strategy = LeveredRuleBasedPortfolioStrategy(
        total_capital=1_000.0,
        leverage=LeverageConfig(
            mode="fear_dip",
            dip_borrow_fraction=0.10,
            dip_cooldown_days=7,
        ),
    )
    portfolio = Portfolio(spot_balance=10.0)
    fear_state = _flat_state(day=1, zone="below", regime="extreme_fear")

    first = strategy.apply_leverage_overlay(
        context=_context(day=1, price=100.0, portfolio=portfolio),
        base_action=_hold_action(),
        state=fear_state,
    )
    second = strategy.apply_leverage_overlay(
        context=_context(day=2, price=100.0, portfolio=portfolio),
        base_action=_hold_action(),
        state=_flat_state(day=2, zone="below", regime="extreme_fear"),
    )

    assert first.debt_delta_usd == pytest.approx(100.0)
    assert second.debt_delta_usd == pytest.approx(0.0)

    portfolio = Portfolio(spot_balance=10.0, debt_balance=200.0)
    base_sell = StrategyAction(
        snapshot=make_strategy_snapshot(action="sell", reason="dca_sell"),
        transfers=[TransferIntent("btc", "stable", 200.0)],
    )
    repayment = strategy.apply_leverage_overlay(
        context=_context(day=3, price=100.0, portfolio=portfolio),
        base_action=base_sell,
        state=_flat_state(day=3, zone="below"),
    )
    assert repayment.transfers == base_sell.transfers
    assert repayment.debt_delta_usd == pytest.approx(-200.0)


def test_46_day_fear_borrow_crash_liquidation_path() -> None:
    strategy = LeveredRuleBasedPortfolioStrategy(
        total_capital=1_000.0,
        leverage=LeverageConfig(
            mode="fear_dip",
            dip_borrow_fraction=0.10,
            dip_cooldown_days=100,
            liq_ltv=0.75,
        ),
    )
    engine = StrategyEngine(EngineConfig())
    portfolio = Portfolio(
        spot_balance=10.0,
        cost_model=PercentageSlippageModel(percent=0.0),
    )

    for day in range(1, 47):
        price = 100.0 if day < 46 else 10.0
        context = _context(day=day, price=price, portfolio=portfolio)
        action = strategy.apply_leverage_overlay(
            context=context,
            base_action=_hold_action(),
            state=_flat_state(day=day, zone="below", regime="extreme_fear"),
        )
        engine._apply_action(portfolio, context, action)
        strategy.record_day(
            context, action, {"borrow_cost": 0.0}, bool(action.transfers)
        )

    assert strategy.leverage_log[0]["event"] == "fear_dip_borrow"
    assert strategy.leverage_log[-1]["event"] == "liquidation"
    metrics = strategy.finalize().metrics
    assert metrics["liquidation_count"] == 1
    assert metrics["max_ltv"] > 0.75
    assert portfolio.debt_balance == pytest.approx(0.0)
    assert portfolio.stable_balance == pytest.approx(0.0)


def test_main_skips_without_read_only_database(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Any,
) -> None:
    monkeypatch.delenv("DATABASE_READ_ONLY_URL", raising=False)

    assert main(["--report-dir", str(tmp_path)]) == 0
    assert list(tmp_path.iterdir()) == []

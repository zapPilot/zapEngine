from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
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
    eth_btc_ratio: float | None = None,
    eth_btc_ratio_dma_200: float | None = None,
) -> StrategyContext:
    extra_data: dict[str, object] = {
        DMA_200_FEATURE: dma["btc"],
        ETH_DMA_200_FEATURE: dma["eth"],
        SPY_DMA_200_FEATURE: dma["spy"],
    }
    if eth_btc_ratio is not None:
        extra_data[ETH_BTC_RATIO_FEATURE] = eth_btc_ratio
    if eth_btc_ratio_dma_200 is not None:
        extra_data[ETH_BTC_RATIO_DMA_200_FEATURE] = eth_btc_ratio_dma_200
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


def test_strategy_cross_down_cooldown_blocks_next_cross_up() -> None:
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
    cross_down_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 110.0, "eth": 110.0, "spy": 110.0},
    )
    stable_portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        prices,
    )
    cross_up_context = _context(
        context_date=date(2025, 1, 3),
        portfolio=stable_portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 110.0, "spy": 110.0},
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    cross_down = strategy.on_day(cross_down_context)
    cross_up = strategy.on_day(cross_up_context)

    assert cross_down.snapshot.decision.reason == "portfolio_cross_down_exit"
    assert cross_down.snapshot.signal.dma is not None
    assert cross_down.snapshot.signal.dma.cooldown_blocked_zone == "above"
    assert cross_up.snapshot.decision.reason == "regime_no_signal"
    assert cross_up.snapshot.decision.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    )


def test_per_symbol_cross_down_cooldown_rearms_spy_before_btc() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.40, "eth": 0.0, "spy": 0.40, "stable": 0.20},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 110.0, "spy": 90.0},
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    first_cross_down = _step_signal(strategy, _portfolio_rules_context(warmup_context, 1, 110.0))

    for offset in range(2, 8):
        _step_signal(strategy, _portfolio_rules_context(warmup_context, offset, 110.0))
    _step_signal(strategy, _portfolio_rules_context(warmup_context, 8, 90.0))
    _step_signal(strategy, _portfolio_rules_context(warmup_context, 9, 90.0))
    second_cross_down = _step_signal(
        strategy,
        _portfolio_rules_context(warmup_context, 10, 110.0),
    )

    assert first_cross_down.spy_dma_state is not None
    assert first_cross_down.btc_dma_state is not None
    assert first_cross_down.spy_dma_state.actionable_cross_event == "cross_down"
    assert first_cross_down.btc_dma_state.actionable_cross_event == "cross_down"
    assert second_cross_down.spy_dma_state is not None
    assert second_cross_down.btc_dma_state is not None
    assert second_cross_down.spy_dma_state.cross_event == "cross_down"
    assert second_cross_down.btc_dma_state.cross_event == "cross_down"
    assert second_cross_down.spy_dma_state.actionable_cross_event == "cross_down"
    assert second_cross_down.btc_dma_state.actionable_cross_event is None


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


def test_strategy_ratio_cross_up_rotates_btc_to_eth() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 99.0, "eth": 99.0, "spy": 99.0},
        eth_btc_ratio=0.05,
        eth_btc_ratio_dma_200=0.06,
    )
    live_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 99.0, "eth": 99.0, "spy": 99.0},
        eth_btc_ratio=0.07,
        eth_btc_ratio_dma_200=0.06,
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    action = strategy.on_day(live_context)

    assert action.snapshot.decision.reason == "portfolio_eth_btc_ratio_rotation_to_eth"
    assert action.snapshot.decision.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.40, "spy": 0.30, "stable": 0.30, "alt": 0.0}
    )


def test_eth_btc_rotation_swaps_btc_to_eth_on_2025_07_15_cross_up() -> None:
    """Canonical 2025-07-15 scenario: ETH/BTC ratio cross-up swaps BTC to ETH."""
    snapshot = _flat_minimum_state_with_ratio_cross_up(
        current_alloc={"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30}
    )
    policy = DmaFgiPortfolioRulesDecisionPolicy()

    intent = policy.decide(snapshot)

    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "eth_btc_ratio_rotation"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.40, "spy": 0.30, "stable": 0.30, "alt": 0.0}
    )


def test_strategy_ratio_cross_down_rotates_eth_to_btc() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.10, "eth": 0.30, "spy": 0.30, "stable": 0.30},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 99.0, "eth": 99.0, "spy": 99.0},
        eth_btc_ratio=0.07,
        eth_btc_ratio_dma_200=0.06,
    )
    live_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 99.0, "eth": 99.0, "spy": 99.0},
        eth_btc_ratio=0.05,
        eth_btc_ratio_dma_200=0.06,
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    action = strategy.on_day(live_context)

    assert action.snapshot.decision.reason == "portfolio_eth_btc_ratio_rotation_to_btc"
    assert action.snapshot.decision.target_allocation == pytest.approx(
        {"btc": 0.40, "eth": 0.0, "spy": 0.30, "stable": 0.30, "alt": 0.0}
    )


def test_strategy_ratio_rotation_cooldown_blocks_second_cross() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    dma = {"btc": 99.0, "eth": 99.0, "spy": 99.0}
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma=dma,
        eth_btc_ratio=0.05,
        eth_btc_ratio_dma_200=0.06,
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    first_cross = strategy.on_day(
        _context(
            context_date=date(2025, 1, 2),
            portfolio=portfolio,
            prices=prices,
            dma=dma,
            eth_btc_ratio=0.07,
            eth_btc_ratio_dma_200=0.06,
        )
    )
    blocked_cross = strategy.on_day(
        _context(
            context_date=date(2025, 1, 3),
            portfolio=portfolio,
            prices=prices,
            dma=dma,
            eth_btc_ratio=0.05,
            eth_btc_ratio_dma_200=0.06,
        )
    )
    for offset in range(4, 33):
        strategy.on_day(
            _context(
                context_date=date(2025, 1, 1) + timedelta(days=offset - 1),
                portfolio=portfolio,
                prices=prices,
                dma=dma,
                eth_btc_ratio=0.07,
                eth_btc_ratio_dma_200=0.06,
            )
        )
    resumed_cross = strategy.on_day(
        _context(
            context_date=date(2025, 2, 2),
            portfolio=portfolio,
            prices=prices,
            dma=dma,
            eth_btc_ratio=0.05,
            eth_btc_ratio_dma_200=0.06,
        )
    )

    assert first_cross.snapshot.decision.reason == (
        "portfolio_eth_btc_ratio_rotation_to_eth"
    )
    assert blocked_cross.snapshot.signal is not None
    assert blocked_cross.snapshot.signal.ratio is not None
    assert blocked_cross.snapshot.signal.ratio.cross_event == "cross_down"
    assert blocked_cross.snapshot.signal.ratio.cooldown_active is True
    assert blocked_cross.snapshot.decision.reason == "regime_no_signal"
    assert resumed_cross.snapshot.decision.reason == (
        "portfolio_eth_btc_ratio_rotation_to_btc"
    )


def test_extreme_fear_gated_by_cross_down_cycle() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy()
    current = {"btc": 0.05, "eth": 0.0, "spy": 0.0, "stable": 0.95, "alt": 0.0}

    pre_cycle = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="extreme_fear",
            ),
            current=current,
        )
    )
    cross_down = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                cross_event="cross_down",
                actionable_cross_event="cross_down",
                fgi_regime="extreme_fear",
            ),
            current=current,
        )
    )
    open_cycle_dca = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="extreme_fear",
            ),
            current=current,
        )
    )
    cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
                fgi_regime="extreme_fear",
            ),
            current=current,
        )
    )
    closed_cycle = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                fgi_regime="extreme_fear",
            ),
            current=current,
        )
    )

    assert pre_cycle.reason == "regime_no_signal"
    assert cross_down.reason == "portfolio_cross_down_exit"
    assert open_cycle_dca.reason == "portfolio_extreme_fear_dca_buy"
    assert cross_up.reason == "portfolio_cross_up_equal_weight"
    assert closed_cycle.reason == "regime_no_signal"


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


def _flat_minimum_state_with_ratio_cross_up(
    *,
    current_alloc: dict[str, float],
) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=state(symbol="SPY"),
        btc_dma_state=state(symbol="BTC"),
        eth_dma_state=state(symbol="ETH"),
        current_asset_allocation=current_alloc,
        eth_btc_ratio_state=EthBtcRatioState(
            ratio=0.07,
            ratio_dma_200=0.06,
            zone="above",
            cross_event="cross_up",
            actionable_cross_event="cross_up",
            cooldown_state=DmaCooldownState(
                active=False,
                remaining_days=0,
                blocked_zone=None,
            ),
        ),
    )


def _portfolio_rules_context(
    base_context: StrategyContext,
    offset_days: int,
    dma_value: float,
) -> StrategyContext:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    return _context(
        context_date=base_context.date + timedelta(days=offset_days),
        portfolio=base_context.portfolio,
        prices=prices,
        dma={"btc": dma_value, "eth": 110.0, "spy": dma_value},
    )


def _step_signal(
    strategy: DmaFgiPortfolioRulesStrategy,
    context: StrategyContext,
) -> FlatMinimumState:
    snapshot = strategy.signal_component.observe(context)
    intent = strategy.decision_policy.decide(snapshot)
    strategy.signal_component.apply_intent(
        current_date=context.date,
        snapshot=snapshot,
        intent=intent,
    )
    return snapshot


def test_strategy_cooldown_cross_up_falls_through_to_extreme_fear_dca() -> None:
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
    cross_down_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 110.0, "eth": 110.0, "spy": 110.0},
    )
    stable_portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        prices,
    )
    extreme_fear_fgi: dict[str, object] = {"label": "extreme_fear", "value": 15}
    extreme_fear_context = _context(
        context_date=date(2025, 1, 3),
        portfolio=stable_portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 110.0, "spy": 110.0},
        sentiment=extreme_fear_fgi,
        macro_fgi=extreme_fear_fgi,
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    cross_down = strategy.on_day(cross_down_context)
    extreme_fear_dca = strategy.on_day(extreme_fear_context)

    assert cross_down.snapshot.decision.reason == "portfolio_cross_down_exit"
    assert cross_down.snapshot.signal.dma is not None
    assert cross_down.snapshot.signal.dma.cooldown_blocked_zone == "above"
    assert extreme_fear_dca.snapshot.decision.reason == "portfolio_extreme_fear_dca_buy"
    assert extreme_fear_dca.snapshot.decision.diagnostics is not None
    assert (
        "BTC" in extreme_fear_dca.snapshot.decision.diagnostics["portfolio_rule_assets"]
    )

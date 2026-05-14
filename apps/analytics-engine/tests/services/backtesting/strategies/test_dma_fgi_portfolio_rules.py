from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.rule_based.allocation_executor import (
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    DmaFgiPortfolioRulesDecisionPolicy,
    build_portfolio_rules_for_params,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from src.services.backtesting.strategies.base import StrategyContext, TransferIntent
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaFgiPortfolioRulesStrategy,
    DmaGatedFgiParams,
)
from tests.services.backtesting.portfolio_rules.helpers import state


def test_strategy_params_wire_disabled_rules_into_decision_policy() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {"disabled_rules": ["cross_down_exit"]}
    )

    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0, params=params)

    assert strategy.decision_policy.disabled_rules == frozenset({"cross_down_exit"})
    assert "cross_down_exit" not in [
        rule.name for rule in build_portfolio_rules_for_params(params)
    ]


def test_strategy_params_wire_cross_up_filters_into_rule() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {
            "cross_up_fgi_slope_min": 0.05,
            "cross_up_drawdown_amplifier_alpha": 0.5,
            "cross_up_drawdown_amplifier_threshold": 0.25,
        }
    )

    cross_up_rule = next(
        rule
        for rule in build_portfolio_rules_for_params(params, include_inactive=True)
        if isinstance(rule, CrossUpEqualWeightRule)
    )

    assert cross_up_rule.fgi_slope_min == 0.05
    assert cross_up_rule.drawdown_amplifier_alpha == 0.5
    assert cross_up_rule.drawdown_amplifier_threshold == 0.25


def test_strategy_params_wire_overextension_multipliers_into_rule() -> None:
    params = DmaGatedFgiParams.from_public_params(
        {
            "overextension_threshold_multiplier_greed": 0.67,
            "overextension_threshold_multiplier_extreme_greed": 0.50,
        }
    )

    overextension_rule = next(
        rule
        for rule in build_portfolio_rules_for_params(params, include_inactive=True)
        if isinstance(rule, DmaOverextensionDcaSellRule)
    )

    assert overextension_rule.overextension_threshold_multiplier_greed == 0.67
    assert overextension_rule.overextension_threshold_multiplier_extreme_greed == 0.50


def test_strategy_feature_summary_reflects_default_active_rules() -> None:
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)

    assert strategy.feature_summary() == {
        "policy": "DmaFgiPortfolioRulesStrategy",
        "active_features": [
            "portfolio_level_rules",
            "cross_down_exit",
            "cross_up_equal_weight",
            "eth_btc_ratio_rotation",
            "eth_btc_deviation_dca",
            "dma_overextension_dca_sell",
            "fgi_downshift_dca_sell",
        ],
        "ratio_rotation": True,
        "research_only": True,
    }


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


def test_strategy_cross_down_exits_crypto_peers_to_stable() -> None:
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


def test_strategy_uses_rule_based_executor_without_legacy_pacing() -> None:
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)

    assert isinstance(strategy.execution_engine, RuleBasedAllocationExecutor)
    assert not hasattr(strategy.execution_engine, "pacing_policy")
    assert not hasattr(strategy.execution_engine, "plugins")


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


def test_crypto_peer_cross_down_starts_peer_cooldown_for_reentry() -> None:
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.30, "spy": 0.0, "stable": 0.70},
        prices,
    )
    stable_portfolio = Portfolio.from_asset_allocation(
        10_000.0,
        {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
        prices,
    )
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)
    warmup_context = _context(
        context_date=date(2025, 1, 1),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 90.0, "eth": 90.0, "spy": 90.0},
    )
    btc_cross_down_context = _context(
        context_date=date(2025, 1, 2),
        portfolio=portfolio,
        prices=prices,
        dma={"btc": 110.0, "eth": 90.0, "spy": 90.0},
    )
    eth_below_context = _context(
        context_date=date(2025, 1, 3),
        portfolio=stable_portfolio,
        prices=prices,
        dma={"btc": 110.0, "eth": 110.0, "spy": 90.0},
    )
    eth_cross_up_context = _context(
        context_date=date(2025, 1, 4),
        portfolio=stable_portfolio,
        prices=prices,
        dma={"btc": 110.0, "eth": 90.0, "spy": 90.0},
    )

    strategy.initialize(portfolio, None, warmup_context)
    strategy.warmup_day(warmup_context)
    btc_cross_down = strategy.signal_component.observe(btc_cross_down_context)
    btc_cross_down_intent = strategy.decision_policy.decide(btc_cross_down)
    committed_cross_down = strategy.signal_component.apply_intent(
        current_date=btc_cross_down_context.date,
        snapshot=btc_cross_down,
        intent=btc_cross_down_intent,
    )
    strategy.decision_policy.record_execution(
        context=btc_cross_down_context,
        intent=btc_cross_down_intent,
        execution=ExecutionOutcome(
            event="rebalance",
            transfers=[
                TransferIntent(
                    from_bucket="eth",
                    to_bucket="stable",
                    amount_usd=3_000.0,
                )
            ],
        ),
    )
    eth_below = _step_signal(strategy, eth_below_context)
    eth_cross_up = _step_signal(strategy, eth_cross_up_context)

    assert btc_cross_down_intent.reason == "portfolio_cross_down_exit"
    assert btc_cross_down.btc_dma_state is not None
    assert btc_cross_down.eth_dma_state is not None
    assert btc_cross_down.btc_dma_state.actionable_cross_event == "cross_down"
    assert btc_cross_down.eth_dma_state.actionable_cross_event is None
    assert committed_cross_down.eth_dma_state is not None
    assert committed_cross_down.eth_dma_state.cross_event is None
    assert committed_cross_down.eth_dma_state.actionable_cross_event is None
    assert committed_cross_down.eth_dma_state.cooldown_state.active is True
    assert committed_cross_down.eth_dma_state.cooldown_state.blocked_zone == "above"
    assert eth_below.eth_dma_state is not None
    assert eth_below.eth_dma_state.cross_event == "cross_down"
    assert eth_cross_up.eth_dma_state is not None
    assert eth_cross_up.eth_dma_state.cross_event == "cross_up"
    assert eth_cross_up.eth_dma_state.actionable_cross_event is None
    assert eth_cross_up.eth_dma_state.cooldown_state.active is True
    assert eth_cross_up.eth_dma_state.cooldown_state.blocked_zone == "above"


def test_cross_down_cooldown_keeps_spy_and_btc_blocked_for_default_window() -> None:
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
    first_cross_down = _step_signal(
        strategy, _portfolio_rules_context(warmup_context, 1, 110.0)
    )

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
    assert second_cross_down.spy_dma_state.actionable_cross_event is None
    assert second_cross_down.btc_dma_state.actionable_cross_event is None
    assert second_cross_down.spy_dma_state.cooldown_state.active is True
    assert second_cross_down.btc_dma_state.cooldown_state.active is True
    assert second_cross_down.spy_dma_state.cooldown_state.remaining_days == 5
    assert second_cross_down.btc_dma_state.cooldown_state.remaining_days == 21


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


def test_strategy_ratio_cross_up_rotates_btc_and_stable_to_eth() -> None:
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
        {"btc": 0.0, "eth": 0.70, "spy": 0.30, "stable": 0.0, "alt": 0.0}
    )


def test_portfolio_rules_swap_btc_to_eth_on_2025_07_15_cross_up() -> None:
    """Canonical 2025-07-15 scenario: ETH/BTC ratio cross-up swaps BTC to ETH."""
    snapshot = _flat_minimum_state_with_ratio_cross_up(
        current_alloc={"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30}
    )
    policy = DmaFgiPortfolioRulesDecisionPolicy()

    intent = policy.decide(snapshot)

    assert intent.diagnostics is not None
    assert intent.diagnostics["matched_rule_name"] == "eth_btc_ratio_rotation"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.70, "spy": 0.30, "stable": 0.0, "alt": 0.0}
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


def test_spy_cross_down_does_not_open_crypto_cycle() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy()
    current = {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}

    spy_cross_down = policy.decide(
        _flat_state(
            spy=state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                cross_event="cross_down",
                actionable_cross_event="cross_down",
                fgi_regime="neutral",
            ),
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.10,
                fgi_regime="neutral",
            ),
            eth=state(
                symbol="ETH",
                zone="below",
                dma_distance=-0.20,
                fgi_regime="neutral",
            ),
            current=current,
        )
    )
    crypto_extreme_fear = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.10,
                fgi_regime="extreme_fear",
            ),
            eth=state(
                symbol="ETH",
                zone="below",
                dma_distance=-0.20,
                fgi_regime="extreme_fear",
            ),
            current=current,
        )
    )

    assert spy_cross_down.reason == "portfolio_cross_down_exit"
    assert crypto_extreme_fear.reason == "regime_no_signal"


def test_per_rule_cooldown_skips_only_that_rule_after_execution() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=(CrossUpEqualWeightRule(cooldown_days=7),),
    )
    current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    first_buy = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            current=current,
            current_date=date(2025, 3, 11),
        )
    )

    policy.record_execution(
        context=StrategyContext(
            date=date(2025, 3, 11),
            price=100.0,
            sentiment={"label": "neutral", "value": 50},
            price_history=[100.0],
            portfolio=Portfolio.from_asset_allocation(
                10_000.0, current, {"btc": 100.0}
            ),
            price_map={"btc": 100.0},
            extra_data={},
        ),
        intent=first_buy,
        execution=ExecutionOutcome(
            event="rebalance",
            transfers=[
                TransferIntent(
                    from_bucket="stable",
                    to_bucket="btc",
                    amount_usd=500.0,
                )
            ],
        ),
    )
    skipped_buy = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            current=current,
            current_date=date(2025, 3, 12),
        )
    )

    assert first_buy.reason == "portfolio_cross_up_equal_weight"
    assert skipped_buy.reason == "regime_no_signal"
    assert skipped_buy.diagnostics is not None
    assert skipped_buy.diagnostics["cooldown_skipped_rules"] == [
        {
            "rule": "cross_up_equal_weight",
            "cooldown_days": 7,
            "remaining_days": 6,
            "trigger_symbols": ["BTC"],
            "symbol_cooldowns": [
                {
                    "symbol": "BTC",
                    "last_executed_at": "2025-03-11",
                    "remaining_days": 6,
                }
            ],
        }
    ]


def test_per_rule_cooldown_requires_actual_transfers() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=(CrossUpEqualWeightRule(cooldown_days=7),),
    )
    current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
    first_buy = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            current=current,
            current_date=date(2025, 3, 11),
        )
    )

    policy.record_execution(
        context=StrategyContext(
            date=date(2025, 3, 11),
            price=100.0,
            sentiment={"label": "neutral", "value": 50},
            price_history=[100.0],
            portfolio=Portfolio.from_asset_allocation(
                10_000.0, current, {"btc": 100.0}
            ),
            price_map={"btc": 100.0},
            extra_data={},
        ),
        intent=first_buy,
        execution=ExecutionOutcome(event=None, transfers=[]),
    )
    second_buy = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            current=current,
            current_date=date(2025, 3, 12),
        )
    )

    assert first_buy.reason == "portfolio_cross_up_equal_weight"
    assert second_buy.reason == "portfolio_cross_up_equal_weight"


@pytest.mark.parametrize(
    ("trigger_symbol", "target_key"), [("SPY", "spy"), ("ETH", "eth")]
)
def test_cross_up_equal_weight_cooldown_allows_different_trigger_symbol(
    trigger_symbol: str,
    target_key: str,
) -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(rules=(CrossUpEqualWeightRule(),))
    stable_current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}

    btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current=stable_current,
            current_date=date(2025, 1, 1),
        )
    )
    _record_rebalance(
        policy,
        intent=btc_cross_up,
        execution_date=date(2025, 1, 1),
        to_bucket="btc",
    )

    next_cross_up = policy.decide(
        _flat_state(
            btc=state(symbol="BTC", zone="above", dma_distance=0.05),
            spy=state(
                symbol="SPY",
                zone="above" if trigger_symbol == "SPY" else "below",
                dma_distance=0.05 if trigger_symbol == "SPY" else -0.05,
                cross_event="cross_up" if trigger_symbol == "SPY" else None,
                actionable_cross_event="cross_up" if trigger_symbol == "SPY" else None,
            ),
            eth=state(
                symbol="ETH",
                zone="above" if trigger_symbol == "ETH" else "below",
                dma_distance=0.05 if trigger_symbol == "ETH" else -0.05,
                cross_event="cross_up" if trigger_symbol == "ETH" else None,
                actionable_cross_event="cross_up" if trigger_symbol == "ETH" else None,
            ),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 1, 21),
        )
    )

    assert btc_cross_up.reason == "portfolio_cross_up_equal_weight"
    assert next_cross_up.reason == "portfolio_cross_up_equal_weight"
    assert next_cross_up.target_allocation is not None
    assert next_cross_up.target_allocation[target_key] > 0.0
    assert next_cross_up.diagnostics is not None
    assert next_cross_up.diagnostics["portfolio_rule_trigger_assets"] == [
        trigger_symbol
    ]


def test_cross_up_equal_weight_cooldown_skips_same_trigger_symbol() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(rules=(CrossUpEqualWeightRule(),))
    stable_current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}

    first_btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current=stable_current,
            current_date=date(2025, 1, 1),
        )
    )
    _record_rebalance(
        policy,
        intent=first_btc_cross_up,
        execution_date=date(2025, 1, 1),
        to_bucket="btc",
    )

    retry_btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 1, 21),
        )
    )

    assert first_btc_cross_up.reason == "portfolio_cross_up_equal_weight"
    assert retry_btc_cross_up.reason == "regime_no_signal"
    assert retry_btc_cross_up.diagnostics is not None
    assert retry_btc_cross_up.diagnostics["cooldown_skipped_rules"] == [
        {
            "rule": "cross_up_equal_weight",
            "cooldown_days": 30,
            "remaining_days": 10,
            "trigger_symbols": ["BTC"],
            "symbol_cooldowns": [
                {
                    "symbol": "BTC",
                    "last_executed_at": "2025-01-01",
                    "remaining_days": 10,
                }
            ],
        }
    ]


def test_cross_up_equal_weight_cooldown_allows_same_symbol_after_expiry() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(rules=(CrossUpEqualWeightRule(),))
    stable_current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}

    first_btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current=stable_current,
            current_date=date(2025, 1, 1),
        )
    )
    _record_rebalance(
        policy,
        intent=first_btc_cross_up,
        execution_date=date(2025, 1, 1),
        to_bucket="btc",
    )

    expired_btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 1, 31),
        )
    )

    assert first_btc_cross_up.reason == "portfolio_cross_up_equal_weight"
    assert expired_btc_cross_up.reason == "portfolio_cross_up_equal_weight"


def test_cross_up_equal_weight_per_symbol_cooldown_requires_actual_transfers() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(rules=(CrossUpEqualWeightRule(),))
    stable_current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}

    first_btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current=stable_current,
            current_date=date(2025, 1, 1),
        )
    )
    policy.record_execution(
        context=_execution_context(date(2025, 1, 1)),
        intent=first_btc_cross_up,
        execution=ExecutionOutcome(event=None, transfers=[]),
    )

    retry_btc_cross_up = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.05,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            spy=state(symbol="SPY", zone="below", dma_distance=-0.05),
            eth=state(symbol="ETH", zone="below", dma_distance=-0.05),
            current=stable_current,
            current_date=date(2025, 1, 2),
        )
    )

    assert first_btc_cross_up.reason == "portfolio_cross_up_equal_weight"
    assert retry_btc_cross_up.reason == "portfolio_cross_up_equal_weight"


def test_strategy_wires_trade_quota_guard_from_params() -> None:
    strategy = DmaFgiPortfolioRulesStrategy(
        total_capital=10_000.0,
        params=DmaGatedFgiParams(min_trade_interval_days=3),
    )

    assert [guard.name for guard in strategy.decision_policy.risk_guards] == [
        "trade_quota",
    ]


def test_policy_receives_executor_trade_dates_for_quota_guards() -> None:
    strategy = DmaFgiPortfolioRulesStrategy(
        total_capital=10_000.0,
        params=DmaGatedFgiParams(min_trade_interval_days=3),
    )
    strategy.execution_engine.trade_dates.append(date(2025, 1, 1))
    strategy.execution_engine.last_trade_date = date(2025, 1, 1)

    intent = strategy.decision_policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="extreme_fear",
            ),
            current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
            current_date=date(2025, 1, 2),
        )
    )

    assert intent.reason == "trade_quota_min_interval_active"


def _execution_context(context_date: date) -> StrategyContext:
    current = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0}
    prices = {"btc": 100.0, "eth": 100.0, "spy": 100.0}
    return StrategyContext(
        date=context_date,
        price=100.0,
        sentiment={"label": "neutral", "value": 50},
        price_history=[100.0],
        portfolio=Portfolio.from_asset_allocation(10_000.0, current, prices),
        price_map=prices,
        extra_data={},
    )


def _record_rebalance(
    policy: DmaFgiPortfolioRulesDecisionPolicy,
    *,
    intent: AllocationIntent,
    execution_date: date,
    to_bucket: str,
) -> None:
    policy.record_execution(
        context=_execution_context(execution_date),
        intent=intent,
        execution=ExecutionOutcome(
            event="rebalance",
            transfers=[
                TransferIntent(
                    from_bucket="stable",
                    to_bucket=to_bucket,
                    amount_usd=500.0,
                )
            ],
        ),
    )


def _flat_state(
    *,
    btc: DmaMarketState,
    spy: DmaMarketState | None = None,
    eth: DmaMarketState | None = None,
    current: dict[str, float],
    current_date: date | None = None,
) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=spy or state(symbol="SPY"),
        btc_dma_state=btc,
        eth_dma_state=eth or state(symbol="ETH"),
        current_asset_allocation=current,
        current_date=current_date,
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

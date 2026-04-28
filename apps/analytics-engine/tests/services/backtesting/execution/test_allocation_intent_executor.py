"""Tests for the shared allocation-intent executor."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.dma_buy_gate_plugin import (
    DmaBuyGateExecutionPlugin,
)
from src.services.backtesting.execution.pacing.fgi_exponential import (
    FgiExponentialPacingPolicy,
)
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.trade_quota_guard_plugin import (
    TradeQuotaGuardExecutionPlugin,
)
from src.services.backtesting.strategies.base import StrategyContext


def _context(
    *,
    day: int,
    portfolio: Portfolio,
    price: float = 50_000.0,
    price_map: dict[str, float] | None = None,
) -> StrategyContext:
    return StrategyContext(
        date=date(2025, 1, day),
        price=price,
        sentiment={"label": "neutral", "value": 50},
        price_history=[price] * max(day, 2),
        portfolio=portfolio,
        price_map={} if price_map is None else dict(price_map),
        extra_data={"dma_200": 50_000.0},
    )


def _intent(
    *,
    action: str,
    reason: str,
    target_allocation: dict[str, float] | None,
    immediate: bool = False,
    rule_group: str = "dma_fgi",
    score: float = 0.0,
) -> AllocationIntent:
    return AllocationIntent(
        action=action,  # type: ignore[arg-type]
        target_allocation=target_allocation,
        allocation_name=reason,
        immediate=immediate,
        reason=reason,
        rule_group=rule_group,  # type: ignore[arg-type]
        decision_score=score,
    )


def _hints(
    *,
    action: str,
    regime: str = "neutral",
    fgi_value: float | None = None,
    dma_distance: float | None = None,
    score: float = 0.0,
    signal_id: str = "dma_gated_fgi",
    signal_confidence: float = 1.0,
    enable_buy_gate: bool = False,
    reset_buy_gate: bool = False,
) -> ExecutionHints:
    return ExecutionHints(
        signal_id=signal_id,
        current_regime=regime,
        signal_value=fgi_value,
        signal_confidence=signal_confidence,
        decision_score=score,
        decision_action=action,  # type: ignore[arg-type]
        dma_distance=dma_distance,
        fgi_slope=0.0,
        buy_strength=0.2 if enable_buy_gate else None,
        enable_buy_gate=enable_buy_gate,
        reset_buy_gate=reset_buy_gate,
    )


def _pacing(
    *, min_steps: int = 1, max_steps: int = 1, interval_days: int = 1
) -> FgiExponentialPacingPolicy:
    return FgiExponentialPacingPolicy(
        min_steps=min_steps,
        max_steps=max_steps,
        min_interval_days=interval_days,
        max_interval_days=interval_days,
    )


def _executor(*, with_buy_gate: bool = False) -> AllocationIntentExecutor:
    plugins = (DmaBuyGateExecutionPlugin(),) if with_buy_gate else ()
    return AllocationIntentExecutor(pacing_policy=_pacing(), plugins=plugins)


def _buy_gate_payload(execution) -> dict[str, object] | None:
    for diagnostic in execution.plugin_diagnostics:
        if diagnostic.plugin_id == "dma_buy_gate":
            return dict(diagnostic.payload)
    return None


def _trade_quota_payload(execution) -> dict[str, object] | None:
    for diagnostic in execution.plugin_diagnostics:
        if diagnostic.plugin_id == "trade_quota_guard":
            return dict(diagnostic.payload)
    return None


def test_executor_immediate_cross_rebalances_fully() -> None:
    executor = _executor()
    portfolio = Portfolio(spot_balance=1.0, stable_balance=0.0)
    intent = _intent(
        action="sell",
        reason="dma_cross_down",
        target_allocation={
            "btc": 0.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 1.0,
            "alt": 0.0,
        },
        immediate=True,
        rule_group="cross",
        score=-1.0,
    )
    hints = _hints(
        action="sell",
        regime="greed",
        fgi_value=72.0,
        dma_distance=-0.1,
        score=-1.0,
        reset_buy_gate=True,
    )

    executor.observe(hints)
    execution = executor.execute(
        context=_context(day=1, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.event == "rebalance"
    assert execution.immediate_execution is True
    assert execution.transfers is not None
    assert execution.transfers[0].from_bucket == "btc"
    assert execution.transfers[0].to_bucket == "stable"


def test_executor_buy_blocks_until_sideways_confirms() -> None:
    executor = _executor(with_buy_gate=True)
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="below_extreme_fear_buy",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        score=1.0,
    )
    hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.15,
        score=1.0,
        enable_buy_gate=True,
    )

    executor.observe(hints)
    execution = executor.execute(
        context=_context(day=1, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.event is None
    assert execution.block_reason == "sideways_not_confirmed"
    buy_gate = _buy_gate_payload(execution)
    assert buy_gate is not None
    assert buy_gate["sideways_confirmed"] is False


def test_executor_buy_gate_allows_btc_eth_rotation_without_stable_buy() -> None:
    executor = _executor(with_buy_gate=True)
    portfolio = Portfolio(
        stable_balance=5_000.0,
        btc_balance=0.025,
        eth_balance=0.5,
        spot_asset="BTC",
    )
    intent = _intent(
        action="buy",
        reason="below_extreme_fear_buy",
        target_allocation={"btc": 0.0, "eth": 1.0, "stable": 0.0},
        score=1.0,
    )
    hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.15,
        score=1.0,
        enable_buy_gate=True,
    )

    executor.observe(hints)
    execution = executor.execute(
        context=_context(
            day=1,
            portfolio=portfolio,
            price=100_000.0,
            price_map={"btc": 100_000.0, "eth": 5_000.0},
        ),
        intent=intent,
        hints=hints,
    )

    assert execution.event == "rebalance"
    assert execution.block_reason is None
    assert execution.transfers is not None
    assert len(execution.transfers) == 1
    assert execution.transfers[0].from_bucket == "btc"
    assert execution.transfers[0].to_bucket == "eth"
    assert execution.transfers[0].amount_usd == pytest.approx(2_500.0)
    buy_gate = _buy_gate_payload(execution)
    assert buy_gate is not None
    assert buy_gate["sideways_confirmed"] is False
    assert buy_gate["leg_spent_usd"] == pytest.approx(0.0)


def test_executor_buy_leg_one_is_capped_at_five_percent_nav() -> None:
    executor = _executor(with_buy_gate=True)
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="below_extreme_fear_buy",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        score=1.0,
    )
    hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.15,
        score=1.0,
        enable_buy_gate=True,
    )

    for _ in range(5):
        executor.observe(hints)

    execution = executor.execute(
        context=_context(day=5, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.event == "rebalance"
    assert execution.transfers is not None
    assert execution.transfers[0].amount_usd == pytest.approx(500.0)
    buy_gate = _buy_gate_payload(execution)
    assert buy_gate is not None
    assert buy_gate["leg_index"] == 1
    assert buy_gate["leg_cap_pct"] == pytest.approx(0.05)
    assert buy_gate["leg_spent_usd"] == pytest.approx(500.0)


def test_executor_trade_quota_allows_trade_when_within_limits() -> None:
    executor = AllocationIntentExecutor(
        pacing_policy=_pacing(),
        plugins=(
            TradeQuotaGuardExecutionPlugin(
                min_trade_interval_days=3,
                max_trades_7d=2,
                max_trades_30d=5,
            ),
        ),
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="quota_ok",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        immediate=True,
    )
    hints = _hints(action="buy", regime="fear", fgi_value=15.0, score=1.0)
    quota_plugin = executor.plugins[0]
    assert isinstance(quota_plugin, TradeQuotaGuardExecutionPlugin)
    quota_plugin.load_trade_dates([date(2025, 1, 1)])

    execution = executor.execute(
        context=_context(day=5, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.block_reason is None
    assert execution.transfers is not None
    quota = _trade_quota_payload(execution)
    assert quota is not None
    assert quota["trades_7d"] == 2
    assert quota["block_reason"] is None


def test_executor_trade_quota_blocks_min_interval_and_reports_next_date() -> None:
    executor = AllocationIntentExecutor(
        pacing_policy=_pacing(),
        plugins=(TradeQuotaGuardExecutionPlugin(min_trade_interval_days=3),),
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="quota_interval",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        immediate=True,
    )
    hints = _hints(action="buy", regime="fear", fgi_value=15.0, score=1.0)
    quota_plugin = executor.plugins[0]
    assert isinstance(quota_plugin, TradeQuotaGuardExecutionPlugin)
    quota_plugin.load_trade_dates([date(2025, 1, 1)])

    execution = executor.execute(
        context=_context(day=2, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.transfers is None
    assert execution.block_reason == "trade_quota_min_interval_active"
    quota = _trade_quota_payload(execution)
    assert quota is not None
    assert quota["next_trade_date"] == "2025-01-04"
    assert quota["days_since_last_trade"] == 1


def test_executor_trade_quota_blocks_weekly_limit() -> None:
    executor = AllocationIntentExecutor(
        pacing_policy=_pacing(),
        plugins=(TradeQuotaGuardExecutionPlugin(max_trades_7d=2),),
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="quota_week",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        immediate=True,
    )
    hints = _hints(action="buy", regime="fear", fgi_value=15.0, score=1.0)
    quota_plugin = executor.plugins[0]
    assert isinstance(quota_plugin, TradeQuotaGuardExecutionPlugin)
    quota_plugin.load_trade_dates([date(2025, 1, 1), date(2025, 1, 4)])

    execution = executor.execute(
        context=_context(day=5, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.transfers is None
    assert execution.block_reason == "trade_quota_7d_limit_reached"
    quota = _trade_quota_payload(execution)
    assert quota is not None
    assert quota["trades_7d"] == 2
    assert quota["next_trade_date"] == "2025-01-08"


def test_executor_trade_quota_blocks_monthly_limit() -> None:
    executor = AllocationIntentExecutor(
        pacing_policy=_pacing(),
        plugins=(TradeQuotaGuardExecutionPlugin(max_trades_30d=2),),
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="quota_month",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        immediate=True,
    )
    hints = _hints(action="buy", regime="fear", fgi_value=15.0, score=1.0)
    quota_plugin = executor.plugins[0]
    assert isinstance(quota_plugin, TradeQuotaGuardExecutionPlugin)
    quota_plugin.load_trade_dates([date(2025, 1, 1), date(2025, 1, 20)])

    execution = executor.execute(
        context=_context(day=21, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert execution.transfers is None
    assert execution.block_reason == "trade_quota_30d_limit_reached"
    quota = _trade_quota_payload(execution)
    assert quota is not None
    assert quota["trades_30d"] == 2
    assert quota["next_trade_date"] == "2025-01-31"


def test_executor_breakout_then_reconfirm_unlocks_second_leg() -> None:
    executor = _executor(with_buy_gate=True)
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    intent = _intent(
        action="buy",
        reason="below_extreme_fear_buy",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        score=1.0,
    )
    buy_hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.15,
        score=1.0,
        enable_buy_gate=True,
    )

    for _ in range(5):
        executor.observe(buy_hints)
    first = executor.execute(
        context=_context(day=5, portfolio=portfolio),
        intent=intent,
        hints=buy_hints,
    )
    assert first.transfers is not None

    for dma_distance in (-0.15, -0.05, -0.14, -0.04, -0.13):
        executor.observe(
            _hints(
                action="buy",
                regime="extreme_fear",
                fgi_value=10.0,
                dma_distance=dma_distance,
                score=1.0,
                enable_buy_gate=True,
            )
        )

    second_hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.25,
        score=1.0,
        enable_buy_gate=True,
    )
    for _ in range(5):
        executor.observe(second_hints)

    second = executor.execute(
        context=_context(day=15, portfolio=portfolio),
        intent=intent,
        hints=second_hints,
    )
    assert second.transfers is not None
    assert second.transfers[0].amount_usd == pytest.approx(1_000.0)
    second_buy_gate = _buy_gate_payload(second)
    assert second_buy_gate is not None
    assert second_buy_gate["leg_index"] == 2
    assert second_buy_gate["leg_cap_pct"] == pytest.approx(0.10)


def test_executor_target_already_reached_returns_noop() -> None:
    executor = _executor(with_buy_gate=True)
    portfolio = Portfolio(spot_balance=0.2, stable_balance=0.0)
    intent = _intent(
        action="buy",
        reason="below_extreme_fear_buy",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        score=1.0,
    )
    hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.20,
        score=1.0,
        enable_buy_gate=True,
    )

    execution = executor.execute(
        context=_context(day=1, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )
    assert execution.transfers is None
    assert execution.event is None
    assert execution.steps_remaining == 0


def test_executor_cross_reset_restarts_buy_ladder_at_leg_one() -> None:
    executor = _executor(with_buy_gate=True)
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)
    buy_intent = _intent(
        action="buy",
        reason="below_extreme_fear_buy",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        score=1.0,
    )
    buy_hints = _hints(
        action="buy",
        regime="extreme_fear",
        fgi_value=10.0,
        dma_distance=-0.15,
        score=1.0,
        enable_buy_gate=True,
    )

    for _ in range(5):
        executor.observe(buy_hints)
    first = executor.execute(
        context=_context(day=5, portfolio=portfolio),
        intent=buy_intent,
        hints=buy_hints,
    )
    first_buy_gate = _buy_gate_payload(first)
    assert first_buy_gate is not None
    assert first_buy_gate["leg_index"] == 1

    sell_intent = _intent(
        action="sell",
        reason="dma_cross_down",
        target_allocation={
            "btc": 0.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 1.0,
            "alt": 0.0,
        },
        immediate=True,
        rule_group="cross",
        score=-1.0,
    )
    sell_hints = _hints(
        action="sell",
        regime="greed",
        fgi_value=72.0,
        dma_distance=-0.10,
        score=-1.0,
        reset_buy_gate=True,
    )
    executor.observe(sell_hints)
    executor.execute(
        context=_context(day=6, portfolio=portfolio),
        intent=sell_intent,
        hints=sell_hints,
    )

    for _ in range(5):
        executor.observe(buy_hints)
    second = executor.execute(
        context=_context(day=11, portfolio=portfolio),
        intent=buy_intent,
        hints=buy_hints,
    )
    second_buy_gate = _buy_gate_payload(second)
    assert second_buy_gate is not None
    assert second_buy_gate["leg_index"] == 1


def test_executor_accepts_generic_non_dma_hints() -> None:
    executor = _executor()
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    intent = _intent(
        action="buy",
        reason="custom_policy_buy",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        score=0.8,
    )
    hints = _hints(
        action="buy",
        regime="custom_regime",
        fgi_value=None,
        dma_distance=None,
        score=0.8,
        signal_id="custom_signal",
        signal_confidence=0.7,
        enable_buy_gate=False,
    )

    execution = executor.execute(
        context=_context(day=1, portfolio=portfolio, price=100.0),
        intent=intent,
        hints=hints,
    )

    assert execution.event == "rebalance"
    assert execution.transfers is not None
    assert execution.transfers[0].from_bucket == "stable"
    assert execution.transfers[0].to_bucket == "btc"


# ---------------------------------------------------------------------------
# Targeted coverage tests for uncovered branches
# ---------------------------------------------------------------------------


class _WrongLengthPacingPolicy:
    """Always returns 1 weight regardless of step_count (triggers line 471)."""

    @property
    def name(self) -> str:
        return "wrong_length"

    def interval_days(self, inputs: object) -> int:
        return 1

    def step_count(self, inputs: object) -> int:
        return 3

    def step_weights(self, inputs: object, step_count: int) -> list[float]:
        return [1.0]  # Always length 1, not step_count


class _NegativeWeightsPacingPolicy:
    """Returns all-negative weights (triggers line 474 — sum(cleaned) <= 0)."""

    @property
    def name(self) -> str:
        return "negative_weights"

    def interval_days(self, inputs: object) -> int:
        return 1

    def step_count(self, inputs: object) -> int:
        return 2

    def step_weights(self, inputs: object, step_count: int) -> list[float]:
        return [-1.0] * step_count


def test_initialize_pacing_plan_falls_back_when_weights_length_wrong() -> None:
    """Cover line 471: wrong-length weights replaced with uniform 1.0s."""
    executor = AllocationIntentExecutor(pacing_policy=_WrongLengthPacingPolicy())  # type: ignore[arg-type]
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    intent = _intent(
        action="buy",
        reason="test",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
    )
    hints = _hints(action="buy", regime="neutral", fgi_value=50.0, score=0.5)

    result = executor.execute(
        context=_context(day=1, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert result is not None
    assert result.transfers is not None or result.event is not None


def test_initialize_pacing_plan_falls_back_when_all_weights_negative() -> None:
    """Cover line 474: sum(cleaned) <= 0 replaced with uniform 1.0s."""
    executor = AllocationIntentExecutor(pacing_policy=_NegativeWeightsPacingPolicy())  # type: ignore[arg-type]
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    intent = _intent(
        action="buy",
        reason="test",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
    )
    hints = _hints(action="buy", regime="neutral", fgi_value=50.0, score=0.5)

    result = executor.execute(
        context=_context(day=1, portfolio=portfolio),
        intent=intent,
        hints=hints,
    )

    assert result is not None


def test_extract_realized_volatility_skips_zero_price_pairs() -> None:
    """Cover line 498: zero price in history causes pair to be skipped."""
    portfolio = Portfolio(spot_balance=1.0, stable_balance=0.0)
    context = StrategyContext(
        date=date(2025, 1, 15),
        price=50_000.0,
        sentiment=None,
        price_history=[0.0, 100.0, 200.0],
        portfolio=portfolio,
    )
    vol = AllocationIntentExecutor._extract_realized_volatility(context)
    assert vol is None  # only 1 valid return pair remains, < 2 required


def test_build_step_plan_for_current_step_returns_zeros_when_no_steps_remain() -> None:
    """Cover line 616: steps_remaining <= 0 → all-zero step plan."""
    executor = _executor()
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    executor.steps_remaining = 0
    result = executor._build_step_plan_for_current_step(
        context=_context(day=1, portfolio=portfolio),
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
    )
    assert result == {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0}


def test_fraction_for_step_fallback_when_no_plan_weights() -> None:
    """Cover line 643: fallback 1/fallback_steps when weight lists are empty."""
    executor = _executor()
    fraction = executor._fraction_for_step(0, 5)
    assert fraction == pytest.approx(1.0 / 5)


def test_rotation_trade_sets_last_rotation_trade_date() -> None:
    """Cover line 207: rotation rule_group sets _last_rotation_trade_date."""
    executor = AllocationIntentExecutor(
        pacing_policy=_pacing(interval_days=1),
        rotation_cooldown_days=7,
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)

    intent_rotation = _intent(
        action="buy",
        reason="rotate",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        immediate=True,
        rule_group="rotation",
    )
    ctx = _context(day=1, portfolio=portfolio)
    hints_buy = _hints(action="buy")
    executor.observe(hints_buy)
    executor.execute(context=ctx, intent=intent_rotation, hints=hints_buy)
    assert executor._last_rotation_trade_date == date(2025, 1, 1)


def test_rotation_cooldown_blocks_trade() -> None:
    """Cover line 579: rotation cooldown returns False."""
    executor = AllocationIntentExecutor(
        pacing_policy=_pacing(interval_days=1),
        rotation_cooldown_days=7,
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)

    # First rotation trade (immediate) to set the cooldown date
    intent_first = _intent(
        action="buy",
        reason="rotate",
        target_allocation={
            "btc": 1.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        },
        immediate=True,
        rule_group="rotation",
    )
    ctx1 = _context(day=1, portfolio=portfolio)
    hints_buy = _hints(action="buy")
    executor.observe(hints_buy)
    executor.execute(context=ctx1, intent=intent_first, hints=hints_buy)

    # Second rotation trade within cooldown, NOT immediate so interval check runs
    intent_second = _intent(
        action="buy",
        reason="rotate",
        target_allocation={
            "btc": 0.8,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.2,
            "alt": 0.0,
        },
        immediate=False,
        rule_group="rotation",
    )
    ctx2 = _context(day=3, portfolio=portfolio)
    executor.observe(hints_buy)
    result = executor.execute(context=ctx2, intent=intent_second, hints=hints_buy)
    assert result.transfers is None

"""Targeted coverage tests for dma_buy_gate_plugin.py."""

from __future__ import annotations

from datetime import date
from unittest.mock import Mock

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.dma_buy_gate_plugin import (
    DmaBuyGateExecutionPlugin,
)
from src.services.backtesting.execution.plugins import PluginInvocation
from src.services.backtesting.strategies.base import StrategyContext, TransferIntent


def _make_buy_intent(immediate: bool = False) -> AllocationIntent:
    return AllocationIntent(
        action="buy",
        target_allocation={
            "btc": 0.8,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 0.2,
            "alt": 0.0,
        },
        allocation_name="high",
        immediate=immediate,
        reason="test",
        rule_group="dma_fgi",
        decision_score=0.8,
    )


def _make_hints(enable: bool = True) -> ExecutionHints:
    return ExecutionHints(
        signal_id="dma_gated_fgi_signal",
        current_regime="fear",
        signal_value=0.5,
        signal_confidence=1.0,
        decision_score=0.8,
        decision_action="buy",
        dma_distance=-0.15,
        enable_buy_gate=enable,
        buy_strength=0.6,
    )


def _make_context() -> StrategyContext:
    mock_portfolio = Mock()
    mock_portfolio.total_value = Mock(return_value=10_000.0)
    return StrategyContext(
        date=date(2025, 1, 1),
        price=50_000.0,
        sentiment=None,
        price_history=[50_000.0],
        portfolio=mock_portfolio,
    )


def test_after_execution_zero_buy_returns_diagnostic_without_clear_plan() -> None:
    """Lines 109-110: when executed_buy <= 0, return diagnostics without clear_plan."""
    plugin = DmaBuyGateExecutionPlugin()

    # Prime the gate with sideways confirmation
    for v in (-0.15, -0.16, -0.14, -0.15, -0.16):
        plugin._gate.observe_dma_distance(v)

    context = _make_context()
    hints = _make_hints(enable=True)
    intent = _make_buy_intent()
    invocation = PluginInvocation(context=context, intent=intent, hints=hints)

    # Pass empty transfer list → executed_buy = 0
    result = plugin.after_execution(invocation, transfers=[])

    assert result.clear_plan is False
    assert len(result.diagnostics) == 1


def test_after_execution_positive_buy_records_and_clears_plan() -> None:
    """For comparison: positive buy should set clear_plan=True."""
    plugin = DmaBuyGateExecutionPlugin()

    for v in (-0.15, -0.16, -0.14, -0.15, -0.16):
        plugin._gate.observe_dma_distance(v)

    context = _make_context()
    hints = _make_hints(enable=True)
    intent = _make_buy_intent()
    invocation = PluginInvocation(context=context, intent=intent, hints=hints)

    transfers = [
        TransferIntent(from_bucket="stable", to_bucket="spot", amount_usd=500.0)
    ]
    result = plugin.after_execution(invocation, transfers=transfers)

    assert result.clear_plan is True
    assert len(result.diagnostics) == 1


def test_resolve_deltas_with_none_target_allocation() -> None:
    """Line 173: target_allocation=None returns empty dict."""
    plugin = DmaBuyGateExecutionPlugin()
    intent = AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name="neutral",
        immediate=False,
        reason="test",
        rule_group="dma_fgi",
        decision_score=0.0,
    )
    context = _make_context()
    hints = _make_hints(enable=True)
    invocation = PluginInvocation(context=context, intent=intent, hints=hints)
    deltas = plugin._resolve_deltas(invocation)
    assert deltas == {}


def test_resolve_capped_stable_buy_zero_supply() -> None:
    """Line 190: stable_supply <= 0.0 returns 0.0."""
    from src.services.backtesting.strategies.dma_buy_sideways_gate import (
        DmaBuyGateSnapshot,
    )

    plugin = DmaBuyGateExecutionPlugin()
    snapshot = DmaBuyGateSnapshot(
        buy_strength=0.5,
        buy_sideways_confirmed=True,
        buy_sideways_window_days=5,
        buy_sideways_range=None,
        buy_leg_index=None,
        buy_leg_cap_pct=None,
        buy_leg_cap_usd=None,
        buy_leg_spent_usd=0.0,
        buy_episode_state="idle",
    )
    result = plugin._resolve_capped_stable_buy(
        stable_supply=0.0,
        snapshot=snapshot,
    )
    assert result == 0.0


def test_resolve_capped_stable_buy_not_confirmed() -> None:
    """buy_sideways_confirmed=False returns 0.0."""
    from src.services.backtesting.strategies.dma_buy_sideways_gate import (
        DmaBuyGateSnapshot,
    )

    plugin = DmaBuyGateExecutionPlugin()
    snapshot = DmaBuyGateSnapshot(
        buy_strength=0.5,
        buy_sideways_confirmed=False,
        buy_sideways_window_days=5,
        buy_sideways_range=None,
        buy_leg_index=None,
        buy_leg_cap_pct=None,
        buy_leg_cap_usd=None,
        buy_leg_spent_usd=0.0,
        buy_episode_state="idle",
    )
    result = plugin._resolve_capped_stable_buy(
        stable_supply=1_000.0,
        snapshot=snapshot,
    )
    assert result == 0.0

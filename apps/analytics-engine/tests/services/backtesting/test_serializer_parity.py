from __future__ import annotations

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import (
    DmaSignalDiagnostics,
    ExecutionOutcome,
    ExecutionPluginDiagnostic,
    RatioSignalDiagnostics,
    SignalObservation,
    StrategySnapshot,
)
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.state import build_strategy_state
from src.services.backtesting.strategies.base import TransferIntent


def test_strategy_state_serializer_preserves_signal_decision_and_execution_fields() -> (
    None
):
    snapshot = StrategySnapshot(
        signal=SignalObservation(
            signal_id="dma_gated_fgi",
            regime="greed",
            confidence=1.0,
            raw_value=72.0,
            ath_event="token_ath",
            dma=DmaSignalDiagnostics(
                dma_200=95_000.0,
                distance=0.05,
                zone="above",
                cross_event=None,
                cooldown_active=False,
                cooldown_remaining_days=0,
                cooldown_blocked_zone=None,
                fgi_slope=0.2,
            ),
            ratio=RatioSignalDiagnostics(
                ratio=0.05,
                ratio_dma_200=0.048,
                distance=0.0416666667,
                zone="above",
                cross_event="cross_up",
                cooldown_active=True,
                cooldown_remaining_days=30,
                cooldown_blocked_zone="above",
            ),
        ),
        decision=AllocationIntent(
            action="sell",
            target_allocation={"spot": 0.0, "stable": 1.0},
            allocation_name="all_stable",
            immediate=False,
            reason="above_greed_sell",
            rule_group="dma_fgi",
            decision_score=-1.0,
        ),
        execution=ExecutionOutcome(
            event=None,
            transfers=[],
            blocked_reason="interval_wait",
            step_count=5,
            steps_remaining=4,
            interval_days=2,
            plugin_diagnostics=(
                ExecutionPluginDiagnostic(
                    plugin_id="dma_buy_gate",
                    payload={
                        "buy_strength": None,
                        "sideways_confirmed": None,
                        "window_days": None,
                        "range_value": None,
                        "leg_index": None,
                        "leg_cap_pct": None,
                        "leg_cap_usd": None,
                        "leg_spent_usd": None,
                        "episode_state": None,
                        "block_reason": None,
                    },
                ),
            ),
        ),
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0)

    serialized = build_strategy_state(
        portfolio=portfolio,
        price=100_000.0,
        snapshot=snapshot,
    )

    assert serialized.signal is not None
    assert serialized.signal.id == "dma_gated_fgi"
    assert serialized.signal.details["ath_event"] == "token_ath"
    assert serialized.signal.details["ratio"]["zone"] == "above"
    assert serialized.signal.details["ratio"]["cooldown_blocked_zone"] == "above"
    assert serialized.decision.action == "sell"
    assert serialized.decision.details["allocation_name"] == "all_stable"
    assert serialized.decision.details["decision_score"] == -1.0
    assert serialized.portfolio.asset_allocation.stable == 1.0
    assert serialized.decision.target_asset_allocation.stable == 1.0
    assert serialized.decision.target_asset_allocation.alt == 0.0
    assert serialized.execution.blocked_reason == "interval_wait"
    assert serialized.execution.status == "blocked"
    assert serialized.execution.action_required is False
    assert serialized.execution.diagnostics.plugins["dma_buy_gate"] is not None


def test_strategy_state_serializer_marks_hold_transfers_as_action_required() -> None:
    snapshot = StrategySnapshot(
        signal=None,
        decision=AllocationIntent(
            action="hold",
            target_allocation={"spot": 0.8, "stable": 0.2},
            allocation_name="rotation_rebalance",
            immediate=False,
            reason="eth_btc_ratio_rebalance",
            rule_group="rotation",
            decision_score=0.0,
        ),
        execution=ExecutionOutcome(
            event="rebalance",
            transfers=[
                TransferIntent(
                    from_bucket="stable",
                    to_bucket="spot",
                    amount_usd=2_000.0,
                )
            ],
            blocked_reason=None,
            step_count=1,
            steps_remaining=0,
            interval_days=1,
            plugin_diagnostics=(),
        ),
    )

    serialized = build_strategy_state(
        portfolio=Portfolio(spot_balance=0.5, stable_balance=5_000.0),
        price=10_000.0,
        snapshot=snapshot,
    )

    assert serialized.execution.transfers
    assert serialized.execution.status == "action_required"
    assert serialized.execution.action_required is True


def test_strategy_state_serializer_marks_idle_hold_as_no_action() -> None:
    snapshot = StrategySnapshot(
        signal=None,
        decision=AllocationIntent(
            action="hold",
            target_allocation={"spot": 1.0, "stable": 0.0},
            allocation_name="rotation_hold",
            immediate=False,
            reason="eth_btc_ratio_rebalance",
            rule_group="rotation",
            decision_score=0.0,
        ),
        execution=ExecutionOutcome(
            event=None,
            transfers=[],
            blocked_reason=None,
            step_count=0,
            steps_remaining=0,
            interval_days=0,
            plugin_diagnostics=(),
        ),
    )

    serialized = build_strategy_state(
        portfolio=Portfolio(spot_balance=1.0, stable_balance=0.0),
        price=10_000.0,
        snapshot=snapshot,
    )

    assert serialized.execution.status == "no_action"
    assert serialized.execution.action_required is False

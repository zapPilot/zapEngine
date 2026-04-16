"""DMA buy-gate plugin for shared allocation execution."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionPluginDiagnostic
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.plugins import (
    ExecutionPluginResult,
    PluginInvocation,
)
from src.services.backtesting.execution.rebalance_calculator import (
    RebalanceCalculator,
)
from src.services.backtesting.strategies.base import TransferIntent
from src.services.backtesting.strategies.dma_buy_sideways_gate import (
    DmaBuyGateSnapshot,
    DmaBuySidewaysGate,
)

_PLUGIN_ID = "dma_buy_gate"
_EPSILON = 1e-6


@dataclass
class DmaBuyGateExecutionPlugin:
    """Execution plugin that applies the DMA sideways confirmation gate."""

    window_days: int = 5
    sideways_max_range: float = 0.04
    leg_caps: tuple[float, ...] = (0.05, 0.10, 0.20)
    _gate: DmaBuySidewaysGate = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._gate = DmaBuySidewaysGate(
            window_days=self.window_days,
            sideways_range_threshold=self.sideways_max_range,
            leg_cap_pcts=tuple(float(value) for value in self.leg_caps),
        )

    def reset(self) -> None:
        self._gate.reset()

    def observe(self, hints: ExecutionHints) -> None:
        if hints.reset_buy_gate:
            self._gate.reset()
        if hints.dma_distance is not None:
            self._gate.observe_dma_distance(hints.dma_distance)

    def precheck(self, invocation: PluginInvocation) -> ExecutionPluginResult:
        context = invocation.context
        intent = invocation.intent
        hints = invocation.hints
        if not self._enabled(intent=intent, hints=hints):
            return ExecutionPluginResult()
        snapshot = self._gate.snapshot(buy_strength=self._buy_strength(hints))
        diagnostics = (self._to_diagnostic(snapshot),)
        if intent.immediate:
            return ExecutionPluginResult(diagnostics=diagnostics)

        decision = self._gate.prepare_buy_execution(
            nav_usd=float(context.portfolio.total_value(context.portfolio_price)),
            buy_strength=self._buy_strength(hints),
        )
        diagnostics = (self._to_diagnostic(decision.snapshot),)
        if not decision.allowed and not self._has_internal_risk_rotation(invocation):
            return ExecutionPluginResult(
                allowed=False,
                blocked_reason=decision.snapshot.buy_gate_block_reason,
                clear_plan=True,
                diagnostics=diagnostics,
            )
        return ExecutionPluginResult(diagnostics=diagnostics)

    def adjust_step_plan(
        self,
        invocation: PluginInvocation,
        step_plan: dict[str, float],
    ) -> ExecutionPluginResult:
        intent = invocation.intent
        hints = invocation.hints
        if not self._enabled(intent=intent, hints=hints) or intent.immediate:
            return ExecutionPluginResult(step_plan=dict(step_plan))
        capped_plan = dict(step_plan)
        deltas = self._resolve_deltas(invocation)
        risk_buy_buckets = [
            bucket
            for bucket, delta in deltas.items()
            if bucket != "stable"
            and float(delta) > _EPSILON
            and float(capped_plan.get(bucket, 0.0)) > 0.0
        ]
        total_risk_buy = sum(
            float(capped_plan.get(bucket, 0.0)) for bucket in risk_buy_buckets
        )
        risk_sell_supply = sum(
            float(capped_plan.get(bucket, 0.0))
            for bucket, delta in deltas.items()
            if bucket != "stable"
            and float(delta) < -_EPSILON
            and float(capped_plan.get(bucket, 0.0)) > 0.0
        )
        stable_supply = (
            float(capped_plan.get("stable", 0.0))
            if float(deltas.get("stable", 0.0)) < -_EPSILON
            else 0.0
        )
        snapshot = self._gate.snapshot(buy_strength=self._buy_strength(hints))
        capped_stable_buy = self._resolve_capped_stable_buy(
            stable_supply=stable_supply,
            snapshot=snapshot,
        )
        allowed_risk_buy = min(total_risk_buy, risk_sell_supply + capped_stable_buy)
        if total_risk_buy > 0.0:
            scale = allowed_risk_buy / total_risk_buy
            for bucket in risk_buy_buckets:
                capped_plan[bucket] = float(capped_plan[bucket]) * scale
        if "stable" in capped_plan and float(deltas.get("stable", 0.0)) < -_EPSILON:
            capped_plan["stable"] = capped_stable_buy
        return ExecutionPluginResult(
            step_plan=capped_plan,
            diagnostics=(self._to_diagnostic(snapshot),),
        )

    def after_execution(
        self,
        invocation: PluginInvocation,
        transfers: list[TransferIntent],
    ) -> ExecutionPluginResult:
        intent = invocation.intent
        hints = invocation.hints
        if not self._enabled(intent=intent, hints=hints):
            return ExecutionPluginResult()
        executed_buy = sum(
            float(transfer.amount_usd)
            for transfer in transfers
            if transfer.from_bucket == "stable" and transfer.to_bucket != "stable"
        )
        if executed_buy <= 0.0:
            snapshot = self._gate.snapshot(buy_strength=self._buy_strength(hints))
            return ExecutionPluginResult(
                diagnostics=(self._to_diagnostic(snapshot),),
            )
        self._gate.record_buy_execution(executed_buy)
        snapshot = self._gate.snapshot(buy_strength=self._buy_strength(hints))
        return ExecutionPluginResult(
            clear_plan=True,
            diagnostics=(self._to_diagnostic(snapshot),),
        )

    @staticmethod
    def _enabled(*, intent: AllocationIntent, hints: ExecutionHints) -> bool:
        return hints.enable_buy_gate and intent.action == "buy"

    def _has_internal_risk_rotation(self, invocation: PluginInvocation) -> bool:
        deltas = self._resolve_deltas(invocation)
        has_risk_buy = any(
            bucket != "stable" and float(delta) > _EPSILON
            for bucket, delta in deltas.items()
        )
        has_risk_sell = any(
            bucket != "stable" and float(delta) < -_EPSILON
            for bucket, delta in deltas.items()
        )
        return has_risk_buy and has_risk_sell

    @staticmethod
    def _resolve_deltas(invocation: PluginInvocation) -> dict[str, float]:
        target_allocation = invocation.intent.target_allocation
        if target_allocation is None:
            return {}
        return RebalanceCalculator.calculate_deltas_from_context(
            invocation.context,
            target_allocation,
        )

    @staticmethod
    def _buy_strength(hints: ExecutionHints) -> float:
        return 0.0 if hints.buy_strength is None else float(hints.buy_strength)

    def _resolve_capped_stable_buy(
        self,
        *,
        stable_supply: float,
        snapshot: DmaBuyGateSnapshot,
    ) -> float:
        if stable_supply <= 0.0:
            return 0.0
        if (
            not snapshot.buy_sideways_confirmed
            or snapshot.buy_episode_state == "consumed"
        ):
            return 0.0
        return self._gate.cap_buy_amount(stable_supply)

    @staticmethod
    def _to_diagnostic(snapshot: DmaBuyGateSnapshot) -> ExecutionPluginDiagnostic:
        return ExecutionPluginDiagnostic(
            plugin_id=_PLUGIN_ID,
            payload={
                "buy_strength": snapshot.buy_strength,
                "sideways_confirmed": snapshot.buy_sideways_confirmed,
                "window_days": snapshot.buy_sideways_window_days,
                "range_value": snapshot.buy_sideways_range,
                "leg_index": snapshot.buy_leg_index,
                "leg_cap_pct": snapshot.buy_leg_cap_pct,
                "leg_cap_usd": snapshot.buy_leg_cap_usd,
                "leg_spent_usd": snapshot.buy_leg_spent_usd,
                "episode_state": snapshot.buy_episode_state,
                "block_reason": snapshot.buy_gate_block_reason,
            },
        )

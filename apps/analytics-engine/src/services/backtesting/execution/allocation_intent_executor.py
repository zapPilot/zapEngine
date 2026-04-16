"""Shared allocation-intent executor for backtesting strategies."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionPluginDiagnostic
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.pacing import (
    FgiExponentialPacingPolicy,
    RebalancePacingInputs,
    RebalancePacingPolicy,
)
from src.services.backtesting.execution.plugins import (
    ExecutionPlugin,
    ExecutionPluginResult,
    PluginInvocation,
    merge_plugin_results,
)
from src.services.backtesting.execution.rebalance_calculator import RebalanceCalculator
from src.services.backtesting.execution.step_plan_executor import StepPlanExecutor
from src.services.backtesting.strategies.base import StrategyContext, TransferIntent


@dataclass(frozen=True)
class AllocationExecutionResult:
    target_allocation: dict[str, float]
    allocation_name: str | None
    transfers: list[TransferIntent] | None
    event: str | None
    steps_remaining: int
    immediate_execution: bool
    drift: float
    block_reason: str | None = None
    step_count: int = 0
    interval_days: int = 0
    plugin_diagnostics: tuple[ExecutionPluginDiagnostic, ...] = ()


@dataclass
class _BucketAmount:
    bucket: str
    amount: float


@dataclass
class AllocationIntentExecutor:
    """Execute target-allocation intents with pacing and optional buy gating."""

    pacing_policy: RebalancePacingPolicy = field(
        default_factory=FgiExponentialPacingPolicy
    )
    plugins: tuple[ExecutionPlugin, ...] = ()
    rotation_cooldown_days: int = 0
    _step_executor: StepPlanExecutor = field(init=False, repr=False)
    _plan_total_steps: int = field(default=0, init=False)
    _plan_step_weights: list[float] = field(default_factory=list, init=False)
    _plan_tail_weight_sums: list[float] = field(default_factory=list, init=False)
    _active_target_allocation: dict[str, float] | None = field(default=None, init=False)
    _active_allocation_name: str | None = field(default=None, init=False)
    last_trade_date: date | None = field(default=None, init=False)
    _last_rotation_trade_date: date | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        self._step_executor = StepPlanExecutor(rebalance_step_count=1)

    @property
    def rebalance_step_plan(self) -> dict[str, float] | None:
        return self._step_executor.step_plan

    @rebalance_step_plan.setter
    def rebalance_step_plan(self, value: dict[str, float] | None) -> None:
        self._step_executor.step_plan = value

    @property
    def steps_remaining(self) -> int:
        return self._step_executor.steps_remaining

    @steps_remaining.setter
    def steps_remaining(self, value: int) -> None:
        self._step_executor.steps_remaining = value

    def reset(self) -> None:
        self.last_trade_date = None
        self._last_rotation_trade_date = None
        self.clear_plan()
        for plugin in self.plugins:
            plugin.reset()

    def observe(self, hints: ExecutionHints) -> None:
        for plugin in self.plugins:
            plugin.observe(hints)

    def clear_plan(self) -> None:
        self._step_executor.clear()
        self._plan_total_steps = 0
        self._plan_step_weights = []
        self._plan_tail_weight_sums = []
        self._active_target_allocation = None
        self._active_allocation_name = None

    def execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
    ) -> AllocationExecutionResult:
        assert intent.target_allocation is not None
        target_allocation = dict(intent.target_allocation)
        allocation_name = intent.allocation_name

        if not self._same_target(self._active_target_allocation, target_allocation) or (
            self._active_allocation_name != allocation_name
        ):
            self.clear_plan()

        current_allocation = (
            RebalanceCalculator.calculate_current_allocation_from_context(
                context,
                target_allocation=target_allocation,
            )
        )
        plugin_invocation = PluginInvocation(
            context=context,
            intent=intent,
            hints=hints,
        )
        drift = RebalanceCalculator.calculate_drift(
            current_allocation, target_allocation
        )
        deltas = RebalanceCalculator.calculate_deltas_from_context(
            context, target_allocation
        )
        precheck = merge_plugin_results(
            *[plugin.precheck(plugin_invocation) for plugin in self.plugins]
        )
        target_reached_result = self._build_target_reached_result(
            deltas=deltas,
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            intent=intent,
            drift=drift,
            precheck=precheck,
        )
        if target_reached_result is not None:
            return target_reached_result

        realized_volatility = self._extract_realized_volatility(context)
        precheck_result = self._build_precheck_blocked_result(
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            drift=drift,
            precheck=precheck,
        )
        if precheck_result is not None:
            return precheck_result

        interval_wait_result = self._build_interval_wait_result(
            context=context,
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            intent=intent,
            hints=hints,
            realized_volatility=realized_volatility,
            drift=drift,
            precheck=precheck,
        )
        if interval_wait_result is not None:
            return interval_wait_result

        total_steps = self._ensure_step_plan(
            context=context,
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            intent=intent,
            hints=hints,
            realized_volatility=realized_volatility,
        )

        assert self.rebalance_step_plan is not None
        adjust_result = merge_plugin_results(
            *[
                plugin.adjust_step_plan(
                    plugin_invocation, step_plan=self.rebalance_step_plan
                )
                for plugin in self.plugins
            ]
        )
        if adjust_result.step_plan is not None:
            self.rebalance_step_plan = dict(adjust_result.step_plan)
        transfers, event, new_steps_remaining, should_clear_plan = (
            self._execute_rebalance_step(
                context=context,
                target_allocation=target_allocation,
                step_plan=self.rebalance_step_plan,
                steps_remaining=self.steps_remaining,
            )
        )
        after_execution = merge_plugin_results(
            *[
                plugin.after_execution(
                    plugin_invocation,
                    transfers=[] if transfers is None else list(transfers),
                )
                for plugin in self.plugins
            ]
        )
        if after_execution.clear_plan:
            new_steps_remaining = 0
            should_clear_plan = True
        if transfers is not None:
            self.last_trade_date = context.date
            if intent.rule_group == "rotation":
                self._last_rotation_trade_date = context.date
        self.steps_remaining = (
            0 if should_clear_plan and transfers is None else new_steps_remaining
        )
        if should_clear_plan:
            self.clear_plan()

        return AllocationExecutionResult(
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            transfers=transfers,
            event=event,
            steps_remaining=self.steps_remaining,
            immediate_execution=intent.immediate,
            drift=drift,
            step_count=max(1, total_steps),
            interval_days=(
                1
                if intent.immediate
                else self._get_effective_interval_days(
                    context=context,
                    intent=intent,
                    hints=hints,
                    realized_volatility=realized_volatility,
                )
            ),
            plugin_diagnostics=self._merge_plugin_diagnostics(
                precheck.diagnostics,
                adjust_result.diagnostics,
                after_execution.diagnostics,
            ),
        )

    def _build_target_reached_result(
        self,
        *,
        deltas: dict[str, float],
        target_allocation: dict[str, float],
        allocation_name: str | None,
        intent: AllocationIntent,
        drift: float,
        precheck: ExecutionPluginResult,
    ) -> AllocationExecutionResult | None:
        if not self._is_effectively_at_target(deltas):
            return None
        self.clear_plan()
        return AllocationExecutionResult(
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            transfers=None,
            event="rebalance" if intent.immediate else None,
            steps_remaining=0,
            immediate_execution=intent.immediate,
            drift=drift,
            step_count=1 if intent.immediate else 0,
            interval_days=0,
            plugin_diagnostics=precheck.diagnostics,
        )

    def _build_precheck_blocked_result(
        self,
        *,
        target_allocation: dict[str, float],
        allocation_name: str | None,
        drift: float,
        precheck: ExecutionPluginResult,
    ) -> AllocationExecutionResult | None:
        if precheck.allowed:
            return None
        if precheck.clear_plan:
            self.clear_plan()
        return AllocationExecutionResult(
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            transfers=None,
            event=None,
            steps_remaining=0,
            immediate_execution=False,
            drift=drift,
            block_reason=precheck.blocked_reason,
            step_count=0,
            interval_days=0,
            plugin_diagnostics=precheck.diagnostics,
        )

    def _build_interval_wait_result(
        self,
        *,
        context: StrategyContext,
        target_allocation: dict[str, float],
        allocation_name: str | None,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
        drift: float,
        precheck: ExecutionPluginResult,
    ) -> AllocationExecutionResult | None:
        if intent.immediate or self._is_rebalance_interval_met(
            context=context,
            intent=intent,
            hints=hints,
            realized_volatility=realized_volatility,
        ):
            return None
        return AllocationExecutionResult(
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            transfers=None,
            event=None,
            steps_remaining=self.steps_remaining,
            immediate_execution=False,
            drift=drift,
            step_count=self._plan_total_steps,
            interval_days=self._get_effective_interval_days(
                context=context,
                intent=intent,
                hints=hints,
                realized_volatility=realized_volatility,
            ),
            plugin_diagnostics=precheck.diagnostics,
        )

    def _ensure_step_plan(
        self,
        *,
        context: StrategyContext,
        target_allocation: dict[str, float],
        allocation_name: str | None,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
    ) -> int:
        if self.rebalance_step_plan is None:
            step_plan, total_steps = self._initialize_step_plan(
                context=context,
                intent=intent,
                hints=hints,
                target_allocation=target_allocation,
                realized_volatility=realized_volatility,
                immediate_execution=intent.immediate,
            )
            self.rebalance_step_plan = step_plan
            self.steps_remaining = total_steps
            self._active_target_allocation = dict(target_allocation)
            self._active_allocation_name = allocation_name
            return total_steps
        total_steps = self._plan_total_steps
        self.rebalance_step_plan = self._build_step_plan_for_current_step(
            context=context,
            target_allocation=target_allocation,
        )
        return total_steps

    def _build_pacing_inputs(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
    ) -> RebalancePacingInputs:
        return RebalancePacingInputs(
            current_regime=hints.current_regime,
            fgi_value=hints.signal_value,
            price=context.price,
            realized_volatility=realized_volatility,
            decision_score=hints.decision_score,
            decision_action=intent.action,
            dma_distance=0.0 if hints.dma_distance is None else hints.dma_distance,
            fgi_slope=0.0 if hints.fgi_slope is None else hints.fgi_slope,
            buy_strength=hints.buy_strength,
        )

    def _get_effective_interval_days(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
    ) -> int:
        return self.pacing_policy.interval_days(
            self._build_pacing_inputs(
                context=context,
                intent=intent,
                hints=hints,
                realized_volatility=realized_volatility,
            )
        )

    def _get_effective_step_count(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
    ) -> int:
        return self.pacing_policy.step_count(
            self._build_pacing_inputs(
                context=context,
                intent=intent,
                hints=hints,
                realized_volatility=realized_volatility,
            )
        )

    def _initialize_pacing_plan(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
        total_steps: int,
    ) -> None:
        steps = max(1, int(total_steps))
        inputs = self._build_pacing_inputs(
            context=context,
            intent=intent,
            hints=hints,
            realized_volatility=realized_volatility,
        )
        weights = self.pacing_policy.step_weights(inputs, steps)
        if len(weights) != steps:
            weights = [1.0] * steps
        cleaned = [max(0.0, float(weight)) for weight in weights]
        if sum(cleaned) <= 0:
            cleaned = [1.0] * steps
        tail_sums: list[float] = [0.0] * steps
        running = 0.0
        for idx in range(steps - 1, -1, -1):
            running += cleaned[idx]
            tail_sums[idx] = running
        self._plan_total_steps = steps
        self._plan_step_weights = cleaned
        self._plan_tail_weight_sums = tail_sums

    @staticmethod
    def _extract_realized_volatility(
        context: StrategyContext, window: int = 14
    ) -> float | None:
        prices = context.price_history
        if len(prices) < 2:
            return None
        n = min(len(prices), window + 1)
        recent = prices[-n:]
        returns: list[float] = []
        for idx in range(1, len(recent)):
            p0 = float(recent[idx - 1])
            p1 = float(recent[idx])
            if p0 <= 0 or p1 <= 0:
                continue
            returns.append(math.log(p1 / p0))
        if len(returns) < 2:
            return None
        mean = sum(returns) / len(returns)
        var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
        if var < 0:  # pragma: no cover
            return None
        return math.sqrt(var) * math.sqrt(365.0)

    @staticmethod
    def _merge_plugin_diagnostics(
        *diagnostic_groups: tuple[ExecutionPluginDiagnostic, ...],
    ) -> tuple[ExecutionPluginDiagnostic, ...]:
        diagnostics: dict[str, ExecutionPluginDiagnostic] = {}
        for group in diagnostic_groups:
            for diagnostic in group:
                diagnostics[diagnostic.plugin_id] = diagnostic
        return tuple(diagnostics.values())

    def _is_rebalance_interval_met(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
        realized_volatility: float | None,
    ) -> bool:
        if (
            intent.rule_group == "rotation"
            and self.rotation_cooldown_days > 0
            and self._last_rotation_trade_date is not None
            and (context.date - self._last_rotation_trade_date).days
            < self.rotation_cooldown_days
        ):
            return False
        if self.last_trade_date is None:
            return True
        return (
            context.date - self.last_trade_date
        ).days >= self._get_effective_interval_days(
            context=context,
            intent=intent,
            hints=hints,
            realized_volatility=realized_volatility,
        )

    def _initialize_step_plan(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
        target_allocation: dict[str, float],
        realized_volatility: float | None,
        immediate_execution: bool,
    ) -> tuple[dict[str, float], int]:
        total_steps = (
            1
            if immediate_execution
            else self._get_effective_step_count(
                context=context,
                intent=intent,
                hints=hints,
                realized_volatility=realized_volatility,
            )
        )
        total_steps = max(1, int(total_steps))
        self._initialize_pacing_plan(
            context=context,
            intent=intent,
            hints=hints,
            realized_volatility=realized_volatility,
            total_steps=total_steps,
        )
        deltas = RebalanceCalculator.calculate_deltas_from_context(
            context, target_allocation
        )
        fraction = self._fraction_for_step(0, total_steps)
        return {
            bucket: abs(delta) * fraction for bucket, delta in deltas.items()
        }, total_steps

    def _build_step_plan_for_current_step(
        self,
        *,
        context: StrategyContext,
        target_allocation: dict[str, float],
    ) -> dict[str, float]:
        deltas = RebalanceCalculator.calculate_deltas_from_context(
            context, target_allocation
        )
        if self.steps_remaining <= 0:
            return dict.fromkeys(deltas, 0.0)
        step_idx = 0
        if self._plan_total_steps > 0:
            step_idx = max(
                0,
                min(
                    self._plan_total_steps - self.steps_remaining,
                    self._plan_total_steps - 1,
                ),
            )
        fraction = self._fraction_for_step(step_idx, self.steps_remaining)
        return {bucket: abs(delta) * fraction for bucket, delta in deltas.items()}

    def _fraction_for_step(self, step_idx: int, fallback_steps: int) -> float:
        if (
            self._plan_tail_weight_sums
            and self._plan_step_weights
            and step_idx < len(self._plan_tail_weight_sums)
            and step_idx < len(self._plan_step_weights)
        ):
            denom = self._plan_tail_weight_sums[step_idx]
            weight = self._plan_step_weights[step_idx]
            if denom > 0:
                return weight / denom
        return 1.0 / max(1, fallback_steps)

    def _execute_rebalance_step(
        self,
        *,
        context: StrategyContext,
        target_allocation: dict[str, float],
        step_plan: dict[str, float],
        steps_remaining: int,
    ) -> tuple[list[TransferIntent] | None, str | None, int, bool]:
        deltas = RebalanceCalculator.calculate_deltas_from_context(
            context, target_allocation
        )
        transfers: list[TransferIntent] | None = None
        event: str | None = None
        new_steps_remaining = steps_remaining
        transfers = self._build_step_transfers(deltas=deltas, step_plan=step_plan)
        if transfers:
            event = "rebalance"
            new_steps_remaining -= 1
        should_clear_plan = new_steps_remaining <= 0 or not transfers
        return (transfers or None), event, new_steps_remaining, should_clear_plan

    @staticmethod
    def _build_step_transfers(
        *,
        deltas: dict[str, float],
        step_plan: dict[str, float],
    ) -> list[TransferIntent]:
        eps = 1e-6
        demand = [
            _BucketAmount(
                bucket=bucket,
                amount=min(float(delta), float(step_plan.get(bucket, 0.0))),
            )
            for bucket, delta in sorted(deltas.items())
            if float(delta) > eps
        ]
        supply = [
            _BucketAmount(
                bucket=bucket,
                amount=min(float(-delta), float(step_plan.get(bucket, 0.0))),
            )
            for bucket, delta in sorted(deltas.items())
            if float(delta) < -eps
        ]
        demand = [entry for entry in demand if entry.amount > eps]
        supply = [entry for entry in supply if entry.amount > eps]
        transfers: list[TransferIntent] = []
        demand_idx = 0
        supply_idx = 0
        while demand_idx < len(demand) and supply_idx < len(supply):
            demand_entry = demand[demand_idx]
            supply_entry = supply[supply_idx]
            amount = min(demand_entry.amount, supply_entry.amount)
            if amount > eps:
                transfers.append(
                    TransferIntent(
                        from_bucket=supply_entry.bucket,
                        to_bucket=demand_entry.bucket,
                        amount_usd=amount,
                    )
                )
            demand_entry.amount -= amount
            supply_entry.amount -= amount
            if demand_entry.amount <= eps:
                demand_idx += 1
            if supply_entry.amount <= eps:
                supply_idx += 1
        return transfers

    @staticmethod
    def _is_effectively_at_target(
        deltas: dict[str, float], *, tolerance: float = 1e-6
    ) -> bool:
        return max(abs(delta) for delta in deltas.values()) <= tolerance

    @staticmethod
    def _same_target(
        left: dict[str, float] | None, right: dict[str, float] | None
    ) -> bool:
        if left is None or right is None:
            return left is right
        return left == right


__all__ = ["AllocationExecutionResult", "AllocationIntentExecutor"]

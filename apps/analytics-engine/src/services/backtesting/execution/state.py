"""Strategy state and summary serialization for backtesting."""

from __future__ import annotations

from typing import Any, cast

from src.models.backtesting import (
    Allocation,
    DecisionState,
    ExecutionDiagnostics,
    ExecutionState,
    ExecutionStatus,
    PortfolioState,
    SignalState,
    SpotAssetType,
    StrategyId,
    StrategyState,
    StrategySummary,
    TargetAllocation,
    TransferRecord,
)
from src.services.backtesting.asset_allocation_serialization import (
    serialize_asset_allocation,
)
from src.services.backtesting.domain import (
    DmaSignalDiagnostics,
    ExecutionPluginDiagnostic,
    StrategySnapshot,
)
from src.services.backtesting.execution.block_reasons import (
    resolve_effective_block_reason,
)
from src.services.backtesting.execution.performance_metrics import (
    PerformanceMetricsCalculator,
)
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.strategies.base import BaseStrategy
from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)
from src.services.backtesting.utils.two_bucket import sanitize_runtime_allocation


def build_strategy_state(
    *,
    portfolio: Portfolio,
    price: float | dict[str, float],
    snapshot: StrategySnapshot,
) -> StrategyState:
    total_value = portfolio.total_value(price)
    allocation = sanitize_runtime_allocation(portfolio.allocation_percentages(price))
    asset_allocation = serialize_asset_allocation(
        portfolio.asset_allocation_percentages(price)
    )
    target_allocation = _resolve_target_allocation(
        snapshot_target=snapshot.decision.target_allocation,
        current_asset_allocation=asset_allocation.model_dump(),
    )
    bucket_values = portfolio.bucket_values(price)
    return StrategyState(
        portfolio=PortfolioState(
            spot_usd=bucket_values["spot"],
            stable_usd=bucket_values["stable"],
            total_value=total_value,
            allocation=Allocation(**allocation),
            asset_allocation=asset_allocation,
            spot_asset=cast(SpotAssetType, portfolio.serializable_spot_asset())
            if bucket_values["spot"] > 0
            and portfolio.serializable_spot_asset() is not None
            else None,
        ),
        signal=_build_signal_state(snapshot),
        decision=DecisionState(
            action=snapshot.decision.action,
            reason=snapshot.decision.reason,
            rule_group=snapshot.decision.rule_group,
            target_allocation=TargetAllocation(**target_allocation),
            immediate=snapshot.decision.immediate,
            details=_serialize_decision_details(snapshot),
        ),
        execution=_build_execution_state(snapshot),
    )


def build_strategy_summaries(
    *,
    strategies: list[BaseStrategy],
    portfolios: dict[str, Portfolio],
    trade_counts: dict[str, int],
    total_capital: float,
    last_price: float,
    last_market_prices: dict[str, float] | None,
    strategy_daily_values: dict[str, list[float]],
    benchmark_daily_prices: list[float],
) -> dict[str, StrategySummary]:
    summaries: dict[str, StrategySummary] = {}
    for strategy in strategies:
        result = strategy.finalize()
        portfolio = portfolios[strategy.strategy_id]
        summary_price = _resolve_summary_price_input(
            portfolio=portfolio,
            last_price=last_price,
            last_market_prices=last_market_prices,
        )
        final_value = portfolio.total_value(summary_price)
        allocation = sanitize_runtime_allocation(
            portfolio.allocation_percentages(summary_price)
        )
        asset_allocation = serialize_asset_allocation(
            portfolio.asset_allocation_percentages(summary_price)
        )
        parameters = strategy.parameters()
        signal_id = getattr(strategy, "summary_signal_id", None)
        performance_metrics = _calculate_performance_metrics(
            strategy_daily_values[strategy.strategy_id],
            benchmark_daily_prices,
        )
        canonical_strategy_id = cast(
            StrategyId,
            getattr(strategy, "canonical_strategy_id", strategy.strategy_id),
        )
        summaries[strategy.strategy_id] = StrategySummary(
            strategy_id=canonical_strategy_id,
            display_name=strategy.display_name,
            signal_id=signal_id,
            total_invested=total_capital,
            final_value=final_value,
            roi_percent=calculate_roi_percent(final_value, total_capital),
            trade_count=trade_counts[strategy.strategy_id],
            sharpe_ratio=performance_metrics["sharpe_ratio"],
            calmar_ratio=performance_metrics["calmar_ratio"],
            max_drawdown_percent=performance_metrics["max_drawdown_percent"],
            final_allocation=Allocation(**allocation),
            final_asset_allocation=asset_allocation,
            parameters={**parameters, **(result.metrics or {})},
        )
    return summaries


def calculate_roi_percent(final_value: float, total_capital: float) -> float:
    if total_capital <= 0:
        return 0.0
    return ((final_value - total_capital) / total_capital) * 100.0


def _build_signal_state(snapshot: StrategySnapshot) -> SignalState | None:
    signal = snapshot.signal
    if signal is None:
        return None

    return SignalState(
        id=signal.signal_id,
        regime=signal.regime,
        raw_value=signal.raw_value,
        confidence=signal.confidence,
        details=_serialize_signal_details(snapshot),
    )


def _build_execution_state(snapshot: StrategySnapshot) -> ExecutionState:
    transfers = [
        TransferRecord(
            from_bucket=transfer.from_bucket,  # type: ignore[arg-type]
            to_bucket=transfer.to_bucket,  # type: ignore[arg-type]
            amount_usd=float(transfer.amount_usd),
        )
        for transfer in snapshot.execution.transfers
    ]
    diagnostics = _serialize_execution_diagnostics(
        snapshot.execution.plugin_diagnostics
    )
    status, action_required = _resolve_execution_actionability(
        transfers=transfers,
        blocked_reason=snapshot.execution.blocked_reason,
        diagnostics=diagnostics,
    )
    return ExecutionState(
        event=snapshot.execution.event,
        transfers=transfers,
        blocked_reason=snapshot.execution.blocked_reason,
        status=status,
        action_required=action_required,
        step_count=snapshot.execution.step_count,
        steps_remaining=snapshot.execution.steps_remaining,
        interval_days=snapshot.execution.interval_days,
        diagnostics=ExecutionDiagnostics(plugins=diagnostics),
    )


def _serialize_signal_details(snapshot: StrategySnapshot) -> dict[str, Any]:
    signal = snapshot.signal
    if signal is None:
        return {}

    details: dict[str, Any] = {}
    if signal.ath_event is not None:
        details["ath_event"] = signal.ath_event
    if signal.dma is not None:
        details["dma"] = _serialize_dma_signal(signal.dma)
    if signal.ratio is not None:
        details["ratio"] = {
            "ratio": signal.ratio.ratio,
            "ratio_dma_200": signal.ratio.ratio_dma_200,
            "distance": signal.ratio.distance,
            "zone": signal.ratio.zone,
            "cross_event": signal.ratio.cross_event,
            "cooldown_active": signal.ratio.cooldown_active,
            "cooldown_remaining_days": signal.ratio.cooldown_remaining_days,
            "cooldown_blocked_zone": signal.ratio.cooldown_blocked_zone,
        }
    if signal.spy_dma is not None:
        details["spy_dma"] = _serialize_dma_signal(signal.spy_dma)
    return details


def _serialize_dma_signal(dma: DmaSignalDiagnostics) -> dict[str, Any]:
    details = {
        "dma_200": dma.dma_200,
        "distance": dma.distance,
        "zone": dma.zone,
        "cross_event": dma.cross_event,
        "cooldown_active": dma.cooldown_active,
        "cooldown_remaining_days": dma.cooldown_remaining_days,
        "cooldown_blocked_zone": dma.cooldown_blocked_zone,
        "fgi_slope": dma.fgi_slope,
    }
    if dma.outer_dma_asset is not None:
        details["outer_dma_asset"] = dma.outer_dma_asset
    if dma.outer_dma_action_unit is not None:
        details["outer_dma_action_unit"] = dma.outer_dma_action_unit
    if dma.outer_dma_reference_asset is not None:
        details["outer_dma_reference_asset"] = dma.outer_dma_reference_asset
    return details


def _serialize_decision_details(snapshot: StrategySnapshot) -> dict[str, Any]:
    details: dict[str, Any] = {}
    if snapshot.decision.allocation_name is not None:
        details["allocation_name"] = snapshot.decision.allocation_name
    details["decision_score"] = snapshot.decision.decision_score
    if snapshot.decision.diagnostics is not None:
        details.update(snapshot.decision.diagnostics)
    return details


def _serialize_execution_diagnostics(
    diagnostics: tuple[ExecutionPluginDiagnostic, ...],
) -> dict[str, dict[str, Any] | None]:
    return {
        diagnostic.plugin_id: dict(diagnostic.payload) for diagnostic in diagnostics
    }


def _resolve_execution_actionability(
    *,
    transfers: list[TransferRecord],
    blocked_reason: str | None,
    diagnostics: dict[str, dict[str, Any] | None],
) -> tuple[ExecutionStatus, bool]:
    if transfers:
        return ("action_required", True)

    if resolve_effective_block_reason(
        blocked_reason=blocked_reason,
        diagnostics=diagnostics,
    ):
        return ("blocked", False)

    return ("no_action", False)


def _calculate_performance_metrics(
    strategy_values: list[float],
    benchmark_prices: list[float],
) -> dict[str, float]:
    calculator = PerformanceMetricsCalculator()
    return calculator.calculate_all_metrics(strategy_values, benchmark_prices)


def _resolve_target_allocation(
    *,
    snapshot_target: dict[str, float] | None,
    current_asset_allocation: dict[str, float],
) -> dict[str, float]:
    if snapshot_target is None:
        return target_from_current_allocation(current_asset_allocation)
    return normalize_target_allocation(snapshot_target)


def _resolve_summary_price_input(
    *,
    portfolio: Portfolio,
    last_price: float,
    last_market_prices: dict[str, float] | None,
) -> float | dict[str, float]:
    if not last_market_prices:
        return last_price
    try:
        portfolio.total_value(last_market_prices)
    except ValueError:
        return last_price
    return dict(last_market_prices)

"""Shared portfolio rebalancing calculations."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING

from src.services.backtesting.execution.transfer_netting import build_bucket_transfers
from src.services.backtesting.strategies.base import TransferIntent
from src.services.backtesting.target_allocation import normalize_target_allocation

if TYPE_CHECKING:
    from src.services.backtesting.execution.portfolio import Portfolio
    from src.services.backtesting.strategies.base import StrategyContext

# Deltas at or below this many USD count as already on target.
AT_TARGET_TOLERANCE_USD = 1e-6


@dataclass(frozen=True)
class RebalanceCalculator:
    @staticmethod
    def _normalize_target_allocation(
        target_allocation: dict[str, float],
    ) -> dict[str, float]:
        return normalize_target_allocation(target_allocation)

    @staticmethod
    def _resolve_current_values(
        context: StrategyContext,
        price: float | dict[str, float],
        target_allocation: dict[str, float],
    ) -> dict[str, float]:
        """Resolve per-bucket current values, preferring allocation-keyed
        values when the portfolio exposes them, else bucket values."""
        values_for_keys = getattr(context.portfolio, "values_for_allocation_keys", None)
        if callable(values_for_keys):
            resolved_values = values_for_keys(price, target_allocation)
            if isinstance(resolved_values, dict):
                return resolved_values
            return context.portfolio.bucket_values(price)
        return context.portfolio.bucket_values(price)

    @staticmethod
    def calculate_deltas(
        total_value: float,
        target_allocation: dict[str, float],
        current_values: dict[str, float],
    ) -> dict[str, float]:
        normalized_target = RebalanceCalculator._normalize_target_allocation(
            target_allocation
        )
        buckets = sorted(set(normalized_target) | set(current_values))
        target_values = {
            bucket: total_value * float(normalized_target.get(bucket, 0.0))
            for bucket in buckets
        }
        return {
            bucket: target_values[bucket] - float(current_values.get(bucket, 0.0))
            for bucket in buckets
        }

    @staticmethod
    def calculate_deltas_from_context(
        context: StrategyContext,
        target_allocation: dict[str, float],
    ) -> dict[str, float]:
        price = context.portfolio_price
        total_value = context.portfolio.total_value(price)
        current_values = RebalanceCalculator._resolve_current_values(
            context, price, target_allocation
        )
        return RebalanceCalculator.calculate_deltas(
            total_value, target_allocation, current_values
        )

    @staticmethod
    def calculate_current_allocation(
        balances: dict[str, float] | None = None,
        price: float | None = None,
        *,
        total_value: float | None = None,
        current_values: dict[str, float] | None = None,
        target_keys: set[str] | None = None,
    ) -> dict[str, float]:
        if balances is not None:
            resolved_price = 0.0 if price is None else float(price)
            spot_value = float(balances.get("spot_balance", 0.0)) * resolved_price
            stable_value = float(balances.get("stable_balance", 0.0))
            total_value = spot_value + stable_value
            current_values = {
                "spot": spot_value,
                "stable": stable_value,
            }
            target_keys = {"spot", "stable"}
        assert total_value is not None
        assert current_values is not None
        buckets = set(current_values)
        if target_keys is not None:
            buckets |= set(target_keys)
        if total_value <= 0.0:
            fallback = dict.fromkeys(buckets, 0.0)
            fallback["stable"] = 1.0
            return fallback
        return {
            bucket: float(current_values.get(bucket, 0.0)) / total_value
            for bucket in buckets
        }

    @staticmethod
    def calculate_current_allocation_from_context(
        context: StrategyContext,
        *,
        target_allocation: dict[str, float] | None = None,
    ) -> dict[str, float]:
        price = context.portfolio_price
        if target_allocation is None:
            bucket_values = getattr(context.portfolio, "bucket_values", None)
            if callable(bucket_values):
                resolved_values = bucket_values(price)
                if isinstance(resolved_values, dict):
                    total_value = context.portfolio.total_value(price)
                    return RebalanceCalculator.calculate_current_allocation(
                        total_value=total_value,
                        current_values=resolved_values,
                        target_keys={"spot", "stable"},
                    )
            if hasattr(context.portfolio, "snapshot"):
                balances = context.portfolio.snapshot()
                if isinstance(price, dict):
                    resolved_price = float(next(iter(price.values()), 0.0))
                else:
                    resolved_price = float(price)
                return RebalanceCalculator.calculate_current_allocation(
                    balances=balances,
                    price=resolved_price,
                )
            if callable(bucket_values):  # pragma: no cover
                current_values = bucket_values(price)
                total_value = context.portfolio.total_value(price)
                return RebalanceCalculator.calculate_current_allocation(
                    total_value=total_value,
                    current_values=current_values,
                    target_keys={"spot", "stable"},
                )
            raise ValueError(
                "Portfolio must expose bucket_values or snapshot"
            )  # pragma: no cover
        total_value = context.portfolio.total_value(price)
        current_values = RebalanceCalculator._resolve_current_values(
            context, price, target_allocation
        )
        return RebalanceCalculator.calculate_current_allocation(
            total_value=total_value,
            current_values=current_values,
            target_keys=set(target_allocation),
        )

    @staticmethod
    def calculate_drift(
        current: dict[str, float],
        target: dict[str, float],
    ) -> float:
        normalized_current = RebalanceCalculator._normalize_target_allocation(current)
        normalized_target = RebalanceCalculator._normalize_target_allocation(target)
        buckets = set(normalized_current) | set(normalized_target)
        return max(
            abs(
                normalized_current.get(bucket, 0.0) - normalized_target.get(bucket, 0.0)
            )
            for bucket in buckets
        )


def plan_transfers_to_target(
    *,
    portfolio: Portfolio,
    price: float | Mapping[str, float],
    target_allocation: Mapping[str, float],
) -> list[TransferIntent]:
    """Plan the transfers that move ``portfolio`` onto ``target_allocation``.

    The single rebalance planner: the backtest executor applies it to the model
    portfolio and the live suggestion applies it to a user's holdings, so the
    two cannot disagree about how a target becomes trades. Amounts are gross
    USD; an empty list means the portfolio is already on target.
    """
    deltas = RebalanceCalculator.calculate_deltas(
        portfolio.total_value(price),
        dict(target_allocation),
        portfolio.values_for_allocation_keys(price, target_allocation),
    )
    if not deltas or max(abs(delta) for delta in deltas.values()) <= (
        AT_TARGET_TOLERANCE_USD
    ):
        return []
    return build_bucket_transfers(deltas=deltas)

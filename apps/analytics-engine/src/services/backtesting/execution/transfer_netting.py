"""Shared helpers for converting allocation deltas into transfer intents."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.strategies.base import TransferIntent


@dataclass
class BucketAmount:
    bucket: str
    amount: float


def build_bucket_transfers(
    *,
    deltas: dict[str, float],
    step_plan: dict[str, float] | None = None,
    eps: float = 1e-6,
) -> list[TransferIntent]:
    demand = [
        BucketAmount(
            bucket=bucket,
            amount=_bounded_delta_amount(delta, bucket=bucket, step_plan=step_plan),
        )
        for bucket, delta in sorted(deltas.items())
        if float(delta) > eps
    ]
    supply = [
        BucketAmount(
            bucket=bucket,
            amount=_bounded_delta_amount(-delta, bucket=bucket, step_plan=step_plan),
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


def _bounded_delta_amount(
    delta: float,
    *,
    bucket: str,
    step_plan: dict[str, float] | None,
) -> float:
    value = float(delta)
    if step_plan is None:
        return value
    return min(value, float(step_plan.get(bucket, 0.0)))

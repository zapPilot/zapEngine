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
    demand = _bounded_bucket_amounts(deltas, sign=1.0, step_plan=step_plan, eps=eps)
    supply = _bounded_bucket_amounts(deltas, sign=-1.0, step_plan=step_plan, eps=eps)

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


def _bounded_bucket_amounts(
    deltas: dict[str, float],
    *,
    sign: float,
    step_plan: dict[str, float] | None,
    eps: float,
) -> list[BucketAmount]:
    """Return bounded demand (sign=1) or supply (sign=-1) entries above eps."""
    entries: list[BucketAmount] = []
    for bucket, delta in sorted(deltas.items()):
        magnitude = sign * float(delta)
        if magnitude <= eps:
            continue
        amount = _bounded_delta_amount(magnitude, bucket=bucket, step_plan=step_plan)
        if amount > eps:
            entries.append(BucketAmount(bucket=bucket, amount=amount))
    return entries


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

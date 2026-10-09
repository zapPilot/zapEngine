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
    eps: float = 1e-6,
) -> list[TransferIntent]:
    demand = _bucket_amounts(deltas, sign=1.0, eps=eps)
    supply = _bucket_amounts(deltas, sign=-1.0, eps=eps)

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


def _bucket_amounts(
    deltas: dict[str, float],
    *,
    sign: float,
    eps: float,
) -> list[BucketAmount]:
    """Return demand (sign=1) or supply (sign=-1) entries above eps."""
    entries: list[BucketAmount] = []
    for bucket, delta in sorted(deltas.items()):
        magnitude = sign * float(delta)
        if magnitude > eps:
            entries.append(BucketAmount(bucket=bucket, amount=magnitude))
    return entries

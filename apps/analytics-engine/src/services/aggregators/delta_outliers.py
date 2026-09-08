"""Flag balance changes that look like deposits or withdrawals.

``token_yield_usd`` is a balance change, not a proven return: interest, rewards,
a deposit and a withdrawal all move the same number. Fencing each protocol
position's own day series with the IQR filter separates the routine carry from
the funding spikes, which is what lets the frontend label them differently.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from src.services.strategy.outlier_filter_strategy import (
    IQRFilter,
    OutlierFilterStrategy,
)

OutlierKey = tuple[str, str, str]


def outlier_key(delta: Mapping[str, Any]) -> OutlierKey:
    """Canonical ``(protocol_name, chain, date)`` identity for a delta row.

    Shared by the fence and its consumer so the two can never normalize a
    missing protocol or chain differently and silently stop matching.
    """
    return (
        str(delta.get("protocol_name") or ""),
        str(delta.get("chain") or ""),
        str(delta.get("snapshot_at") or ""),
    )


def flag_outlier_deltas(
    deltas: list[dict[str, Any]],
    strategy: OutlierFilterStrategy = IQRFilter(),
) -> set[OutlierKey]:
    """Return the ``(protocol_name, chain, date)`` keys judged to be spikes.

    Each protocol position is fenced against its own history, so a large but
    routine move on a big position is not flagged merely because another
    position is small. Series shorter than the strategy's minimum sample count
    are left unflagged rather than guessed at.
    """
    by_series: dict[tuple[str, str], dict[str, float]] = {}

    for delta in deltas:
        protocol_name, chain, date = outlier_key(delta)
        if not date:
            continue
        daily_totals = by_series.setdefault((protocol_name, chain), {})
        daily_totals[date] = daily_totals.get(date, 0.0) + float(
            delta.get("token_yield_usd") or 0.0
        )

    flagged: set[OutlierKey] = set()
    for (protocol_name, chain), daily_totals in by_series.items():
        _kept, outliers = strategy.filter(daily_totals)
        flagged.update((protocol_name, chain, item.date) for item in outliers)

    return flagged

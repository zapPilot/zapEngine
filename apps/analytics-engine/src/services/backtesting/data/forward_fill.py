"""Pure forward-fill helpers for stale market data — no I/O, easy to unit-test."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True, slots=True)
class StaleFeature:
    feature_name: str
    asset: str
    requested_date: date
    effective_date: date
    lag_days: int


@dataclass(frozen=True, slots=True)
class ForwardFillResult:
    values: dict[str, Any]
    stale_features: list[StaleFeature]
    # Largest observed lag across stale_features (0 when all features are current).
    max_lag_days: int


def forward_fill_for_date(
    feature_history: dict[str, dict[date, Any]],
    target_date: date,
    asset: str,
    max_lag_days: int,
) -> ForwardFillResult | None:
    """Return feature values for target_date, falling back to most recent within tolerance.

    For each feature in ``feature_history``:

    - If ``target_date`` has a value, use it (lag=0).
    - Otherwise, find the most recent date strictly before ``target_date`` whose
      lag is at most ``max_lag_days`` and use that value.
    - If neither exists, return ``None`` — data is either missing entirely or too
      stale, both of which should signal upstream to treat the request as
      service-unavailable rather than fabricating values.
    """
    values: dict[str, Any] = {}
    stale_features: list[StaleFeature] = []

    for feature_name, values_by_date in feature_history.items():
        if target_date in values_by_date:
            values[feature_name] = values_by_date[target_date]
            continue

        # Find the most recent date strictly before target_date within tolerance.
        # Iterating sorted descending lets us break early on the first candidate.
        closest_date: date | None = None
        closest_lag = 0
        for d in sorted(values_by_date.keys(), reverse=True):
            lag = (target_date - d).days
            if lag <= 0:
                # Future or same-day dates are unusable as forward-fill sources.
                continue
            if lag > max_lag_days:
                # All earlier dates have an even larger lag — stop scanning.
                break
            closest_date = d
            closest_lag = lag
            break

        if closest_date is None:
            return None

        values[feature_name] = values_by_date[closest_date]
        stale_features.append(
            StaleFeature(
                feature_name=feature_name,
                asset=asset,
                requested_date=target_date,
                effective_date=closest_date,
                lag_days=closest_lag,
            )
        )

    observed_max_lag = max(
        (sf.lag_days for sf in stale_features),
        default=0,
    )
    return ForwardFillResult(
        values=values,
        stale_features=stale_features,
        max_lag_days=observed_max_lag,
    )

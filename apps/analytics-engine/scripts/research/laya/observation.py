"""Compact, deterministic market observation for the Laya research policy."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState

OBSERVATION_VERSION = "obs_v1"
DEFAULT_MAX_CHARS = 900
_BUCKETS = ("stable", "spy", "btc", "eth")


class ObservationTooLongError(ValueError):
    """Raised instead of allowing Laya to silently truncate the state."""


@dataclass(frozen=True)
class TrailingCloses:
    spy: Sequence[float] = ()
    btc: Sequence[float] = ()
    eth: Sequence[float] = ()

    def for_bucket(self, bucket: str) -> Sequence[float]:
        if bucket == "spy":
            return self.spy
        if bucket == "btc":
            return self.btc
        if bucket == "eth":
            return self.eth
        return ()


def _round(value: float | int | None, digits: int = 1) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _pct(value: float | int | None) -> float | None:
    if value is None:
        return None
    return _round(float(value) * 100.0)


def _compact(mapping: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in mapping.items():
        if value is None:
            continue
        if isinstance(value, Mapping):
            nested = _compact(value)
            if nested:
                result[key] = nested
        else:
            result[key] = value
    return result


def _r7(prices: Sequence[float]) -> float | None:
    if len(prices) < 8:
        return None
    start = float(prices[-8])
    end = float(prices[-1])
    if start <= 0.0:
        return None
    return end / start - 1.0


def _asset_payload(
    state: DmaMarketState | None,
    trailing: Sequence[float],
) -> dict[str, Any] | None:
    if state is None:
        return None
    technical = state.technical
    return _compact(
        {
            "dma%": _pct(state.dma_distance),
            "z": _round(technical.bollinger_zscore_20),
            "r7": _pct(_r7(trailing)),
            "r30": _pct(technical.momentum_30d),
            "r90": _pct(technical.momentum_90d),
            "vol": _pct(technical.realized_volatility_20d),
            "rsi": _round(technical.rsi_14),
        }
    )


def _fgi_payload(state: FlatMinimumState) -> dict[str, Any] | None:
    source = next(
        (
            candidate
            for candidate in (state.btc_dma_state, state.eth_dma_state)
            if candidate is not None and candidate.fgi_value is not None
        ),
        None,
    )
    if source is None:
        return None
    return _compact(
        {
            "v": _round(source.fgi_value),
            "reg": source.fgi_regime,
            "slope": _round(source.fgi_slope),
        }
    )


def _macro_payload(state: FlatMinimumState) -> dict[str, Any] | None:
    source = state.spy_dma_state
    if source is None:
        return None
    payload = _compact(
        {
            "v": _round(source.macro_fear_greed_value),
            "lab": source.macro_fear_greed_regime,
        }
    )
    return payload or None


def _allocation_percentages(allocation: Mapping[str, float]) -> dict[str, int]:
    return {
        bucket: int(round(max(0.0, float(allocation.get(bucket, 0.0))) * 100.0))
        for bucket in _BUCKETS
    }


def build_observation(
    state: FlatMinimumState,
    *,
    prior_units: Mapping[str, int] | None = None,
    trailing: TrailingCloses | None = None,
) -> dict[str, Any]:
    """Build an as-of-date observation without dates or absolute USD prices."""

    trailing = trailing or TrailingCloses()
    ratio = state.eth_btc_ratio_state
    ratio_distance = None
    if ratio is not None and ratio.ratio_dma_200 > 0.0:
        ratio_distance = ratio.ratio / ratio.ratio_dma_200 - 1.0

    observation: dict[str, Any] = {
        "fgi": _fgi_payload(state),
        "macro": _macro_payload(state),
        "spy": _asset_payload(state.spy_dma_state, trailing.spy),
        "btc": _asset_payload(state.btc_dma_state, trailing.btc),
        "eth": _asset_payload(state.eth_dma_state, trailing.eth),
        "eth_btc_dma%": _pct(ratio_distance),
        "alloc": _allocation_percentages(state.current_asset_allocation),
        "prior": (
            None
            if prior_units is None
            else {bucket: int(prior_units.get(bucket, 0)) * 5 for bucket in _BUCKETS}
        ),
    }
    return _compact(observation)


def serialize_observation(observation: Mapping[str, Any]) -> str:
    return json.dumps(observation, separators=(",", ":"), ensure_ascii=True)


def assert_within_budget(
    serialized: str,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> None:
    if len(serialized) > max_chars:
        raise ObservationTooLongError(
            f"Laya observation is {len(serialized)} chars; budget is {max_chars}"
        )


__all__ = [
    "DEFAULT_MAX_CHARS",
    "OBSERVATION_VERSION",
    "ObservationTooLongError",
    "TrailingCloses",
    "assert_within_budget",
    "build_observation",
    "serialize_observation",
]

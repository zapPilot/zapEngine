"""Shared ratio-state helpers for ETH/BTC rotation signals."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.signals.dma_gated_fgi.types import (
    CrossEvent,
    DmaCooldownState,
    Zone,
)


@dataclass(frozen=True)
class EthBtcRatioState:
    ratio: float
    ratio_dma_200: float
    zone: Zone
    cross_event: CrossEvent | None
    actionable_cross_event: CrossEvent | None
    cooldown_state: DmaCooldownState


def classify_ratio_zone(
    *,
    ratio: float | None,
    ratio_dma: float | None,
) -> Zone | None:
    if ratio is None or ratio_dma is None or ratio_dma <= 0.0:
        return None
    if ratio > ratio_dma:
        return "above"
    if ratio < ratio_dma:
        return "below"
    return "at"


def detect_ratio_cross(
    *,
    prev_zone: Zone | None,
    current_zone: Zone | None,
    cross_on_touch: bool = True,
) -> CrossEvent | None:
    if prev_zone is None or current_zone is None:
        return None
    down_zones = {"at", "below"} if cross_on_touch else {"below"}
    up_zones = {"at", "above"} if cross_on_touch else {"above"}
    if prev_zone == "above" and current_zone in down_zones:
        return "cross_down"
    if prev_zone == "below" and current_zone in up_zones:
        return "cross_up"
    return None


__all__ = [
    "EthBtcRatioState",
    "classify_ratio_zone",
    "detect_ratio_cross",
]

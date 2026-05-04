"""Typed contracts for the dedicated DMA-gated FGI runtime."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from src.services.backtesting.signals.dma_gated_fgi.regime_classifier import (
    RegimeSource,
)

Zone = Literal["above", "below", "at"]
BlockedZone = Literal["above", "below"]
CrossEvent = Literal["cross_down", "cross_up"]
AthEvent = Literal["token_ath", "portfolio_ath", "both_ath"]
SignalId = Literal["dma_gated_fgi"]


@dataclass(frozen=True)
class DmaCooldownState:
    """Current cooldown gate state."""

    active: bool
    remaining_days: int
    blocked_zone: BlockedZone | None


@dataclass(frozen=True)
class DmaMarketState:
    """Typed market state extracted before policy evaluation."""

    signal_id: SignalId
    dma_200: float
    dma_distance: float
    zone: Zone
    cross_event: CrossEvent | None
    actionable_cross_event: CrossEvent | None
    cooldown_state: DmaCooldownState
    fgi_value: float | None
    fgi_slope: float
    fgi_regime: str
    regime_source: RegimeSource
    ath_event: AthEvent | None
    asset_symbol: str | None = None
    macro_fear_greed_value: float | None = None
    macro_fear_greed_regime: str | None = None
    macro_fear_greed_regime_source: RegimeSource | None = None

    @property
    def price_above_dma(self) -> bool:
        return self.zone == "above"


@dataclass(frozen=True)
class DmaRuntimeDebugState:
    """Explicit testing/debug snapshot for the DMA signal runtime."""

    last_observed_zone: Zone | None
    last_actionable_zone: Zone | None
    cooldown_end_date: date | None
    cooldown_blocked_zone: BlockedZone | None
    fgi_ema_prev: float | None
    fgi_ema_current: float | None


__all__ = [
    "AthEvent",
    "BlockedZone",
    "CrossEvent",
    "DmaCooldownState",
    "DmaMarketState",
    "DmaRuntimeDebugState",
    "SignalId",
    "Zone",
]

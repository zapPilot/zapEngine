"""Typed domain result contracts for backtesting strategies."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.strategies.base import TransferIntent


@dataclass(frozen=True, slots=True)
class DmaSignalDiagnostics:
    dma_200: float | None = None
    distance: float | None = None
    zone: str | None = None
    cross_event: str | None = None
    cooldown_active: bool | None = None
    cooldown_remaining_days: int | None = None
    cooldown_blocked_zone: str | None = None
    fgi_slope: float | None = None
    outer_dma_asset: str | None = None


@dataclass(frozen=True, slots=True)
class RatioSignalDiagnostics:
    ratio: float | None = None
    ratio_dma_200: float | None = None
    distance: float | None = None
    zone: str | None = None
    cross_event: str | None = None
    cooldown_active: bool | None = None
    cooldown_remaining_days: int | None = None
    cooldown_blocked_zone: str | None = None


@dataclass(frozen=True, slots=True)
class SignalObservation:
    signal_id: str
    regime: str
    confidence: float
    raw_value: float | None = None
    ath_event: str | None = None
    dma: DmaSignalDiagnostics | None = None
    ratio: RatioSignalDiagnostics | None = None


@dataclass(frozen=True, slots=True)
class ExecutionPluginDiagnostic:
    plugin_id: str
    payload: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ExecutionOutcome:
    event: str | None
    transfers: list[TransferIntent] = field(default_factory=list)
    blocked_reason: str | None = None
    step_count: int = 0
    steps_remaining: int = 0
    interval_days: int = 0
    plugin_diagnostics: tuple[ExecutionPluginDiagnostic, ...] = ()


@dataclass(frozen=True, slots=True)
class StrategySnapshot:
    signal: SignalObservation | None
    decision: AllocationIntent
    execution: ExecutionOutcome

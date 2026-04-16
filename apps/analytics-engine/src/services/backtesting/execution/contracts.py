"""Contracts shared by backtesting execution components."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import DecisionAction


@dataclass(frozen=True, slots=True)
class ExecutionHints:
    """Execution-facing hints derived from signal and policy outputs."""

    signal_id: str
    current_regime: str
    signal_value: float | None
    signal_confidence: float
    decision_score: float
    decision_action: DecisionAction
    dma_distance: float | None = None
    fgi_slope: float | None = None
    buy_strength: float | None = None
    enable_buy_gate: bool = False
    reset_buy_gate: bool = False
    target_spot_asset: str | None = None
